import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'

import { loadConfig } from '../src/config.mjs'
import { createCompanionEvent } from '../src/protocol.mjs'
import { createCompanionServer } from '../src/server.mjs'

async function startTestServer(options) {
  const server = createCompanionServer(options)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

test('serves health and streamed turn events to loopback clients', async (t) => {
  const config = loadConfig({})
  const chat = {
    async health() {
      return { ok: true, model: 'test' }
    },
  }
  const voicebox = {
    async health() {
      return { ok: true, profiles: 1 }
    },
  }
  const runtime = {
    async *runTextTurn({ conversationId, text }) {
      yield createCompanionEvent('turn.started', {
        conversationId,
        turnId: 'turn-1',
        sequence: 1,
      })
      yield createCompanionEvent('turn.completed', {
        conversationId,
        turnId: 'turn-1',
        sequence: 2,
      }, { text })
    },
    interrupt() {
      return false
    },
  }
  const { server, baseUrl } = await startTestServer({
    config,
    chat,
    voicebox,
    runtime,
  })
  t.after(() => server.close())

  const health = await (await fetch(`${baseUrl}/health`)).json()
  assert.equal(health.status, 'ok')

  const response = await fetch(`${baseUrl}/v1/conversations/demo/turns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
    },
    body: JSON.stringify({ text: '你好', speak: false }),
  })
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/event-stream/)
  assert.match(body, /event: turn\.started/)
  assert.match(body, /event: turn\.completed/)
})

test('rejects non-loopback browser origins', async (t) => {
  const { server, baseUrl } = await startTestServer({
    config: loadConfig({}),
    chat: { health: async () => ({ ok: true }) },
    voicebox: { health: async () => ({ ok: true }) },
    runtime: { interrupt: () => false },
  })
  t.after(() => server.close())

  const response = await fetch(`${baseUrl}/health`, {
    headers: {
      Origin: 'https://example.com',
    },
  })
  const body = await response.json()
  assert.equal(response.status, 403)
  assert.equal(body.error.code, 'ORIGIN_NOT_ALLOWED')
})
