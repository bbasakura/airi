import { describe, expect, it, vi } from 'vitest'

import {
  ERII_LOCAL_AVATAR_MODEL_ID,
  initializeLocalCompanionAvatar,
} from './local-companion-avatar'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('local companion avatar bootstrap', () => {
  it('registers and selects the local avatar once when its endpoint is available', async () => {
    const registerPreset = vi.fn()
    const selectModel = vi.fn()
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const storage = createStorage()

    expect(await initializeLocalCompanionAvatar({
      baseUrl: 'http://127.0.0.1:17321',
      fetchImpl,
      registerPreset,
      selectModel,
      storage,
    })).toBe(true)
    expect(registerPreset).toHaveBeenCalledOnce()
    expect(selectModel).toHaveBeenCalledWith(ERII_LOCAL_AVATAR_MODEL_ID)

    expect(await initializeLocalCompanionAvatar({
      baseUrl: 'http://127.0.0.1:17321',
      fetchImpl,
      registerPreset,
      selectModel,
      storage,
    })).toBe(false)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(selectModel).toHaveBeenCalledOnce()
  })

  it('keeps the current model when the local endpoint is unavailable', async () => {
    const selectModel = vi.fn()
    const storage = createStorage()

    expect(await initializeLocalCompanionAvatar({
      fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
      registerPreset: vi.fn(),
      selectModel,
      storage,
    })).toBe(false)
    expect(selectModel).not.toHaveBeenCalled()
  })
})
