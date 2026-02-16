# Runbook — Reconnect Failure Operations (P0 #4)

## Purpose

Operational guide for reconnect-specific reliability failures in live call sessions.

## Primary failure modes

1. **Invalid resume token spikes** (`INVALID_RESUME_TOKEN`).
2. **Reconnect window expiry spikes** (`RECONNECT_WINDOW_EXPIRED`).
3. **ACK regression / stale checkpoint submissions** (late client checkpoint writes).
4. **Replay drift concerns** (inconsistent event windows returned on reconnect).

## Detection signals (MVP baseline)

Use:
- `GET /metrics?format=json` route stats + error totals.
- `GET /health/ready` for readiness state.
- call-session/replay endpoint responses sampled for affected accounts.

Alerting expectation (MVP):
- Trigger P1 investigation if reconnect endpoint 4xx/5xx error pattern persists >10 minutes and impacts active calls.
- Trigger P2 if stale checkpoint ignores surge unexpectedly (possible client drift).

## Immediate triage steps

1. Confirm backend readiness:
   - `GET /health/ready`
2. Inspect reconnect behavior for affected session:
   - `POST /v1/call/sessions/:sessionId/reconnect`
3. Verify latest acknowledged sequence did not regress:
   - `POST /v1/realtime/sessions/:sessionId/checkpoint`
   - confirm `ackUpdate` semantics (`applied` vs `ignored`)
4. Validate replay determinism:
   - compare duplicate reconnect requests for same `lastAckSequence`

## Containment actions

- If client sends stale checkpoints: keep server-side stale-sequence ignore behavior enabled.
- If tokens expire too quickly for field conditions: tune reconnect window policy.
- If replay payload is too large: reduce client ack lag and snapshot fetch limits.

## Recovery validation

- Reconnect requests succeed with valid token.
- Duplicate reconnect requests return deterministic replay window.
- Late checkpoint attempts no longer regress `lastAckSequence`.
- Session continues normal call/event flow.

## Post-incident

Document in evidence bundle + coordination log:
- impact window,
- affected sessions,
- root cause category,
- config/code action taken,
- regression test references.
