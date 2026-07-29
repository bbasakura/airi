import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  parseCompanionAvatarEvent,
  useCompanionAvatarStore,
} from './companion-avatar'

describe('companion avatar store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('accepts the closed renderer event schema', () => {
    expect(parseCompanionAvatarEvent({
      type: 'state',
      sequence: 3,
      at: '2026-07-29T00:00:00.000Z',
      state: {
        phase: 'active',
        activity: 'thinking',
        microphoneMuted: false,
        outputMuted: false,
        privatePath: 'D:\\private\\model.vrm',
      },
    })).toEqual({
      type: 'state',
      sequence: 3,
      at: '2026-07-29T00:00:00.000Z',
      state: {
        phase: 'active',
        activity: 'thinking',
        microphoneMuted: false,
        outputMuted: false,
      },
    })
    expect(parseCompanionAvatarEvent({
      type: 'animation',
      sequence: 4,
      animation: 'D:\\private\\motion.vrma',
    })).toBeUndefined()
  })

  it('tracks state, animation, audio level, and reconnect resets', () => {
    const store = useCompanionAvatarStore()
    store.configureTarget('erii-local-avatar')
    store.setConnected(true)

    expect(store.applyEvent({
      type: 'state',
      sequence: 1,
      state: {
        phase: 'active',
        activity: 'speaking',
        microphoneMuted: false,
        outputMuted: false,
      },
    })).toBe(true)
    expect(store.applyEvent({
      type: 'audio-level',
      sequence: 2,
      level: 1.5,
    })).toBe(true)
    expect(store.applyEvent({
      type: 'animation',
      sequence: 3,
      animation: 'HAPPY',
    })).toBe(true)
    expect(store.applyEvent({
      type: 'animation',
      sequence: 3,
      animation: 'DANCE',
    })).toBe(false)

    expect(store.activity).toBe('speaking')
    expect(store.audioLevel).toBe(1)
    expect(store.animation).toBe('HAPPY')
    expect(store.animationSequence).toBe(3)

    store.setConnected(false)
    expect(store.activity).toBe('idle')
    expect(store.phase).toBe('inactive')
    expect(store.audioLevel).toBe(0)
    expect(store.animation).toBeUndefined()
  })

  it('closes the mouth when audio-level updates pause', () => {
    vi.useFakeTimers()
    const store = useCompanionAvatarStore()
    store.setConnected(true)
    store.applyEvent({
      type: 'audio-level',
      sequence: 1,
      level: 0.8,
    })

    vi.advanceTimersByTime(179)
    expect(store.audioLevel).toBe(0.8)
    vi.advanceTimersByTime(1)
    expect(store.audioLevel).toBe(0)
    store.setConnected(false)
    vi.useRealTimers()
  })
})
