# AIRI Companion

This repository is the working product fork for a reusable AI companion platform.
Codex voice interaction is one client adapter, not the product boundary.

## Baseline

- AIRI version: `0.11.3`
- Reviewed upstream commit: `a42e3ae0b51000c552d7cd19e6c20fa10918a614`
- Imported baseline commit: `0928906`
- Upstream: `https://github.com/moeru-ai/airi`
- Snapshot date: `2026-07-29`

The initial import contains the reviewed AIRI desktop, agent, audio, avatar, server,
and plugin modules. It is intentionally a source snapshot because GitHub large-file
downloads were not completing through the current local proxy.

## Product Boundary

```text
Companion Core
|- conversation lifecycle and interruption
|- persona and memory
|- LLM, ASR, and TTS adapters
|- avatar event protocol
|- tools and plugins
`- desktop, mobile, Codex, and OBS clients
```

The existing GPT Live files under `C:\Users\kk\Documents\飞书docx` remain an
integration test bench. New product behavior belongs here.

## Current Milestone

The first custom package is `packages/companion-core`. It provides:

- OpenAI-compatible streamed chat for Tuzi through OpenCodex
- Voicebox transcription, speech jobs, polling, and audio proxying
- normalized companion events for UI, avatar, and Codex clients
- per-conversation interruption with stale-result suppression
- a local HTTP/SSE sidecar with no third-party runtime dependencies

## Run

Copy `.env.example` to `.env` only when values need changing, then run:

```powershell
corepack pnpm companion:test
corepack pnpm companion:dev
```

Default address: `http://127.0.0.1:17321`

## AIRI Desktop Status

The Electron application is present but is not yet buildable from this snapshot.
The first verified missing file is:

```text
patches/@mediapipe__tasks-vision.patch
```

Additional AIRI workspace packages not included in the reviewed sparse snapshot
must also be restored before `apps/stage-tamagotchi` can be installed and run.
