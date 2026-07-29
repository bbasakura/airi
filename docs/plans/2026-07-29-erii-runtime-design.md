# Erii Runtime Design

## Goal

Erii is a reusable AI companion platform. The local application owns the avatar,
voice pipeline, memory, privacy boundary, and tool orchestration. Remote model APIs
provide the main reasoning capacity.

## Core Logic

```mermaid
flowchart LR
  subgraph Clients
    Mic[Microphone]
    Text[Text chat]
    Codex[Codex]
    Future[Mobile / Web / OBS]
  end

  subgraph Local["D:/soft/Erii"]
    AIRI[AIRI desktop]
    Core[Companion Core]
    Voice[Voicebox]
    Memory[Local memory]
    Avatar[Frieren VRM renderer]
    Assets[Models / config / cache / logs]
  end

  subgraph Cloud
    Gemini[Gemini API]
    Fallback[Fallback model API]
    OpenCodex[OpenCodex tools]
  end

  Mic --> AIRI
  Text --> AIRI
  Codex --> Core
  Future -.-> Core
  AIRI --> Voice
  Voice -->|ASR text| Core
  AIRI -->|text| Core
  Core <-->|persona and history| Memory
  Core -->|chat and reasoning| Gemini
  Core -.->|failover| Fallback
  Core <-->|coding and computer tools| OpenCodex
  Core -->|reply text| Voice
  Voice -->|speech audio and level| AIRI
  Core -->|state and animation events| Avatar
  Avatar --> AIRI
  Assets --> Voice
  Assets --> Avatar
```

## Runtime Boundary

- Gemini is the default conversational brain.
- OpenCodex is a tool and coding adapter, not the product boundary.
- Companion Core owns conversation lifecycle, interruption, provider routing,
  persona state, memory policy, and normalized avatar events.
- Voicebox owns ASR and TTS.
- AIRI owns the desktop shell and VRM presentation.
- The Frieren model remains local-only and must never enter Git history.

## Local Layout

```text
D:\soft\Erii\
|- apps\
|- packages\
|- assets\local\frieren\
|- models\voicebox\
|- data\
|- cache\
|- logs\
|- config\
`- scripts\
```

Mutable runtime directories and licensed avatar media are ignored by Git.

