# Runbook — Live Call Incident Response (MVP)

## Trigger conditions

Use this runbook for:
- active call failures,
- reconnect storms,
- missing realtime events/transcripts,
- safety gate misfires during live call,
- reconciliation alert delivery failures affecting pilot trust.

## 0) Stabilize immediately

1. Check liveness/readiness:
   - `GET /health`
   - `GET /health/ready`
2. Check metrics snapshot:
   - `GET /metrics?format=json`
3. Confirm whether incident is call-path specific or global.

## 1) Protect customer impact first

- If active call path is degraded, prioritize:
  1. session reconnect behavior,
  2. transcript/event persistence,
  3. safety gating (block risky sends if uncertain).

## 2) Triage checklist

- Fetch affected call session and replay window.
- Verify checkpoint progression (`lastAckSequence`).
- Check for dead letters:
  - `GET /v1/billing/accounts/:accountId/dead-letters`
- Check reconciliation runs and alert status:
  - `GET /v1/billing/accounts/:accountId/reconciliation/runs`

## 3) Containment options

- Temporarily pause hourly reconciliation trigger.
- Run alert delivery in dry-run mode first:
  - `POST /v1/billing/reconciliation/alerts/deliver` with `{ "dryRun": true }`
- Force manual reconciliation for affected account/window.

## 4) Recovery validation

After mitigation:
- rerun release acceptance tests,
- verify health/readiness/metrics improve,
- confirm billing traceability chain remains intact.

## 5) Post-incident

Document in release evidence bundle:
- impact window,
- root cause,
- customer communication summary,
- corrective actions and follow-up owner.
