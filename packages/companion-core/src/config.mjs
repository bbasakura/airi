import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_SYSTEM_PROMPT = '你是一个自然、可靠、有长期陪伴感的中文 AI 伴侣。始终使用简体中文，回答口语化、简洁，不使用 Markdown。'
const DEFAULT_ERII_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function parseInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.min(max, Math.max(min, parsed))
}

function parseBoolean(value, fallback) {
  if (value == null || value === '')
    return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase())
}

export function normalizeHttpUrl(value, fallback) {
  const url = new URL(value || fallback)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error(`Unsupported URL protocol: ${url.protocol}`)

  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function resolveRuntimePath(value, fallback, rootDir) {
  const selected = String(value ?? '').trim() || fallback
  return path.resolve(rootDir, selected)
}

export function loadConfig(env = process.env) {
  const rootDir = path.resolve(String(env.ERII_ROOT ?? '').trim() || DEFAULT_ERII_ROOT)

  return {
    runtime: {
      rootDir,
      dataDir: resolveRuntimePath(env.ERII_DATA_DIR, 'data', rootDir),
      modelsDir: resolveRuntimePath(env.ERII_MODELS_DIR, 'models', rootDir),
      cacheDir: resolveRuntimePath(env.ERII_CACHE_DIR, 'cache', rootDir),
      logsDir: resolveRuntimePath(env.ERII_LOGS_DIR, 'logs', rootDir),
      configDir: resolveRuntimePath(env.ERII_CONFIG_DIR, 'config', rootDir),
    },
    server: {
      host: env.COMPANION_HOST || '127.0.0.1',
      port: parseInteger(env.COMPANION_PORT, 17321, { min: 1, max: 65535 }),
      maxJsonBytes: parseInteger(env.COMPANION_MAX_JSON_BYTES, 1024 * 1024, {
        min: 1024,
        max: 10 * 1024 * 1024,
      }),
      maxAudioBytes: parseInteger(env.COMPANION_MAX_AUDIO_BYTES, 25 * 1024 * 1024, {
        min: 1024,
        max: 100 * 1024 * 1024,
      }),
    },
    chat: {
      baseUrl: normalizeHttpUrl(env.TUZI_BASE_URL, 'http://127.0.0.1:10100/v1'),
      model: env.TUZI_MODEL || 'tuzi/gpt-5.6-sol',
      apiKey: env.TUZI_API_KEY || '',
      maxTokens: parseInteger(env.TUZI_MAX_TOKENS, 300, { min: 1, max: 32768 }),
    },
    voicebox: {
      baseUrl: normalizeHttpUrl(env.VOICEBOX_BASE_URL, 'http://127.0.0.1:17493'),
      profile: env.VOICEBOX_PROFILE || '',
      language: env.VOICEBOX_LANGUAGE || 'zh',
      engine: env.VOICEBOX_ENGINE || 'kokoro',
      transcriptionModel: env.VOICEBOX_TRANSCRIBE_MODEL || 'base',
      pollIntervalMs: parseInteger(env.VOICEBOX_POLL_INTERVAL_MS, 1000, {
        min: 50,
        max: 10000,
      }),
      maxPollAttempts: parseInteger(env.VOICEBOX_MAX_POLL_ATTEMPTS, 60, {
        min: 1,
        max: 600,
      }),
    },
    conversation: {
      systemPrompt: env.COMPANION_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
      maxHistoryMessages: parseInteger(env.COMPANION_MAX_HISTORY_MESSAGES, 20, {
        min: 2,
        max: 200,
      }),
      speechEnabled: parseBoolean(env.COMPANION_SPEECH_ENABLED, true),
    },
  }
}

export function publicConfig(config) {
  return {
    server: {
      host: config.server.host,
      port: config.server.port,
    },
    chat: {
      baseUrl: config.chat.baseUrl,
      model: config.chat.model,
      hasApiKey: Boolean(config.chat.apiKey),
      maxTokens: config.chat.maxTokens,
    },
    voicebox: {
      baseUrl: config.voicebox.baseUrl,
      profile: config.voicebox.profile,
      language: config.voicebox.language,
      engine: config.voicebox.engine,
      transcriptionModel: config.voicebox.transcriptionModel,
    },
    conversation: {
      maxHistoryMessages: config.conversation.maxHistoryMessages,
      speechEnabled: config.conversation.speechEnabled,
    },
  }
}
