import { once } from 'node:events'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

import { OpenAICompatibleChatClient } from './adapters/openai-compatible.mjs'
import { VoiceboxClient } from './adapters/voicebox.mjs'
import { loadConfig, publicConfig } from './config.mjs'
import { CompanionError, toErrorPayload } from './errors.mjs'
import { serializeSse } from './protocol.mjs'
import { ConversationRuntime } from './runtime/conversation-runtime.mjs'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

function isAllowedOrigin(origin) {
  if (!origin)
    return true
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname)
  }
  catch {
    return false
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, X-Audio-Filename',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, {
    ...corsHeaders(origin),
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

async function readBody(request, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) {
      throw new CompanionError(`Request body exceeds ${maxBytes} bytes`, {
        code: 'REQUEST_TOO_LARGE',
        status: 413,
      })
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(request, maxBytes) {
  const body = await readBody(request, maxBytes)
  try {
    return body.length ? JSON.parse(body.toString('utf8')) : {}
  }
  catch (error) {
    throw new CompanionError('Request body is not valid JSON', {
      code: 'INVALID_JSON',
      status: 400,
      cause: error,
    })
  }
}

async function writeEvent(response, event) {
  if (!response.write(serializeSse(event)))
    await once(response, 'drain')
}

async function streamTurn(response, origin, conversationId, runtime, events) {
  response.writeHead(200, {
    ...corsHeaders(origin),
    'Content-Type': 'text/event-stream; charset=utf-8',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  response.flushHeaders()

  let completed = false
  response.on('close', () => {
    if (!completed)
      runtime.interrupt(conversationId, 'client-disconnected')
  })

  for await (const event of events) {
    if (response.destroyed)
      break
    await writeEvent(response, event)
  }

  completed = true
  response.end()
}

function conversationRoute(pathname) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)\/(turns|voice-turns|interrupt)$/)
  if (!match)
    return undefined
  return {
    conversationId: decodeURIComponent(match[1]),
    action: match[2],
  }
}

async function healthResult(client) {
  try {
    return await client.health(AbortSignal.timeout(3000))
  }
  catch (error) {
    return {
      ok: false,
      error: toErrorPayload(error),
    }
  }
}

function createDefaultDependencies(config, fetchImpl) {
  const chat = new OpenAICompatibleChatClient({
    ...config.chat,
    fetchImpl,
  })
  const voicebox = new VoiceboxClient({
    ...config.voicebox,
    fetchImpl,
  })
  const runtime = new ConversationRuntime({
    chat,
    voicebox,
    systemPrompt: config.conversation.systemPrompt,
    maxHistoryMessages: config.conversation.maxHistoryMessages,
    speechEnabled: config.conversation.speechEnabled,
  })
  return { chat, voicebox, runtime }
}

export function createCompanionServer({
  config = loadConfig(),
  fetchImpl = globalThis.fetch,
  chat,
  voicebox,
  runtime,
} = {}) {
  const defaults = createDefaultDependencies(config, fetchImpl)
  const dependencies = {
    chat: chat || defaults.chat,
    voicebox: voicebox || defaults.voicebox,
    runtime: runtime || defaults.runtime,
  }

  return createServer(async (request, response) => {
    const origin = request.headers.origin
    if (!isAllowedOrigin(origin)) {
      sendJson(response, 403, {
        error: {
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'Only loopback browser origins may access the companion sidecar',
        },
      }, origin)
      return
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders(origin))
      response.end()
      return
    }

    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')

      if (request.method === 'GET' && url.pathname === '/') {
        sendJson(response, 200, {
          name: 'AIRI Companion Core',
          version: '0.1.0',
          protocol: 'companion-events/v1',
        }, origin)
        return
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        const [chatHealth, voiceboxHealth] = await Promise.all([
          healthResult(dependencies.chat),
          healthResult(dependencies.voicebox),
        ])
        sendJson(response, 200, {
          status: chatHealth.ok && voiceboxHealth.ok ? 'ok' : 'degraded',
          chat: chatHealth,
          voicebox: voiceboxHealth,
        }, origin)
        return
      }

      if (request.method === 'GET' && url.pathname === '/v1/config') {
        sendJson(response, 200, publicConfig(config), origin)
        return
      }

      const audioMatch = url.pathname.match(/^\/v1\/audio\/([^/]+)$/)
      if (request.method === 'GET' && audioMatch) {
        const upstream = await dependencies.voicebox.fetchAudio(
          decodeURIComponent(audioMatch[1]),
          { range: request.headers.range },
        )
        if (!upstream.ok && upstream.status !== 206)
          throw new CompanionError(`Voicebox audio returned HTTP ${upstream.status}`, { code: 'UPSTREAM_ERROR', status: 502 })

        const headers = {
          ...corsHeaders(origin),
        }
        for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          const value = upstream.headers.get(name)
          if (value)
            headers[name] = value
        }
        response.writeHead(upstream.status, headers)
        if (upstream.body)
          Readable.fromWeb(upstream.body).pipe(response)
        else
          response.end()
        return
      }

      const route = conversationRoute(url.pathname)
      if (request.method === 'POST' && route?.action === 'turns') {
        const body = await readJson(request, config.server.maxJsonBytes)
        await streamTurn(
          response,
          origin,
          route.conversationId,
          dependencies.runtime,
          dependencies.runtime.runTextTurn({
            conversationId: route.conversationId,
            text: body.text,
            speak: body.speak !== false,
          }),
        )
        return
      }

      if (request.method === 'POST' && route?.action === 'voice-turns') {
        const audio = await readBody(request, config.server.maxAudioBytes)
        if (!audio.length)
          throw new CompanionError('Audio body is required', { code: 'AUDIO_REQUIRED', status: 400 })

        await streamTurn(
          response,
          origin,
          route.conversationId,
          dependencies.runtime,
          dependencies.runtime.runVoiceTurn({
            conversationId: route.conversationId,
            audio,
            filename: request.headers['x-audio-filename'] || url.searchParams.get('filename') || 'input.wav',
            contentType: String(request.headers['content-type'] || 'audio/wav').split(';')[0],
            speak: url.searchParams.get('speak') !== 'false',
          }),
        )
        return
      }

      if (request.method === 'POST' && route?.action === 'interrupt') {
        sendJson(response, 200, {
          interrupted: dependencies.runtime.interrupt(route.conversationId),
        }, origin)
        return
      }

      sendJson(response, 404, {
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
        },
      }, origin)
    }
    catch (error) {
      if (response.headersSent) {
        response.destroy(error)
        return
      }
      sendJson(response, error.status || 500, {
        error: toErrorPayload(error),
      }, origin)
    }
  })
}

export async function startCompanionServer(config = loadConfig()) {
  const server = createCompanionServer({ config })
  server.listen(config.server.port, config.server.host)
  await once(server, 'listening')
  return server
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isEntrypoint) {
  const config = loadConfig()
  const server = await startCompanionServer(config)
  console.log(`AIRI Companion Core listening at http://${config.server.host}:${config.server.port}`)

  const shutdown = () => server.close()
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
