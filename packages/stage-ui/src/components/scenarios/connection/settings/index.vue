<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useModsServerChannelStore } from '../../../../stores/mods/api/channel-server'

const { t } = useI18n()
const serverChannelStore = useModsServerChannelStore()
const { websocketUrl, connected } = storeToRefs(serverChannelStore)

const websocketUrlModel = computed({
  get() {
    return websocketUrl.value
  },
  set(value: string | undefined) {
    if (value === undefined)
      return

    websocketUrl.value = value
  },
})
</script>

<template>
  <div :class="['rounded-2xl', 'bg-neutral-900/60', 'border border-neutral-800/80', 'backdrop-blur-md', 'p-5', 'flex flex-col', 'gap-5']">
    <!-- Live Status Banner -->
    <div :class="['flex items-center gap-3 p-3.5 rounded-xl border', connected ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/40 border-amber-500/30 text-amber-300']">
      <div :class="[connected ? 'i-ph:wifi-high text-emerald-400' : 'i-ph:wifi-slash text-amber-400', 'size-6 shrink-0']" />
      <div class="flex flex-col">
        <span class="font-semibold text-sm">
          {{ connected ? t('stage.websocket-status.connected') : t('stage.websocket-status.disconnected') }}
        </span>
        <span class="text-xs opacity-80">
          {{ connected ? '与 Companion 侧车及通道服务实时连接正常' : '未连接到服务通道，请检查 WebSocket URL 或服务启动状态' }}
        </span>
      </div>
    </div>

    <FieldInput
      v-model="websocketUrlModel"
      :label="t('settings.pages.connection.websocket-url.label')"
      :description="t('settings.pages.connection.websocket-url.description')"
      :placeholder="t('settings.pages.connection.websocket-url.placeholder')"
    />
    <slot name="platform-specific" />
  </div>
</template>
