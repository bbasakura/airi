import { describe, expect, it } from 'vitest'

import { externalMouthTarget } from './external-audio-level'

describe('external VRM audio-level lip sync', () => {
  it('clamps and curves a normalized audio level', () => {
    expect(externalMouthTarget(-1)).toBe(0)
    expect(externalMouthTarget(0)).toBe(0)
    expect(externalMouthTarget(0.25)).toBeGreaterThan(0.2)
    expect(externalMouthTarget(1)).toBe(0.7)
    expect(externalMouthTarget(4)).toBe(0.7)
  })
})
