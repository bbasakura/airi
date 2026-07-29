# Erii Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move AIRI Companion to `D:\soft\Erii` and deliver the first desktop build that loads the local Frieren VRM and reacts to Companion Core voice events.

**Architecture:** Keep Companion Core provider-independent and local. Use Gemini through OpenCodex as the default remote brain, Voicebox for ASR/TTS, and AIRI for the Electron shell and VRM renderer. Store mutable data and licensed assets locally under the Erii root without committing them.

**Tech Stack:** Node.js 24, pnpm workspace, TypeScript/Vue, Electron, Three.js/VRM, HTTP/SSE, Voicebox, OpenCodex.

---

### Task 1: Migrate the repository

**Files:**
- Move: `C:\Users\kk\Documents\AIRI-Companion`
- To: `D:\soft\Erii`

**Steps:**

1. Verify the target directory is empty and resolves beneath `D:\soft`.
2. Move the repository with native PowerShell filesystem commands.
3. Verify the Git branch, remotes, clean status, commit history, and local VRM hash.
4. Verify the old repository path no longer exists.

### Task 2: Centralize runtime paths

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `packages/companion-core/src/config.mjs`
- Modify: `packages/companion-core/test/config.test.mjs`
- Create: `scripts/initialize-erii-runtime.ps1`

**Steps:**

1. Add failing tests for normalized data, model, cache, and log directories.
2. Add environment-backed runtime directory configuration.
3. Add an idempotent initializer for local mutable directories.
4. Ignore runtime data, caches, logs, local configuration, and licensed models.
5. Run `npm run companion:test`.

### Task 3: Restore the AIRI desktop workspace

**Files:**
- Restore missing upstream workspace files from AIRI `0.11.3`.
- Preserve all Erii-specific commits and local-only assets.

**Steps:**

1. Fetch the reviewed upstream revision.
2. Inventory files missing from the imported sparse snapshot.
3. Restore only files required by the workspace lockfile and desktop application.
4. Install dependencies.
5. Run the narrow Stage UI and desktop build checks.

### Task 4: Add the local avatar source

**Files:**
- Modify the existing AIRI character/display-model service.
- Add focused unit tests beside the existing display-model tests.

**Steps:**

1. Write a failing test for a local-only VRM model source.
2. Resolve the configured Frieren VRM without exposing its path through avatar events.
3. Load the model into AIRI's existing VRM renderer.
4. Show a clear local error state when the file is absent.
5. Run the focused Stage UI tests.

### Task 5: Connect avatar and voice events

**Files:**
- Modify the AIRI desktop companion client.
- Reuse `packages/companion-core/src/avatar-protocol.mjs`.

**Steps:**

1. Subscribe to Companion Core avatar SSE.
2. Map `idle`, `listening`, `thinking`, `speaking`, and interruption states.
3. Drive mouth movement from normalized audio levels.
4. Suppress stale events after interruption.
5. Add tests for reconnect and event mapping.

### Task 6: Verify the first usable desktop milestone

**Steps:**

1. Start Companion Core and AIRI desktop.
2. Verify the Frieren model renders on desktop.
3. Complete one Gemini text turn.
4. Complete one Voicebox speech turn.
5. Verify lip movement, state transitions, and interruption.
6. Confirm Git remains clean and the VRM remains ignored.

