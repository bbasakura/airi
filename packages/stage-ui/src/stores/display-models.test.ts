import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayModelFormat, useDisplayModelsStore } from './display-models'

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async (_key: string, value: unknown) => value),
  },
}))

/**
 * @example
 * describe('display models store', () => {})
 */
describe('display models store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * @example
   * it('resolves newly imported display models from memory before IndexedDB', async () => {})
   */
  it('resolves newly imported display models from memory before IndexedDB', async () => {
    const store = useDisplayModelsStore()
    const model = {
      id: 'display-model-pending-idb-write',
      format: DisplayModelFormat.Live2dZip,
      type: 'file' as const,
      file: new File(['model'], 'model.zip'),
      name: 'model.zip',
      importedAt: 1,
    }

    store.displayModels = [model]

    const resolved = await store.getDisplayModel(model.id)

    expect(resolved).toEqual(model)
  })

  it('registers local URL presets before loading persisted display models', async () => {
    const store = useDisplayModelsStore()
    const preset = {
      id: 'erii-local-avatar',
      format: DisplayModelFormat.VRM,
      type: 'url' as const,
      url: 'http://127.0.0.1:17321/v1/avatar/model',
      name: 'Frieren (Local)',
      importedAt: 2,
    }

    store.registerDisplayModelPreset(preset)
    store.registerDisplayModelPreset(preset)
    await store.loadDisplayModelsFromIndexedDB()

    expect(store.displayModels.filter(model => model.id === preset.id)).toEqual([preset])
    expect(await store.getDisplayModel(preset.id)).toEqual(preset)
  })
})
