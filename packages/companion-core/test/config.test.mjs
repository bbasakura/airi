import assert from 'node:assert/strict'
import path from 'node:path'

import test from 'vitest'

import { loadConfig, normalizeHttpUrl, publicConfig } from '../src/config.mjs'
import { createCompanionEvent, serializeSse } from '../src/protocol.mjs'

test('normalizes provider URLs and clamps numeric configuration', () => {
  assert.equal(normalizeHttpUrl('http://127.0.0.1:10100/v1///', 'http://unused'), 'http://127.0.0.1:10100/v1')

  const config = loadConfig({
    COMPANION_PORT: '99999',
    TUZI_BASE_URL: 'http://localhost:10100/v1/',
    TUZI_MODEL: 'tuzi/test',
    TUZI_API_KEY: 'secret',
    TUZI_MAX_TOKENS: '0',
    VOICEBOX_BASE_URL: 'http://localhost:17493/',
    COMPANION_SPEECH_ENABLED: 'false',
  })

  assert.equal(config.server.port, 65535)
  assert.equal(config.chat.baseUrl, 'http://localhost:10100/v1')
  assert.equal(config.chat.maxTokens, 1)
  assert.equal(config.conversation.speechEnabled, false)
  assert.deepEqual(publicConfig(config).chat, {
    baseUrl: 'http://localhost:10100/v1',
    model: 'tuzi/test',
    hasApiKey: true,
    maxTokens: 1,
  })
  assert.equal(JSON.stringify(publicConfig(config)).includes('secret'), false)
})

test('resolves mutable runtime directories beneath the Erii root', () => {
  const rootDir = path.resolve('D:\\soft\\Erii')
  const sharedModelsDir = path.resolve('D:\\shared-models')
  const config = loadConfig({
    ERII_ROOT: rootDir,
    ERII_MODELS_DIR: sharedModelsDir,
    ERII_CACHE_DIR: 'runtime-cache',
  })

  assert.deepEqual(config.runtime, {
    rootDir,
    dataDir: path.join(rootDir, 'data'),
    modelsDir: sharedModelsDir,
    cacheDir: path.join(rootDir, 'runtime-cache'),
    logsDir: path.join(rootDir, 'logs'),
    configDir: path.join(rootDir, 'config'),
  })
  assert.deepEqual(config.avatar, {
    modelPath: path.join(rootDir, 'assets', 'local', 'frieren', 'model.vrm'),
  })
  assert.equal('runtime' in publicConfig(config), false)
  assert.equal('avatar' in publicConfig(config), false)
})

test('serializes normalized companion events as SSE', () => {
  const event = createCompanionEvent(
    'assistant.text.delta',
    {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      sequence: 2,
    },
    { delta: '你好' },
    () => new Date('2026-07-29T00:00:00.000Z'),
  )

  assert.equal(
    serializeSse(event),
    `id: turn-1:2\nevent: assistant.text.delta\ndata: ${JSON.stringify(event)}\n\n`,
  )
})
