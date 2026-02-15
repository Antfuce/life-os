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

codex/add-livekit-integration-endpoints
### 2026-02-15 22:38 UTC
- Codex: Implemented LiveKit session bridge scaffolding in backend with backend-only token issuance endpoint (`POST /v1/call/sessions/:sessionId/livekit/token`) that mints short-lived provider tokens and persists session↔room/participant mapping in call session metadata/correlation fields.
- Added LiveKit event ingestion endpoint (`POST /v1/call/livekit/events`) that translates provider transport signals into canonical backend event families (`call.*`, `transcript.*`, `orchestration.*`) before publishing via existing realtime fanout/event store.
- Added provider-correlation DB lookup statements and backend tests covering token issuance metadata mapping + canonical translation ingestion path.
- Risk: local runtime is Node v20 without `node:sqlite`, so integration tests cannot boot the server in this environment.
- Next: wire webhook authenticity verification for LiveKit events (signature/timestamp checks) and add provider lifecycle mappings for richer call end reasons.
=======
codex/enforce-event-envelope-in-backend
### 2026-02-15 22:42 UTC
- Codex: Enforced canonical realtime envelope shape at backend emit/validate boundaries to match `eventId`, `sessionId`, `ts`, `type`, `payload`, `schemaVersion`.
- Added ingestion normalization for legacy request keys (`timestamp` -> `ts`, `version` -> `schemaVersion`) and hard rejection for unknown/extra envelope keys.
- Updated realtime replay/checkpoint API semantics to use `afterTs`/`watermarkTs` and normalized checkpoint responses to the same naming.
- Expanded realtime schema tests with normalization coverage plus duplicate-idempotency and out-of-order replay ordering assertions.
- Risk: integration tests still depend on `node:sqlite`; current runtime is Node 20 without that module, so full server test execution remains blocked locally.
=======
 codex/add-policy-checks-for-sensitive-actions
### 2026-02-15 22:41 UTC
- Codex: Added backend policy gate endpoint `POST /v1/orchestration/actions/execute` that emits `orchestration.action.requested` then `safety.blocked|safety.approved` before any action execution.
- Enforced explicit `userConfirmation=true` for send/outreach and other high-risk external-send actions; blocked actions now return `403 SAFETY_BLOCKED` and never emit `action.executed`.
- Persisted audit metadata for every policy decision (`sessionId`, `policyId`, `reason`, `userId`, `metadata`, confirmation flag) into `action_audit`.
- Added integration tests (`server/test/safety-gates.test.mjs`) covering blocked vs approved flow ordering and execution gating.
- Risk: local runtime is Node 20 and lacks `node:sqlite`, so server/test suite cannot execute in this environment.
=======
### 2026-02-15 22:43 UTC
- Codex: Implemented call-session resume semantics with reconnect window enforcement and a new authenticated reconnect endpoint (`POST /v1/call/sessions/:sessionId/reconnect`) that validates `resumeToken` and replays from acknowledged sequence.
- Added per-session sequence + ack persistence (`realtime_event.sequence`, `call_session.lastAck*`) so clients can resume replay from `lastAckSequence`; checkpoint API now accepts `watermarkSequence` and persists session-level ack metadata.
- Added explicit irrecoverable terminal event emission (`call.terminal_failure`) when session transitions to `failed`, in addition to `call.error`, to keep UI terminal state deterministic.
- Added integration tests for reconnect token validation/replay and terminal failure event emission.
- Risk: runtime/tests remain blocked in this environment because Node 20 lacks `node:sqlite`; requires newer Node runtime to execute backend tests.
 prod
prod
 prod
