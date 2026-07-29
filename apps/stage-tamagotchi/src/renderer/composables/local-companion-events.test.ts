import { describe, expect, it, vi } from 'vitest'

import { connectLocalCompanionEvents } from './local-companion-events'

class FakeEventSource {
  listeners = new Map<string, EventListener[]>()
  closed = false

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close() {
    this.closed = true
  }

  emit(type: string, data = '') {
    for (const listener of this.listeners.get(type) ?? [])
      listener({ data } as MessageEvent<string>)
  }
}

describe('local companion avatar events', () => {
  it('forwards closed avatar events and reconnects after the server restarts', () => {
    const sources: FakeEventSource[] = []
    const connectionChanges: boolean[] = []
    const events: unknown[] = []
    let retry: (() => void) | undefined

    const dispose = connectLocalCompanionEvents({
      baseUrl: 'http://127.0.0.1:17321/',
      eventSourceFactory: (url) => {
        expect(url).toBe('http://127.0.0.1:17321/v1/avatar/events')
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      setTimeoutImpl: ((callback: () => void) => {
        retry = callback
        return 1
      }) as typeof setTimeout,
      clearTimeoutImpl: vi.fn(),
      onConnectionChange: connected => connectionChanges.push(connected),
      onEvent: event => events.push(event),
    })

    sources[0].emit('open')
    sources[0].emit('state', JSON.stringify({
      type: 'state',
      sequence: 1,
      state: {
        phase: 'active',
        activity: 'thinking',
        microphoneMuted: false,
        outputMuted: false,
      },
    }))
    expect(connectionChanges).toEqual([false, true])
    expect(events).toHaveLength(1)

    sources[0].emit('error')
    expect(sources[0].closed).toBe(true)
    expect(connectionChanges.at(-1)).toBe(false)

    retry?.()
    expect(sources).toHaveLength(2)
    sources[1].emit('open')
    expect(connectionChanges.at(-1)).toBe(true)

    dispose()
    expect(sources[1].closed).toBe(true)
    expect(connectionChanges.at(-1)).toBe(false)
  })

  it('ignores malformed event data without dropping the connection', () => {
    const source = new FakeEventSource()
    const onEvent = vi.fn()
    const dispose = connectLocalCompanionEvents({
      eventSourceFactory: () => source,
      onConnectionChange: vi.fn(),
      onEvent,
    })

    source.emit('audio-level', '{not-json')
    expect(onEvent).not.toHaveBeenCalled()
    expect(source.closed).toBe(false)
    dispose()
  })
})
