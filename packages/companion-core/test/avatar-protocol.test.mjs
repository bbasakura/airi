import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

import {
  AvatarEventHub,
  companionEventToAvatarEvent,
  normalizeAvatarEvent,
} from '../src/avatar-protocol.mjs'

test('normalizes closed avatar state, level, and animation events', () => {
  assert.deepEqual(normalizeAvatarEvent({
    type: 'audio-level',
    level: 1.8,
    bands: {
      low: 0.2,
      mid: 2,
      high: -1,
      private: 0.8,
    },
  }), {
    type: 'audio-level',
    level: 1,
    bands: {
      low: 0.2,
      mid: 1,
      high: 0,
    },
  })

  assert.deepEqual(normalizeAvatarEvent({
    type: 'animation',
    animation: 'HAPPY',
    source: 'mcp',
    requestId: 4,
    path: 'C:\\private\\animation.vrma',
  }), {
    type: 'animation',
    animation: 'HAPPY',
    source: 'mcp',
    requestId: 4,
  })

  assert.equal(normalizeAvatarEvent({
    type: 'animation',
    animation: 'C:\\private\\animation.vrma',
  }), undefined)
})

test('maps companion lifecycle events without exposing conversation text', () => {
  assert.deepEqual(companionEventToAvatarEvent({
    type: 'turn.started',
    inputType: 'voice',
    text: 'must not cross the renderer boundary',
  }), {
    type: 'state',
    state: {
      phase: 'starting',
      activity: 'listening',
      microphoneMuted: false,
      outputMuted: false,
    },
  })

  assert.deepEqual(companionEventToAvatarEvent({
    type: 'avatar.state.changed',
    state: 'speaking',
  }), {
    type: 'state',
    state: {
      phase: 'active',
      activity: 'speaking',
      microphoneMuted: false,
      outputMuted: false,
    },
  })

  assert.deepEqual(companionEventToAvatarEvent({
    type: 'avatar.state.changed',
    state: 'thinking',
  }), {
    type: 'state',
    state: {
      phase: 'active',
      activity: 'thinking',
      microphoneMuted: false,
      outputMuted: false,
    },
  })

  assert.equal(companionEventToAvatarEvent({
    type: 'assistant.text.delta',
    delta: 'secret text',
  }), undefined)
})

test('publishes deduplicated avatar events to subscribers', () => {
  const received = []
  const hub = new AvatarEventHub({
    now: () => new Date('2026-07-29T00:00:00.000Z'),
  })
  const unsubscribe = hub.subscribe(event => received.push(event))

  const first = hub.publish({
    type: 'state',
    state: {
      phase: 'active',
      activity: 'speaking',
      microphoneMuted: false,
      outputMuted: false,
    },
  })
  const duplicate = hub.publish({
    type: 'state',
    state: {
      phase: 'active',
      activity: 'speaking',
      microphoneMuted: false,
      outputMuted: false,
    },
  })
  unsubscribe()

  assert.equal(first, duplicate)
  assert.equal(received.length, 1)
  assert.equal(hub.snapshot().lastState.sequence, 1)
})
