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

### 2026-02-15 21:22 UTC
- Codex: Hardened `/v1/call/sessions*` backend routes with mandatory `x-user-id` auth, strict ownership rejection, strict lifecycle transitions (`created -> active -> ended|failed`), and normalized error payloads (`code`, `message`, `retryable`, `requestId`).
- Added provider correlation fields to call sessions (`provider`, `providerRoomId`, `providerParticipantId`, `providerCallId`) and enforced atomic/immutable correlation behavior on activation + replay-safe duplicate updates.
- Added backend integration tests for ownership scoping, invalid transition blocking, and duplicate activate/end replay safety (requires Node runtime with `node:sqlite`).
- Next: wire LiveKit token/room issuance path to these activation/correlation semantics and connect event schema v1 fanout.
- Risk: local environment Node 20 lacks `node:sqlite`, so tests cannot execute here.

### 2026-02-15 21:37 UTC
- Codex: Added `docs/MVP_EXECUTION_PLAN.md` with deploy-sliced execution plan for P0 tracks #1-#3.
- Decision: do **not** ship #1/#2/#3 as a single bundle; sequence into Slice A/B/C/D to reduce rollback/debug risk.
- Updated `BACKLOG.md` blockers + next action to explicitly prioritize Node runtime parity (`node:sqlite`) before continuing LiveKit bridge/event schema implementation.
- Next: land runtime pin/CI alignment PR so server integration tests run reliably, then resume P0 #2 + #3 implementation.
- Risk: if runtime pin is delayed, "green" status remains environment-dependent and slows confidence for deploys.
