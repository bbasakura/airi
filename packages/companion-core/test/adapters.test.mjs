import assert from 'node:assert/strict'
import test from 'node:test'

import { OpenAICompatibleChatClient, parseOpenAIEventStream } from '../src/adapters/openai-compatible.mjs'
import { VoiceboxClient } from '../src/adapters/voicebox.mjs'

function streamFromStrings(parts) {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const part of parts)
        controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
}

async function collect(iterable) {
  const values = []
  for await (const value of iterable)
    values.push(value)
  return values
}

test('parses OpenAI SSE events across arbitrary chunk boundaries', async () => {
  const stream = streamFromStrings([
    'data: {"choices":[{"delta":{"content":"你"}}]}\n',
    '\ndata: {"choices":[{"delta":{"content":"好"}}]',
    '}\n\ndata: [DONE]\n\n',
  ])

  const events = await collect(parseOpenAIEventStream(stream))
  assert.equal(events.length, 2)
  assert.equal(events[0].choices[0].delta.content, '你')
  assert.equal(events[1].choices[0].delta.content, '好')
})

test('streams Tuzi-compatible deltas with the expected OpenAI request', async () => {
  let request
  const client = new OpenAICompatibleChatClient({
    baseUrl: 'http://127.0.0.1:10100/v1',
    model: 'tuzi/gpt-5.6-sol',
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      request = { url, options }
      return new Response(streamFromStrings([
        'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
        'data: [DONE]\n\n',
      ]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })

  const deltas = await collect(client.streamChat([{ role: 'user', content: 'hi' }]))
  assert.deepEqual(deltas, ['你好'])
  assert.equal(request.url, 'http://127.0.0.1:10100/v1/chat/completions')
  assert.equal(request.options.headers.Authorization, 'Bearer test-key')
  assert.deepEqual(JSON.parse(request.options.body), {
    model: 'tuzi/gpt-5.6-sol',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
    max_tokens: 300,
  })
})

test('transcribes audio and waits for a Voicebox speech job', async () => {
  const calls = []
  let historyCalls = 0
  const voicebox = new VoiceboxClient({
    baseUrl: 'http://127.0.0.1:17493',
    profile: 'xiaoman',
    pollIntervalMs: 1,
    maxPollAttempts: 3,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      if (url.endsWith('/transcribe'))
        return Response.json({ text: '  你好呀  ' })
      if (url.endsWith('/profiles')) {
        return Response.json([
          { id: 'profile-1', preset_voice_id: 'xiaoman', name: '小满' },
        ])
      }
      if (url.endsWith('/speak'))
        return Response.json({ id: 'job-1' })
      if (url.endsWith('/history/job-1')) {
        historyCalls += 1
        return Response.json({ status: historyCalls === 1 ? 'pending' : 'completed' })
      }
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  const transcript = await voicebox.transcribe({
    audio: new Uint8Array([1, 2, 3]),
  })
  const speech = await voicebox.speak('你好呀')

  assert.equal(transcript, '你好呀')
  assert.deepEqual(speech, {
    id: 'job-1',
    status: 'completed',
    audioUrl: 'http://127.0.0.1:17493/audio/job-1',
    profile: 'profile-1',
    engine: 'kokoro',
    details: { status: 'completed' },
  })

  const transcribeCall = calls.find(call => call.url.endsWith('/transcribe'))
  assert.equal(transcribeCall.options.body instanceof FormData, true)
  assert.equal(transcribeCall.options.body.get('model'), 'base')

  const speakCall = calls.find(call => call.url.endsWith('/speak'))
  assert.deepEqual(JSON.parse(speakCall.options.body), {
    text: '你好呀',
    profile: 'profile-1',
    language: 'zh',
    engine: 'kokoro',
  })
})

test('selects an engine-compatible profile when no Voicebox profile is configured', async () => {
  let speakBody
  const voicebox = new VoiceboxClient({
    baseUrl: 'http://127.0.0.1:17493',
    engine: 'kokoro',
    pollIntervalMs: 1,
    fetchImpl: async (url, options = {}) => {
      if (url.endsWith('/profiles')) {
        return Response.json([
          { id: 'cloned-1', voice_type: 'cloned', default_engine: 'qwen' },
          { id: 'preset-1', voice_type: 'preset', preset_engine: 'kokoro', default_engine: 'kokoro' },
        ])
      }
      if (url.endsWith('/speak')) {
        speakBody = JSON.parse(options.body)
        return Response.json({ id: 'job-1' })
      }
      if (url.endsWith('/history/job-1'))
        return Response.json({ status: 'completed' })
      throw new Error(`Unexpected URL: ${url}`)
    },
  })

  const speech = await voicebox.speak('你好')
  assert.equal(speech.profile, 'preset-1')
  assert.equal(speech.engine, 'kokoro')
  assert.equal(speakBody.profile, 'preset-1')
  assert.equal(speakBody.engine, 'kokoro')
})
