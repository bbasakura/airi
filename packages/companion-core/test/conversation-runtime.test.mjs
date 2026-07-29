import assert from 'node:assert/strict'
import test from 'node:test'

import { ConversationRuntime } from '../src/runtime/conversation-runtime.mjs'

async function collect(iterable) {
  const values = []
  for await (const value of iterable)
    values.push(value)
  return values
}

test('emits a complete text, speech, and avatar lifecycle', async () => {
  const ids = ['turn-1', 'speech-request-1']
  const chat = {
    async *streamChat(messages) {
      assert.equal(messages.at(-1).content, '你好')
      yield '你'
      yield '好呀'
    },
  }
  const voicebox = {
    async speak(text) {
      assert.equal(text, '你好呀')
      return { id: 'audio-1', profile: 'profile-1' }
    },
  }
  const runtime = new ConversationRuntime({
    chat,
    voicebox,
    systemPrompt: 'system',
    idFactory: () => ids.shift(),
    now: () => new Date('2026-07-29T00:00:00.000Z'),
  })

  const events = await collect(runtime.runTextTurn({
    conversationId: 'conversation-1',
    text: '你好',
  }))

  assert.deepEqual(events.map(event => event.type), [
    'turn.started',
    'avatar.state.changed',
    'assistant.text.delta',
    'assistant.text.delta',
    'assistant.text.completed',
    'avatar.state.changed',
    'assistant.speech.started',
    'assistant.speech.ready',
    'avatar.state.changed',
    'turn.completed',
  ])
  assert.equal(events.find(event => event.type === 'assistant.speech.ready').audioPath, '/v1/audio/audio-1')
  assert.deepEqual(runtime.getHistory('conversation-1'), [
    { role: 'system', content: 'system' },
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好呀' },
  ])
})

test('starting a new turn interrupts the old turn and suppresses stale output', async () => {
  let releaseFirstDelta
  const firstDelta = new Promise(resolve => {
    releaseFirstDelta = resolve
  })
  let nextId = 0
  const chat = {
    async *streamChat(messages, { signal }) {
      const text = messages.at(-1).content
      if (text === '第一句') {
        yield '旧'
        releaseFirstDelta()
        await new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
        yield '不应出现'
        return
      }
      yield '新回复'
    },
  }
  const runtime = new ConversationRuntime({
    chat,
    systemPrompt: 'system',
    speechEnabled: false,
    idFactory: () => `id-${++nextId}`,
  })

  const firstEvents = []
  const firstRun = (async () => {
    for await (const event of runtime.runTextTurn({
      conversationId: 'conversation-1',
      text: '第一句',
      speak: false,
    })) {
      firstEvents.push(event)
    }
  })()

  await firstDelta
  const secondEvents = await collect(runtime.runTextTurn({
    conversationId: 'conversation-1',
    text: '第二句',
    speak: false,
  }))
  await firstRun

  assert.equal(firstEvents.some(event => event.type === 'turn.interrupted'), true)
  assert.equal(firstEvents.some(event => event.delta === '不应出现'), false)
  assert.equal(secondEvents.find(event => event.type === 'turn.completed').text, '新回复')
  assert.equal(runtime.getHistory('conversation-1').some(message => message.content === '旧不应出现'), false)
})

test('keeps a completed text turn when speech synthesis fails', async () => {
  let nextId = 0
  const runtime = new ConversationRuntime({
    chat: {
      async *streamChat() {
        yield '文字仍然成功'
      },
    },
    voicebox: {
      async speak() {
        throw Object.assign(new Error('Voicebox unavailable'), { code: 'UPSTREAM_UNAVAILABLE' })
      },
    },
    systemPrompt: 'system',
    idFactory: () => `id-${++nextId}`,
  })

  const events = await collect(runtime.runTextTurn({
    conversationId: 'conversation-1',
    text: '测试',
  }))

  assert.equal(events.some(event => event.type === 'turn.failed'), false)
  assert.equal(events.some(event => event.type === 'assistant.speech.failed'), true)
  const completed = events.find(event => event.type === 'turn.completed')
  assert.equal(completed.text, '文字仍然成功')
  assert.equal(completed.speechError.code, 'UPSTREAM_UNAVAILABLE')
})
