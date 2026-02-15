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

### 2026-02-15 21:31 UTC
- Codex: Implemented canonical realtime contract v1.0 enforcement in backend with strict envelope keys (`eventId`, `timestamp`, `sessionId`, `type`, `actor`, `payload`, `version`) and hard rejection of alias drift (`ts`, `schemaVersion`).
- Added runtime emission validation + fail-fast path, append-only realtime event storage, per-session consumer checkpointing, and replay API semantics with strict `> watermark` filtering and `eventId` dedupe.
- Added contract tests covering event family validation, replay strictness from watermark, and deterministic transcript.final precedence over partials.
- Updated `docs/REALTIME_EVENT_CONTRACT.md` as single canonical schema doc including versioning/compatibility guidance for v1.x evolution.
- Next: wire LiveKit bridge producers to publish through the same realtime event publisher and expose validation/replay metrics to observability backend.
- Risk: test suite requires Node runtime with `node:sqlite` support.

### 2026-02-15 22:09 UTC
- Codex: Added `docs/PR_MERGE_PLAYBOOK.md` with dependency-ordered merge guidance for open PRs (#14, #17, #19, #9), likely merge blockers, and a production unblocking checklist.
- Recommended merge sequence: #14 → #17 → #19 → #9 (contract/persistence first, billing last).
- Risk: local environment has no GitHub CLI remote context, so guidance is dependency-based from backlog/contracts rather than inline PR diff review.

### 2026-02-15 22:19 UTC
- Codex: Expanded `docs/PR_MERGE_PLAYBOOK.md` from advisory guidance into an execution runbook with explicit TL;DR, exact git commands, exact GitHub UI merge steps, blocker-specific remediations, and merge go/no-go criteria.
- Next: owner executes merges in order #14 → #17 → #19 → #9 and ships #14+#17 first if time constrained.
- Risk: cannot inspect live GitHub checks from this environment; follow-up should confirm branch protection status per PR.
