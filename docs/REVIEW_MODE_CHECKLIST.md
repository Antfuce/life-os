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

## Gate 5 — Production-readiness evidence in PR
- Clear change summary and risk notes.
- Command outputs included for lint/tests.
- Any deferred work explicitly tracked in `BACKLOG.md` and/or `docs/COORDINATION.md`.
