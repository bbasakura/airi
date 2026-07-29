import process from 'node:process'

import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import { OpenAICompatibleChatClient } from './adapters/openai-compatible.mjs'
import { VoiceboxClient } from './adapters/voicebox.mjs'
import {
  AvatarEventHub,
  companionEventToAvatarEvent,
  normalizeAvatarEvent,
} from './avatar-protocol.mjs'
import { loadConfig, publicConfig } from './config.mjs'
import { CompanionError, toErrorPayload } from './errors.mjs'
import { serializeSse } from './protocol.mjs'
import { ConversationRuntime } from './runtime/conversation-runtime.mjs'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const CODEX_APP_ORIGIN = /^codex-app:\/\/[\w.~-]*$/i
const MAX_AVATAR_EVENT_BYTES = 64 * 1024

export function originAllowed(origin) {
  if (!origin)
    return true
  if (CODEX_APP_ORIGIN.test(origin))
    return true
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname)
  }
  catch {
    return false
  }
}

export function hostAllowed(hostHeader) {
  if (typeof hostHeader !== 'string' || !hostHeader)
    return false
  try {
    const url = new URL(`http://${hostHeader}`)
    return url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
  }
  catch {
    return false
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID, Range, X-Audio-Filename',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  }
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, {
    ...corsHeaders(origin),
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function parseByteRange(value, size) {
  if (!value)
    return undefined

  const match = String(value).match(/^bytes=(\d*)-(\d*)$/)
  if (!match)
    return null

  const [, startText, endText] = match
  if (!startText && !endText)
    return null

  let start
  let end
  if (!startText) {
    const suffixLength = Number.parseInt(endText, 10)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0)
      return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  }
  else {
    start = Number.parseInt(startText, 10)
    end = endText ? Number.parseInt(endText, 10) : size - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start)
    return null

  return {
    start,
    end: Math.min(end, size - 1),
  }
}

async function streamLocalAvatarModel(request, response, origin, modelPath) {
  let modelStat
  try {
    modelStat = await stat(modelPath)
  }
  catch (error) {
    throw new CompanionError('Local avatar model is not installed', {
      code: 'AVATAR_MODEL_NOT_FOUND',
      status: 404,
      cause: error,
    })
  }

  if (!modelStat.isFile()) {
    throw new CompanionError('Local avatar model is not a file', {
      code: 'AVATAR_MODEL_NOT_FOUND',
      status: 404,
    })
  }

  const range = parseByteRange(request.headers.range, modelStat.size)
  if (range === null) {
    response.writeHead(416, {
      ...corsHeaders(origin),
      'Content-Range': `bytes */${modelStat.size}`,
    })
    response.end()
    return
  }

  const status = range ? 206 : 200
  const contentLength = range
    ? range.end - range.start + 1
    : modelStat.size
  const headers = {
    ...corsHeaders(origin),
    'Accept-Ranges': 'bytes',
    'Content-Length': contentLength,
    'Content-Type': 'model/gltf-binary',
  }
  if (range)
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${modelStat.size}`

  response.writeHead(status, headers)
  if (request.method === 'HEAD' || contentLength === 0) {
    response.end()
    return
  }

  const stream = createReadStream(modelPath, range || undefined)
  stream.once('error', error => response.destroy(error))
  stream.pipe(response)
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

async function streamTurn(response, origin, conversationId, runtime, avatarHub, events) {
  response.writeHead(200, {
    ...corsHeaders(origin),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Connection': 'keep-alive',
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
    const avatarEvent = companionEventToAvatarEvent(event)
    if (avatarEvent)
      avatarHub.publish(avatarEvent)
    await writeEvent(response, event)
  }

  completed = true
  response.end()
}

function streamAvatarEvents(response, origin, avatarHub) {
  response.writeHead(200, {
    ...corsHeaders(origin),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  response.flushHeaders()

  const snapshot = avatarHub.snapshot()
  if (snapshot.lastState)
    response.write(serializeSse(snapshot.lastState))

  const unsubscribe = avatarHub.subscribe((event) => {
    if (!response.destroyed)
      response.write(serializeSse(event))
  })
  response.once('close', unsubscribe)
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
  return {
    chat,
    voicebox,
    runtime,
    avatarHub: new AvatarEventHub(),
  }
}

export function createCompanionServer({
  config = loadConfig(),
  fetchImpl = globalThis.fetch,
  chat,
  voicebox,
  runtime,
  avatarHub,
} = {}) {
  const defaults = createDefaultDependencies(config, fetchImpl)
  const dependencies = {
    chat: chat || defaults.chat,
    voicebox: voicebox || defaults.voicebox,
    runtime: runtime || defaults.runtime,
    avatarHub: avatarHub || defaults.avatarHub,
  }

  return createServer(async (request, response) => {
    const origin = request.headers.origin
    if (!hostAllowed(request.headers.host)) {
      sendJson(response, 403, {
        error: {
          code: 'HOST_NOT_ALLOWED',
          message: 'Only loopback Host headers may access the companion sidecar',
        },
      })
      return
    }

    if (!originAllowed(origin)) {
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
          version: '0.2.0',
          protocol: 'companion-events/v1',
          avatarProtocol: 'avatar-events/v1',
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
          avatar: dependencies.avatarHub.snapshot(),
        }, origin)
        return
      }

      if (request.method === 'GET' && url.pathname === '/v1/config') {
        sendJson(response, 200, publicConfig(config), origin)
        return
      }

      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/v1/avatar/model') {
        await streamLocalAvatarModel(
          request,
          response,
          origin,
          config.avatar.modelPath,
        )
        return
      }

      if (request.method === 'GET' && url.pathname === '/v1/avatar/status') {
        sendJson(response, 200, {
          ok: true,
          ...dependencies.avatarHub.snapshot(),
        }, origin)
        return
      }

      if (request.method === 'GET' && url.pathname === '/v1/avatar/events') {
        streamAvatarEvents(response, origin, dependencies.avatarHub)
        return
      }

      if (request.method === 'POST' && url.pathname === '/v1/avatar/events') {
        const body = await readJson(
          request,
          Math.min(config.server.maxJsonBytes, MAX_AVATAR_EVENT_BYTES),
        )
        const normalized = normalizeAvatarEvent(body)
        if (!normalized) {
          throw new CompanionError('Avatar event is invalid', {
            code: 'INVALID_AVATAR_EVENT',
            status: 422,
          })
        }
        const event = dependencies.avatarHub.publish(normalized)
        sendJson(response, 202, { accepted: true, event }, origin)
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
          dependencies.avatarHub,
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
          dependencies.avatarHub,
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
  startCompanionServer(config)
    .then((server) => {
      console.info(`AIRI Companion Core listening at http://${config.server.host}:${config.server.port}`)

      const shutdown = () => server.close()
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
