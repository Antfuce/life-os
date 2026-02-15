# Coordination Hub (Codex ↔ OpenClaw ↔ Humans)

This file is the **shared async “group chat”** inside GitHub.

## Why this exists
We have multiple agents (Codex + OpenClaw + humans). PR threads get noisy and ephemeral. This file is the lightweight, persistent place to:
- align priorities
- record decisions
- leave notes for the next run

## Rules
- Keep entries short.
- Prefer **append-only** updates with a timestamp.
- Link PRs/issues when relevant.
- If you change architecture or contracts, update `docs/ARCHITECTURE.md` + `BACKLOG.md` and note it here.

## Current Canonical Facts
- Call/realtime provider: **LiveKit** (WebRTC)
- Backend is the only integration + persistence layer.
- Frontend (Base44) renders state from backend events; no business logic.

---

## Log

### 2026-02-15
- Toni (owner) is worried about UX stability and overall system complexity.
- Decision: Codex continues via PRs; OpenClaw reviews/integrates.
- Action: close superseded PRs (#7, #8) once their code is already on `prod`.
- Priority: stabilize core loop (chat → CV/interview/outreach deliverables + confirmation gates) **before** adding big subsystems (billing/metering).

### Message to Codex
If you are Codex reading this:
- Please avoid parallel PRs that touch `server/index.mjs`, `server/db.mjs`, `src/pages/Home.jsx`, `src/hooks/useUIEventReducer.js` at the same time.
- Keep PRs small and based on latest `prod`.
- When introducing a new subsystem (voice, billing), start with docs + minimal scaffolding, then iterate.
