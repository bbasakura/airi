# Companion Core Design

## Scope

The product needs one stable conversation runtime that can serve an AIRI desktop
character, a standalone companion application, Codex, mobile clients, and stream
overlays. The existing GPT Live page proves the local services work, but its UI,
conversation state, provider calls, and playback lifecycle are coupled together.

The first milestone extracts those boundaries into a local sidecar. Tuzi remains
an OpenAI-compatible chat provider routed through OpenCodex. Voicebox remains the
ASR/TTS provider. AIRI owns the future Electron shell, avatar renderer, lip-sync,
and ordered audio playback. The sidecar owns conversation identity, interruption,
provider normalization, and client-facing events.

## Runtime Flow

```text
text or WAV input
-> conversation turn controller
-> optional Voicebox transcription
-> Tuzi streamed chat
-> normalized text delta events
-> optional Voicebox speech job
-> audio-ready event
-> AIRI, Codex, mobile, or custom client
```

Each conversation has at most one active turn. Starting a new turn aborts local
fetches and polling for the previous turn. Voicebox currently has no verified
backend cancellation endpoint, so an aborted speech job may continue remotely;
its result is ignored and never emitted to the client.

## Protocol

Clients receive server-sent events such as `turn.started`,
`user.transcript.completed`, `assistant.text.delta`,
`assistant.text.completed`, `assistant.speech.ready`,
`assistant.speech.failed`, `avatar.state.changed`, `turn.interrupted`, and
`turn.completed`.

This protocol keeps avatars and clients independent from provider-specific response
shapes. A future Codex adapter can translate Codex App Server notifications into the
same events, while AIRI can map avatar state to VRM or Live2D motion and lip-sync.

## Security And Failure Handling

The sidecar binds to loopback by default and rejects browser origins that are not
loopback origins. Provider endpoints come only from process configuration, not from
request data. Request bodies have explicit size limits. Upstream errors are reduced
to bounded messages before they are sent to clients.

Provider outages do not prevent the process from starting. `/health` reports a
degraded state with separate Tuzi and Voicebox results. Tests use built-in Node
facilities and mocked `fetch`, so the core can be verified while local services are
offline.

Speech synthesis is a degradable output channel. Once text generation completes,
a Voicebox failure emits `assistant.speech.failed` but the turn still completes
with its text response.
