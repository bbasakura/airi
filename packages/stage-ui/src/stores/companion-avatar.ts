import { defineStore } from 'pinia'
import { ref } from 'vue'

export const COMPANION_AVATAR_ACTIVITIES = [
  'idle',
  'listening',
  'thinking',
  'speaking',
] as const

export const COMPANION_AVATAR_PHASES = [
  'inactive',
  'starting',
  'active',
  'stopping',
] as const

export const COMPANION_AVATAR_ANIMATIONS = [
  'IDLE',
  'GREETING',
  'TALK',
  'HAPPY',
  'FINGER_GUN',
  'DANCE',
] as const

export type CompanionAvatarActivity = typeof COMPANION_AVATAR_ACTIVITIES[number]
export type CompanionAvatarPhase = typeof COMPANION_AVATAR_PHASES[number]
export type CompanionAvatarAnimation = typeof COMPANION_AVATAR_ANIMATIONS[number]

interface CompanionAvatarEventBase {
  sequence: number
  at?: string
}

export interface CompanionAvatarStateEvent extends CompanionAvatarEventBase {
  type: 'state'
  state: {
    phase: CompanionAvatarPhase
    activity: CompanionAvatarActivity
    microphoneMuted: boolean
    outputMuted: boolean
  }
}

export interface CompanionAvatarAudioLevelEvent extends CompanionAvatarEventBase {
  type: 'audio-level'
  level: number
}

export interface CompanionAvatarAnimationEvent extends CompanionAvatarEventBase {
  type: 'animation'
  animation: CompanionAvatarAnimation
  source?: string
  requestId?: number
}

export interface CompanionAvatarAudioPlayEvent extends CompanionAvatarEventBase {
  type: 'audio-play'
  audioPath: string
}

export type CompanionAvatarEvent
  = | CompanionAvatarStateEvent
    | CompanionAvatarAudioLevelEvent
    | CompanionAvatarAnimationEvent
    | CompanionAvatarAudioPlayEvent

const activitySet = new Set<string>(COMPANION_AVATAR_ACTIVITIES)
const phaseSet = new Set<string>(COMPANION_AVATAR_PHASES)
const animationSet = new Set<string>(COMPANION_AVATAR_ANIMATIONS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEventBase(value: Record<string, unknown>) {
  if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0)
    return undefined

  return {
    sequence: Number(value.sequence),
    ...(typeof value.at === 'string' ? { at: value.at } : {}),
  }
}

export function parseCompanionAvatarEvent(value: unknown): CompanionAvatarEvent | undefined {
  if (!isRecord(value))
    return undefined

  const base = parseEventBase(value)
  if (!base)
    return undefined

  if (value.type === 'state' && isRecord(value.state)) {
    const state = value.state
    if (
      typeof state.activity === 'string'
      && activitySet.has(state.activity)
      && typeof state.phase === 'string'
      && phaseSet.has(state.phase)
      && typeof state.microphoneMuted === 'boolean'
      && typeof state.outputMuted === 'boolean'
    ) {
      return {
        ...base,
        type: 'state',
        state: {
          activity: state.activity as CompanionAvatarActivity,
          phase: state.phase as CompanionAvatarPhase,
          microphoneMuted: state.microphoneMuted,
          outputMuted: state.outputMuted,
        },
      }
    }
  }

  if (value.type === 'audio-level' && Number.isFinite(value.level)) {
    return {
      ...base,
      type: 'audio-level',
      level: Math.max(0, Math.min(1, Number(value.level))),
    }
  }

  if (
    value.type === 'animation'
    && typeof value.animation === 'string'
    && animationSet.has(value.animation)
  ) {
    return {
      ...base,
      type: 'animation',
      animation: value.animation as CompanionAvatarAnimation,
      ...(typeof value.source === 'string' ? { source: value.source } : {}),
      ...(Number.isSafeInteger(value.requestId) ? { requestId: Number(value.requestId) } : {}),
    }
  }

  if (value.type === 'audio-play' && typeof value.audioPath === 'string' && value.audioPath.startsWith('/v1/audio/')) {
    return {
      ...base,
      type: 'audio-play',
      audioPath: value.audioPath,
    }
  }

  return undefined
}

export const useCompanionAvatarStore = defineStore('companion-avatar', () => {
  const connected = ref(false)
  const targetModelId = ref<string>()
  const phase = ref<CompanionAvatarPhase>('inactive')
  const activity = ref<CompanionAvatarActivity>('idle')
  const microphoneMuted = ref(false)
  const outputMuted = ref(false)
  const audioLevel = ref(0)
  const animation = ref<CompanionAvatarAnimation>()
  const animationSequence = ref(0)
  const lastSequence = ref(0)
  let audioLevelResetTimer: ReturnType<typeof setTimeout> | undefined

  function clearAudioLevelReset() {
    if (!audioLevelResetTimer)
      return
    clearTimeout(audioLevelResetTimer)
    audioLevelResetTimer = undefined
  }

  function resetRuntimeState() {
    clearAudioLevelReset()
    phase.value = 'inactive'
    activity.value = 'idle'
    microphoneMuted.value = false
    outputMuted.value = false
    audioLevel.value = 0
    animation.value = undefined
    animationSequence.value = 0
    lastSequence.value = 0
  }

  function configureTarget(modelId: string) {
    targetModelId.value = modelId
  }

  function setConnected(value: boolean) {
    if (connected.value === value)
      return

    connected.value = value
    if (!value)
      resetRuntimeState()
  }

  function applyEvent(value: unknown) {
    const event = parseCompanionAvatarEvent(value)
    if (!event || event.sequence <= lastSequence.value)
      return false

    lastSequence.value = event.sequence
    if (event.type === 'state') {
      phase.value = event.state.phase
      activity.value = event.state.activity
      microphoneMuted.value = event.state.microphoneMuted
      outputMuted.value = event.state.outputMuted
      if (event.state.activity !== 'speaking') {
        clearAudioLevelReset()
        audioLevel.value = 0
      }
    }
    else if (event.type === 'audio-level') {
      clearAudioLevelReset()
      audioLevel.value = event.level
      if (event.level > 0) {
        audioLevelResetTimer = setTimeout(() => {
          audioLevelResetTimer = undefined
          audioLevel.value = 0
        }, 180)
      }
    }
    else {
      animation.value = event.animation
      animationSequence.value = event.sequence
    }

    return true
  }

  return {
    connected,
    targetModelId,
    phase,
    activity,
    microphoneMuted,
    outputMuted,
    audioLevel,
    animation,
    animationSequence,
    configureTarget,
    setConnected,
    applyEvent,
  }
})
