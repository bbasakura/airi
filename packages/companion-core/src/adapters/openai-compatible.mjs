import { CompanionError, createUpstreamError, isAbortError } from '../errors.mjs'

function extractText(value) {
  if (typeof value === 'string')
    return value

  if (!Array.isArray(value))
    return ''

  return value
    .map((part) => {
      if (typeof part === 'string')
        return part
      if (part?.type === 'text')
        return part.text || ''
      return ''
    })
    .join('')
}

export async function* parseOpenAIEventStream(stream, signal) {
  if (!stream)
    throw new CompanionError('Chat response did not include a body', { code: 'EMPTY_UPSTREAM_BODY', status: 502 })

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted)
        throw signal.reason || new DOMException('Aborted', 'AbortError')

      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })

      const lines = buffer.split(/\r?\n/)
      buffer = done ? '' : lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith('data:'))
          continue

        const payload = line.slice(5).trim()
        if (!payload)
          continue
        if (payload === '[DONE]')
          return

        try {
          yield JSON.parse(payload)
        }
        catch (error) {
          throw new CompanionError('Chat provider returned invalid SSE JSON', {
            code: 'INVALID_UPSTREAM_STREAM',
            status: 502,
            cause: error,
          })
        }
      }

      if (done)
        return
    }
  }
  finally {
    reader.releaseLock()
  }
}

export class OpenAICompatibleChatClient {
  constructor({
    baseUrl,
    model,
    apiKey = '',
    maxTokens = 300,
    fetchImpl = globalThis.fetch,
  }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.model = model
    this.apiKey = apiKey
    this.maxTokens = maxTokens
    this.fetch = fetchImpl
  }

  headers(extra = {}) {
    return {
      Accept: 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...extra,
    }
  }

  async health(signal) {
    const response = await this.fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
      signal,
    })
    if (!response.ok)
      throw await createUpstreamError(response, 'Chat provider')

    const data = await response.json()
    return {
      ok: true,
      model: this.model,
      models: Array.isArray(data?.data) ? data.data.length : undefined,
    }
  }

  async *streamChat(messages, { signal, maxTokens = this.maxTokens } = {}) {
    let response
    try {
      response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          max_tokens: maxTokens,
        }),
        signal,
      })
    }
    catch (error) {
      if (signal?.aborted || isAbortError(error))
        throw error
      throw new CompanionError(`Unable to reach chat provider: ${error.message}`, {
        code: 'UPSTREAM_UNAVAILABLE',
        status: 502,
        cause: error,
      })
    }

    if (!response.ok)
      throw await createUpstreamError(response, 'Chat provider')

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await response.json()
      const text = extractText(data?.choices?.[0]?.message?.content)
      if (text)
        yield text
      return
    }

    for await (const event of parseOpenAIEventStream(response.body, signal)) {
      if (event?.error) {
        throw new CompanionError(event.error.message || 'Chat provider stream failed', {
          code: 'UPSTREAM_STREAM_ERROR',
          status: 502,
        })
      }

      const text = extractText(event?.choices?.[0]?.delta?.content)
      if (text)
        yield text
    }
  }
}

export class FallbackChatClient {
  constructor({ primary, fallback }) {
    this.primary = primary
    this.fallback = fallback
  }

  async health(signal) {
    try {
      const res = await this.primary.health(signal)
      if (res.ok)
        return res
    }
    catch (error) {
      if (!this.fallback)
        throw error
    }

    if (this.fallback) {
      const fallbackRes = await this.fallback.health(signal)
      return {
        ...fallbackRes,
        fallbackActive: true,
      }
    }

    return { ok: false, error: 'All chat clients unavailable' }
  }

  async *streamChat(messages, options = {}) {
    let started = false
    try {
      for await (const delta of this.primary.streamChat(messages, options)) {
        started = true
        yield delta
      }
    }
    catch (error) {
      if (started || !this.fallback || options.signal?.aborted || isAbortError(error))
        throw error
      console.warn('[Companion Core] Primary chat provider failed, falling back to local model:', error.message)
      for await (const delta of this.fallback.streamChat(messages, options)) {
        yield delta
      }
    }
  }
}

