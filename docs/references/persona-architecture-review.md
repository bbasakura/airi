# Persona Architecture Review

## Reference

- Repository: `xikhar/persona`
- Reviewed commit: `01d83045fa51f84514f8498f5093a62d3aea175c`
- Review date: `2026-07-29`

## What Persona Is

Persona is a focused desktop character renderer and local integration bridge. It
detects process-scoped output audio, calculates normalized amplitude, drives a VRM
character, and exposes a small MCP surface for animations and window control.

It deliberately does not implement speech recognition, speech generation, language
model orchestration, long-term memory, persona reasoning, or a general tool runtime.
For AIRI Companion, Persona is therefore a presentation and security reference,
not a replacement foundation.

## Adopted Decisions

### Private renderer boundary

The avatar client receives only:

- normalized lifecycle state
- normalized audio level and optional frequency bands
- stable animation names

Conversation text, transcripts, prompts, credentials, raw audio, and filesystem
paths do not cross this boundary.

### Stable animation contract

The initial animation names are `IDLE`, `GREETING`, `TALK`, `HAPPY`,
`FINGER_GUN`, and `DANCE`. Character packs may replace the media behind those
names without changing MCP or client integrations.

### Loopback hardening

The sidecar now validates both browser Origin and HTTP Host. It accepts loopback
web origins and `codex-app://` origins, rejects non-loopback Host headers, and caps
avatar event bodies at 64 KiB.

### Visual event hub

Conversation lifecycle events are reduced to visual state before publication.
Text deltas are intentionally discarded. External local clients may publish only
closed state, level, and animation schemas.

## Deferred Decisions

- Process-scoped WASAPI capture should be integrated only if AIRI playback cannot
  expose its own output level. The preferred path is direct playback telemetry.
- Persona's amplitude-only visemes are a useful fallback, but AIRI's existing
  wLipSync and audio pipeline remain the primary lip-sync implementation.
- MCP tools should be added after the AIRI desktop host is running. They must expose
  product actions such as `play_animation`, not Electron primitives or file paths.
- Asset licensing should use a release gate before any VRM or animation is bundled
  in a public installer.
