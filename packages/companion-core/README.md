# Companion Core

Local provider and conversation runtime for AIRI Companion.

## Endpoints

- `GET /health`
- `GET /v1/config`
- `POST /v1/conversations/:id/turns`
- `POST /v1/conversations/:id/voice-turns`
- `POST /v1/conversations/:id/interrupt`
- `GET /v1/audio/:voiceboxJobId`
- `GET /v1/avatar/status`
- `GET /v1/avatar/events`
- `POST /v1/avatar/events`

Text turns accept JSON:

```json
{
  "text": "你好",
  "speak": true
}
```

Voice turns accept a raw WAV body. Both turn endpoints return
`text/event-stream`.

The package intentionally has no third-party runtime dependencies. AIRI can consume
the event stream now and later replace the HTTP boundary with an in-process adapter.

The avatar stream is deliberately narrower than the conversation stream. It exposes
only normalized state, audio level, and stable animation names. It never includes
transcripts, assistant text, prompts, credentials, or asset file paths.
