export function cleanTextForTts(text) {
  if (!text) return ''
  return String(text)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, '').replace(/[\r\n]+/g, ' ')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/["'\\\\]/g, '')
    .trim()
}

import path from 'node:path'
import process from 'node:process'

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { promisify } from 'node:util'

import { CompanionError, isAbortError } from '../errors.mjs'

const execFileAsync = promisify(execFile)

export class EdgeTTSClient {
  constructor({
    voice = 'zh-CN-XiaoxiaoNeural',
    cacheDir = process.cwd(),
    pythonPath = 'python',
  } = {}) {
    this.voice = voice
    this.cacheDir = cacheDir
    this.pythonPath = pythonPath
  }

  async health(signal) {
    try {
      await execFileAsync(this.pythonPath, ['-c', 'import edge_tts'], { signal, timeout: 5000 })
      return {
        ok: true,
        engine: 'edge-tts',
        voice: this.voice,
      }
    }
    catch (error) {
      return {
        ok: false,
        engine: 'edge-tts',
        error: error.message,
      }
    }
  }

  async speak(text, { voice = this.voice, signal } = {}) {
    const id = randomUUID()
    const filename = `${id}.mp3`
    const audioPath = path.join(this.cacheDir, filename)
    const sanitizedText = text.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"')

    try {
      await execFileAsync(
        this.pythonPath,
        [
          '-c',
          `import asyncio, edge_tts; asyncio.run(edge_tts.Communicate("""${sanitizedText}""", "${voice}").save(r"${audioPath}"))`,
        ],
        { signal, timeout: 20000 },
      )
    }
    catch (error) {
      if (signal?.aborted || isAbortError(error))
        throw error
      throw new CompanionError(`Edge TTS speech synthesis failed: ${error.message}`, {
        code: 'EDGE_TTS_FAILED',
        status: 502,
        cause: error,
      })
    }

    try {
      const fileStat = await stat(audioPath)
      if (!fileStat.isFile() || fileStat.size === 0)
        throw new Error('Generated audio file is empty')
    }
    catch (error) {
      throw new CompanionError(`Edge TTS audio file is invalid: ${error.message}`, {
        code: 'EDGE_TTS_AUDIO_INVALID',
        status: 502,
        cause: error,
      })
    }

    return {
      id: filename,
      status: 'completed',
      audioPath: `/v1/audio/${filename}`,
      profile: voice,
      engine: 'edge-tts',
    }
  }
}
