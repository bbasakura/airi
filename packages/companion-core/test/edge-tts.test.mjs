import assert from 'node:assert/strict'
import path from 'node:path'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

import { rm, stat } from 'node:fs/promises'

import { EdgeTTSClient } from '../src/adapters/edge-tts.mjs'
import { loadConfig } from '../src/config.mjs'

test('synthesizes speech using Microsoft Edge Neural TTS', async () => {
  const config = loadConfig()
  const client = new EdgeTTSClient({
    voice: 'zh-CN-XiaoxiaoNeural',
    cacheDir: config.runtime.cacheDir,
  })

  const health = await client.health()
  assert.equal(health.ok, true)
  assert.equal(health.engine, 'edge-tts')

  const result = await client.speak('你好，我是芙莉莲。')
  assert.equal(result.status, 'completed')
  assert.equal(result.engine, 'edge-tts')
  assert.equal(result.profile, 'zh-CN-XiaoxiaoNeural')

  const filename = path.basename(result.audioPath)
  const fullPath = path.join(config.runtime.cacheDir, filename)
  const fileStat = await stat(fullPath)
  assert.equal(fileStat.isFile(), true)
  assert.ok(fileStat.size > 1000)

  await rm(fullPath, { force: true })
})
