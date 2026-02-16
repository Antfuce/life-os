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

## Gate 5 — Production-readiness evidence (PR or direct-to-prod)
Evidence requirements apply to every increment regardless of delivery path (pull request merge or direct push to `prod`).

Required artifacts:
1. Clear change summary + risk notes.
2. Command outputs for lint/tests/syntax checks.
3. Links or explicit references to updated `BACKLOG.md` and `docs/COORDINATION.md` entries.
4. Explicit reviewer go/no-go decision before any Phase transition.

## Gate 6 — MVP Sellability release gate (mandatory)
Before any release intended for paid pilots:
1. `docs/releases/LATEST_EVIDENCE_BUNDLE.md` is present and complete.
2. Production readiness docs under `docs/production-readiness/` are updated for scope changes.
3. Runbook exists and is current: `docs/runbooks/LIVE_CALL_INCIDENT_RESPONSE.md`.
4. Buyer-visible acceptance scenarios pass: `server/test/release-acceptance.test.mjs`.
5. Production readiness checks pass: `server/test/production-readiness.test.mjs` + `scripts/verify-production-readiness.mjs`.
