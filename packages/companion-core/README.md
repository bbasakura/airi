# Companion Core

Local provider and conversation runtime for AIRI Companion.

## Endpoints

- `GET /health`
- `GET /v1/config`
- `POST /v1/conversations/:id/turns`
- `POST /v1/conversations/:id/voice-turns`
- `POST /v1/conversations/:id/interrupt`
- `GET /v1/audio/:voiceboxJobId`

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
