# OpenClaw Delivery Review Checklist (Phase 0)

Purpose: when OpenClaw is implementing code and pushing to prod, Codex reviews each increment against MVP architecture and release safety.

## Gate 1 — Repo hygiene (must pass first)
- No unresolved merge markers (`<<<<<<<`, `=======`, `>>>>>>>`) in changed files.
- Lint passes for frontend/backend touched scope.
- Backend tests for touched scope execute successfully.

## Gate 2 — Architecture contract compliance
- Frontend calls backend only (no direct OpenClaw/database calls).
- Backend remains the only layer persisting product data.
- OpenClaw remains orchestration-only.

## Gate 3 — Realtime contract integrity
- Event envelope exactly matches canonical v1 fields: `eventId`, `sessionId`, `ts`, `type`, `payload`, `schemaVersion`.
- Event families emitted match `call.*`, `transcript.*`, `orchestration.*`, `safety.*`, `billing.*` requirements.
- Invalid event payloads fail fast with observable errors.

## Gate 4 — Session safety and recovery
- Lifecycle transitions enforced: `created -> active -> ended|failed` only.
- Session ownership validated on each call-session mutation.
- Reconnect path requires resume token and supports replay from last acknowledged sequence.
- Duplicate provider/webhook updates are idempotent.

## Gate 5 — Production-readiness evidence (PR **or** direct-to-prod push)
- Clear change summary and risk notes are recorded in the handoff artifact (PR description or production push note).
- Command outputs included for lint/tests/syntax checks in the same handoff artifact.
- Any deferred work explicitly tracked in `BACKLOG.md` and/or `docs/COORDINATION.md`.
- Explicit reviewer go/no-go decision is recorded before phase transitions.

## Gate 6 — Roadmap + architecture sync guard
- `BACKLOG.md` statuses are updated to reflect implementation reality for touched P0/P1 items.
- `docs/COORDINATION.md` includes a timestamped changed/next/risks note for the push.
- Any hybrid architecture exceptions (legacy frontend paths, temporary fallbacks) are documented with removal follow-up tasks.
