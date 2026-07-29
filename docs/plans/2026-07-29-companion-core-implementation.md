# Companion Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dependency-free local companion sidecar for Tuzi streaming chat,
Voicebox ASR/TTS, normalized events, and interruption.

**Architecture:** Provider adapters isolate OpenAI-compatible and Voicebox HTTP
contracts. A conversation runtime owns history and cancellation. A loopback HTTP
server exposes JSON, raw WAV, SSE, interrupt, health, and audio proxy endpoints.

**Tech Stack:** Node.js 24, ECMAScript modules, built-in `fetch`, `FormData`,
`node:http`, and `node:test`.

---

### Task 1: Configuration And Protocol

**Files:**
- Create: `packages/companion-core/src/config.mjs`
- Create: `packages/companion-core/src/protocol.mjs`
- Test: `packages/companion-core/test/config.test.mjs`

1. Write tests for URL normalization, numeric bounds, and SSE serialization.
2. Run `node --test packages/companion-core/test/config.test.mjs` and confirm failure.
3. Implement environment configuration and normalized event serialization.
4. Run the targeted test and confirm it passes.

### Task 2: Provider Adapters

**Files:**
- Create: `packages/companion-core/src/adapters/openai-compatible.mjs`
- Create: `packages/companion-core/src/adapters/voicebox.mjs`
- Test: `packages/companion-core/test/adapters.test.mjs`

1. Test split SSE chunks, JSON fallback, Voicebox transcription, and speech polling.
2. Implement bounded upstream errors and abort-aware polling.
3. Run the targeted tests and confirm they pass.

### Task 3: Conversation Runtime

**Files:**
- Create: `packages/companion-core/src/runtime/conversation-runtime.mjs`
- Test: `packages/companion-core/test/conversation-runtime.test.mjs`

1. Test event order, history updates, speech-ready output, and interruption.
2. Implement one active turn per conversation with stale-result suppression.
3. Run the targeted tests and confirm they pass.

### Task 4: Local Sidecar

**Files:**
- Create: `packages/companion-core/src/server.mjs`
- Create: `packages/companion-core/package.json`
- Create: `scripts/start-companion.ps1`
- Test: `packages/companion-core/test/server.test.mjs`

1. Test health, text-turn SSE, origin checks, and request limits.
2. Implement the loopback HTTP server and audio proxy.
3. Run `corepack pnpm companion:test`.
4. Start the server and verify `GET http://127.0.0.1:17321/health`.
