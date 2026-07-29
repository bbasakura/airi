import { randomUUID } from 'node:crypto'

import { CompanionError, isAbortError, toErrorPayload } from '../errors.mjs'
import { createCompanionEvent } from '../protocol.mjs'

export class ConversationRuntime {
  constructor({
    chat,
    voicebox,
    systemPrompt,
    maxHistoryMessages = 20,
    speechEnabled = true,
    now = () => new Date(),
    idFactory = randomUUID,
  }) {
    this.chat = chat
    this.voicebox = voicebox
    this.systemPrompt = systemPrompt
    this.maxHistoryMessages = maxHistoryMessages
    this.speechEnabled = speechEnabled
    this.now = now
    this.idFactory = idFactory
    this.activeTurns = new Map()
    this.histories = new Map()
  }

  getHistory(conversationId) {
    return structuredClone(this.#historyFor(conversationId))
  }

  clearHistory(conversationId) {
    this.interrupt(conversationId, 'history-cleared')
    this.histories.delete(conversationId)
  }

  interrupt(conversationId, reason = 'client-request') {
    const active = this.activeTurns.get(conversationId)
    if (!active)
      return false

    active.controller.abort(new DOMException(reason, 'AbortError'))
    return true
  }

  async *runTextTurn({ conversationId, text, speak = true }) {
    const normalizedText = String(text || '').trim()
    if (!normalizedText)
      throw new CompanionError('Text is required', { code: 'TEXT_REQUIRED', status: 400 })

    const turn = this.#beginTurn(conversationId, 'text')
    try {
      yield this.#event(turn, 'turn.started', { inputType: 'text' })
      yield this.#event(turn, 'avatar.state.changed', { state: 'thinking' })
      yield* this.#completeTextTurn(turn, normalizedText, speak)
    }
    catch (error) {
      yield* this.#handleFailure(turn, error)
    }
    finally {
      this.#releaseTurn(turn)
    }
  }

  async *runVoiceTurn({
    conversationId,
    audio,
    filename = 'input.wav',
    contentType = 'audio/wav',
    speak = true,
  }) {
    const turn = this.#beginTurn(conversationId, 'voice')
    try {
      yield this.#event(turn, 'turn.started', { inputType: 'voice' })
      yield this.#event(turn, 'avatar.state.changed', { state: 'listening' })

      const transcript = await this.voicebox.transcribe({
        audio,
        filename,
        contentType,
        signal: turn.controller.signal,
      })
      this.#assertCurrent(turn)

      yield this.#event(turn, 'user.transcript.completed', { text: transcript })
      yield this.#event(turn, 'avatar.state.changed', { state: 'thinking' })
      yield* this.#completeTextTurn(turn, transcript, speak)
    }
    catch (error) {
      yield* this.#handleFailure(turn, error)
    }
    finally {
      this.#releaseTurn(turn)
    }
  }

  async *#completeTextTurn(turn, text, speak) {
    const history = this.#historyFor(turn.conversationId)
    history.push({ role: 'user', content: text })
    this.#trimHistory(history)

    let reply = ''
    for await (const delta of this.chat.streamChat(history, {
      signal: turn.controller.signal,
    })) {
      this.#assertCurrent(turn)
      reply += delta
      yield this.#event(turn, 'assistant.text.delta', { delta })
    }

    this.#assertCurrent(turn)
    if (!reply.trim()) {
      throw new CompanionError('Chat provider returned an empty reply', {
        code: 'EMPTY_ASSISTANT_REPLY',
        status: 502,
      })
    }

    history.push({ role: 'assistant', content: reply })
    this.#trimHistory(history)
    yield this.#event(turn, 'assistant.text.completed', { text: reply })

    let audioId
    let speechError
    if (speak && this.speechEnabled && this.voicebox) {
      const speechRequestId = this.idFactory()
      yield this.#event(turn, 'avatar.state.changed', { state: 'speaking' })
      yield this.#event(turn, 'assistant.speech.started', { speechRequestId })

      try {
        const speech = await this.voicebox.speak(reply, {
          signal: turn.controller.signal,
        })
        this.#assertCurrent(turn)

        audioId = speech.id
        yield this.#event(turn, 'assistant.speech.ready', {
          speechRequestId,
          audioId: speech.id,
          audioPath: `/v1/audio/${encodeURIComponent(speech.id)}`,
          profile: speech.profile,
          engine: speech.engine,
        })
      }
      catch (error) {
        if (turn.controller.signal.aborted || isAbortError(error))
          throw error
        speechError = toErrorPayload(error)
        yield this.#event(turn, 'assistant.speech.failed', {
          speechRequestId,
          error: speechError,
        })
      }
    }

    yield this.#event(turn, 'avatar.state.changed', { state: 'idle' })
    yield this.#event(turn, 'turn.completed', {
      text: reply,
      ...(audioId ? { audioId } : {}),
      ...(speechError ? { speechError } : {}),
    })
  }

  *#handleFailure(turn, error) {
    const interrupted = turn.controller.signal.aborted || isAbortError(error)
    if (interrupted) {
      if (this.#isCurrent(turn))
        yield this.#event(turn, 'avatar.state.changed', { state: 'idle' })
      yield this.#event(turn, 'turn.interrupted', {
        reason: turn.controller.signal.reason?.message || 'interrupted',
      })
      return
    }

    if (this.#isCurrent(turn))
      yield this.#event(turn, 'avatar.state.changed', { state: 'idle' })
    yield this.#event(turn, 'turn.failed', { error: toErrorPayload(error) })
  }

  #beginTurn(conversationId, inputType) {
    const normalizedId = String(conversationId || '').trim()
    if (!normalizedId)
      throw new CompanionError('Conversation id is required', { code: 'CONVERSATION_ID_REQUIRED', status: 400 })

    this.interrupt(normalizedId, 'superseded-by-new-turn')
    const turn = {
      conversationId: normalizedId,
      turnId: this.idFactory(),
      inputType,
      sequence: 0,
      controller: new AbortController(),
    }
    this.activeTurns.set(normalizedId, turn)
    return turn
  }

  #historyFor(conversationId) {
    let history = this.histories.get(conversationId)
    if (!history) {
      history = [{ role: 'system', content: this.systemPrompt }]
      this.histories.set(conversationId, history)
    }
    return history
  }

  #trimHistory(history) {
    const systemMessage = history[0]?.role === 'system' ? history[0] : undefined
    const messages = systemMessage ? history.slice(1) : history
    const recent = messages.slice(-this.maxHistoryMessages)
    history.splice(0, history.length, ...(systemMessage ? [systemMessage] : []), ...recent)
  }

  #event(turn, type, payload = {}) {
    turn.sequence += 1
    return createCompanionEvent(
      type,
      {
        conversationId: turn.conversationId,
        turnId: turn.turnId,
        sequence: turn.sequence,
      },
      payload,
      this.now,
    )
  }

  #assertCurrent(turn) {
    if (!this.#isCurrent(turn) || turn.controller.signal.aborted)
      throw turn.controller.signal.reason || new DOMException('Stale turn', 'AbortError')
  }

  #isCurrent(turn) {
    return this.activeTurns.get(turn.conversationId) === turn
  }

  #releaseTurn(turn) {
    if (this.#isCurrent(turn))
      this.activeTurns.delete(turn.conversationId)
  }
}
