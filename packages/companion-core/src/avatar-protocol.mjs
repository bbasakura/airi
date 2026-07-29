export const AVATAR_PHASES = Object.freeze([
  'inactive',
  'starting',
  'active',
  'stopping',
])

export const AVATAR_ACTIVITIES = Object.freeze([
  'idle',
  'listening',
  'thinking',
  'speaking',
])

export const AVATAR_ANIMATIONS = Object.freeze([
  'IDLE',
  'GREETING',
  'TALK',
  'HAPPY',
  'FINGER_GUN',
  'DANCE',
])

const phaseSet = new Set(AVATAR_PHASES)
const activitySet = new Set(AVATAR_ACTIVITIES)
const animationSet = new Set(AVATAR_ANIMATIONS)
const bandNames = new Set(['low', 'mid', 'high'])

function normalizeBands(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  const bands = {}
  for (const [name, level] of Object.entries(value)) {
    if (bandNames.has(name) && Number.isFinite(level))
      bands[name] = Math.max(0, Math.min(1, Number(level)))
  }
  return Object.keys(bands).length ? bands : undefined
}

export function createAvatarState(activity, phase = 'active', {
  microphoneMuted = false,
  outputMuted = false,
} = {}) {
  return {
    type: 'state',
    state: {
      phase,
      activity,
      microphoneMuted,
      outputMuted,
    },
  }
}

export function normalizeAvatarEvent(value) {
  if (value?.type === 'state') {
    const state = value.state
    if (
      state
      && typeof state === 'object'
      && phaseSet.has(state.phase)
      && activitySet.has(state.activity)
      && typeof state.microphoneMuted === 'boolean'
      && typeof state.outputMuted === 'boolean'
    ) {
      return {
        type: 'state',
        state: {
          phase: state.phase,
          activity: state.activity,
          microphoneMuted: state.microphoneMuted,
          outputMuted: state.outputMuted,
        },
      }
    }
  }

  if (value?.type === 'audio-level' && Number.isFinite(value.level)) {
    const bands = normalizeBands(value.bands)
    return {
      type: 'audio-level',
      level: Math.max(0, Math.min(1, Number(value.level))),
      ...(bands ? { bands } : {}),
    }
  }

  if (value?.type === 'animation' && animationSet.has(value.animation)) {
    return {
      type: 'animation',
      animation: value.animation,
      ...(typeof value.source === 'string' ? { source: value.source.slice(0, 32) } : {}),
      ...(Number.isSafeInteger(value.requestId) ? { requestId: value.requestId } : {}),
    }
  }

  if (value?.type === 'audio-play' && typeof value.audioPath === 'string' && value.audioPath.startsWith('/v1/audio/')) {
    return {
      type: 'audio-play',
      audioPath: value.audioPath,
    }
  }

  return undefined
}

export function companionEventToAvatarEvent(event) {
  if (event?.type === 'assistant.speech.ready' && event.audioPath) {
    return {
      type: 'audio-play',
      audioPath: event.audioPath,
    }
  }

  if (event?.type === 'turn.started') {
    return event.inputType === 'voice'
      ? createAvatarState('listening', 'starting')
      : createAvatarState('idle', 'starting')
  }

  if (event?.type === 'avatar.state.changed') {
    if (event.state === 'listening')
      return createAvatarState('listening')
    if (event.state === 'thinking')
      return createAvatarState('thinking')
    if (event.state === 'speaking')
      return createAvatarState('speaking')
    if (event.state === 'idle')
      return createAvatarState('idle', 'inactive')
  }

  if (['turn.completed', 'turn.interrupted', 'turn.failed'].includes(event?.type))
    return createAvatarState('idle', 'inactive')

  return undefined
}

export class AvatarEventHub {
  constructor({ now = () => new Date() } = {}) {
    this.now = now
    this.sequence = 0
    this.listeners = new Set()
    this.lastEvent = undefined
    this.lastState = undefined
    this.lastNormalizedKey = ''
  }

  publish(value) {
    const normalized = normalizeAvatarEvent(value)
    if (!normalized)
      return undefined

    const normalizedKey = JSON.stringify(normalized)
    if (normalizedKey === this.lastNormalizedKey)
      return this.lastEvent

    this.sequence += 1
    const event = {
      ...normalized,
      sequence: this.sequence,
      at: this.now().toISOString(),
    }
    this.lastNormalizedKey = normalizedKey
    this.lastEvent = event
    if (event.type === 'state')
      this.lastState = event

    for (const listener of this.listeners)
      listener(event)
    return event
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot() {
    return {
      lastEvent: this.lastEvent,
      lastState: this.lastState,
      subscribers: this.listeners.size,
    }
  }
}
