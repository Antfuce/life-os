# Coordination Hub

Shared async coordination log for Codex ↔ OpenClaw ↔ humans.

## Working agreements
- Use this file as the run-by-run source of truth for handoffs.
- Each run appends a timestamped note with: changed / next / risks.
- Prefer small, reviewable increments aligned to `BACKLOG.md` priority.

---

## 2026-02-16T09:09:34Z — Codex run note
- Changed: Completed a 360° MVP readiness/red-team audit based on current backlog, architecture, status docs, and executable checks.
- Next: Resolve merge-conflict artifacts in backend/test files, then finish P0 LiveKit bridge + event schema/recovery tasks in canonical order.
- Risks: Current repo state includes syntax-breaking conflict markers that block lint/tests and hide real reliability/security regressions.

## 2026-02-16T11:46:00Z — Codex run note (review-mode alignment)
- Changed: Updated coordination guidance to support the new operating mode where OpenClaw executes Phase 0 coding and Codex performs architecture/quality review before production pushes.
- Next: OpenClaw should submit Phase 0 increments in strict dependency order (P0 #1 → #2 → #3 → #4), with per-PR evidence for schema validation, reconnect semantics, and replay idempotency.
- Risks: If review gates are skipped, unresolved merge artifacts and regression risk can propagate directly to production.

## 2026-02-16T11:55:00Z — OpenClaw run note (phase-a hardening)
- Changed: Completed backend/test merge-artifact cleanup, hardened realtime endpoint envelope validation, and added CI guards for conflict markers + backend syntax regressions.
- Next: Close out P0 explicitly with evidence-linked documentation, then kick off P1 scope (in-call orchestration + safety gates) against a green lint/test baseline.
- Risks: Direct-to-prod delivery without review artifacts can cause evidence drift between shipped code and documented acceptance proof.

## 2026-02-16T11:57:00Z — OpenClaw run note (P1 kickoff)
- Changed: Formally set P0 gate to GO in backlog docs and started P1 by hardening orchestration lifecycle with deterministic executed/failed acknowledgements plus explicit unsupported-action failure path (`action.failed`).
- Next: Continue P1 #5/#6 by adding durable action-id idempotency for repeat submits and migrate confirmation from boolean to explicit tokenized approval flow; then start P1 #7 transcript/event persistence hardening.
- Risks: Direct-to-prod cadence can outpace reviewer evidence unless each increment includes synchronized backlog + coordination updates and command-output proof.

## 2026-02-16T13:09:00Z — OpenClaw run note (P1 #7 start)
- Changed: Started P1 #7 by adding append-only transcript snapshot persistence (`transcript_snapshot` table + indexes), persisted-write path on transcript event ingest, and transcript snapshot query API for replay/debug (`/v1/realtime/sessions/:sessionId/transcript-snapshots`).
- Next: Add retention/compaction and replay-latency observability for snapshot growth, then move into P1 #8 metering records + idempotent billing event scaffolding.
- Risks: Snapshot growth can increase replay latency/cost without retention controls; direct-to-prod requires strict evidence updates each increment to avoid doc drift.

## 2026-02-16T13:49:00Z — OpenClaw run note (P1 #7 hardening complete)
- Changed: Completed P1 #7 hardening with transcript snapshot stats + compaction support (`/v1/realtime/sessions/:sessionId/transcript-snapshots/compact`) and replay diagnostics (`eventsQueryMs`, `snapshotsQueryMs`, row counts).
- Next: Move to P1 #8 metering records + idempotent billing emission path, then wire reconciliation scaffolding.
- Risks: Compaction policy must be tuned per traffic profile to avoid losing useful debug history while keeping replay latency bounded.

## 2026-02-16T14:20:00Z — OpenClaw run note (P1 #8/#9 kickoff increment)
- Changed: Added metering + billing persistence foundation: `usage_meter_record` + `billing_usage_event` tables, idempotent billing emission from canonical source events, and billing query APIs (`/v1/billing/sessions/:sessionId/usage-records`, `/v1/billing/sessions/:sessionId/events`).
- Next: Implement signed meter records, account-level aggregation, and `billing.adjustment.created` + dead-letter/failure routing to finish P1 #8/#9.
- Risks: Without account-level aggregation/signing, emitted usage remains session-scoped and not yet settlement-grade.

## 2026-02-16T14:33:00Z — OpenClaw run note (P1 #8/#9 complete)
- Changed: Completed P1 #8/#9 with signed metering records, account-level usage summaries, `billing.adjustment.created` emission, and billing dead-letter routing (`billing_dead_letter`) plus retrieval APIs.
- Next: Start P2 #10 hourly reconciliation scaffolding (windowing + mismatch report contract + alert hooks).
- Risks: Reconciliation logic is not yet active; billing correctness still depends on downstream consumers until P2 #10 closes.
