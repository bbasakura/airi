import type { DisplayModelURL } from '@proj-airi/stage-ui/stores/display-models'

import { DisplayModelFormat } from '@proj-airi/stage-ui/stores/display-models'

export const ERII_LOCAL_AVATAR_MODEL_ID = 'erii-local-avatar'
const ERII_LOCAL_AVATAR_INITIALIZED_KEY = 'erii/local-avatar/initialized-v1'
const DEFAULT_COMPANION_BASE_URL = 'http://127.0.0.1:17321'

interface LocalAvatarStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

interface InitializeLocalCompanionAvatarOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  registerPreset: (model: DisplayModelURL) => void
  selectModel: (id: string) => void
  storage: LocalAvatarStorage
}

export function createLocalCompanionAvatarPreset(baseUrl = DEFAULT_COMPANION_BASE_URL): DisplayModelURL {
  return {
    id: ERII_LOCAL_AVATAR_MODEL_ID,
    format: DisplayModelFormat.VRM,
    type: 'url',
    url: `${baseUrl.replace(/\/+$/, '')}/v1/avatar/model`,
    name: 'Frieren (Local)',
    importedAt: 1785294000000,
  }
}

export async function initializeLocalCompanionAvatar({
  baseUrl = DEFAULT_COMPANION_BASE_URL,
  fetchImpl = globalThis.fetch,
  registerPreset,
  selectModel,
  storage,
}: InitializeLocalCompanionAvatarOptions) {
  const preset = createLocalCompanionAvatarPreset(baseUrl)
  registerPreset(preset)

  if (storage.getItem(ERII_LOCAL_AVATAR_INITIALIZED_KEY))
    return false

  try {
    const response = await fetchImpl(preset.url, { method: 'HEAD' })
    if (!response.ok)
      return false
  }
  catch {
    return false
  }

  selectModel(preset.id)
  storage.setItem(ERII_LOCAL_AVATAR_INITIALIZED_KEY, 'true')
  return true
}
