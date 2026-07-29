<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { computed, onMounted, ref } from 'vue'

const providerId = 'edge-tts'
const defaultModel = 'edge-tts'
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

const voicesLoading = ref(false)

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  try {
    const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
    if (!provider) {
      throw new Error('Failed to initialize Edge TTS provider')
    }

    const config = providersStore.getProviderConfig(providerId)
    const selectedModel = (config.model as string | undefined) || defaultModel

    return await speechStore.speech(
      provider,
      selectedModel,
      input,
      voiceId || 'zh-CN-XiaoxiaoNeural',
      { ...config },
    )
  }
  catch (error) {
    console.error('[Edge TTS Playground] Error generating speech:', error)
    throw error
  }
}

onMounted(async () => {
  try {
    voicesLoading.value = true
    providersStore.initializeProvider(providerId)
    await providersStore.fetchModelsForProvider(providerId)
    await speechStore.loadVoicesForProvider(providerId)
  }
  finally {
    voicesLoading.value = false
  }
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        :voices-loading="voicesLoading"
        default-text="你好！我是 Erii 伴侣。使用 Edge TTS 晓晓音色发音，听起来是不是非常流畅自然？"
      />
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
