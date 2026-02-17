# Reconciliation Operations Policy (MVP)

## Objective

Define production operating defaults for hourly reconciliation and alert delivery worker behavior.

## Scheduler policy

Internal automation can be enabled via env:

- `RECONCILIATION_AUTOMATION_ENABLED=true`
- `RECONCILIATION_AUTOMATION_HOURLY_INTERVAL_MS` (default 1h)
- `RECONCILIATION_AUTOMATION_WORKER_INTERVAL_MS` (default 2m)
- `RECONCILIATION_AUTOMATION_WORKER_BATCH` (default 100)

Status endpoint:
- `GET /v1/billing/reconciliation/scheduler/status` (internal)

Manual/internal trigger endpoints:
- `POST /v1/billing/reconciliation/hourly-trigger`
- `POST /v1/billing/reconciliation/alerts/deliver`

## Alert retry/backoff defaults

- `ALERT_DELIVERY_MAX_ATTEMPTS=5`
- exponential backoff from `ALERT_DELIVERY_BASE_BACKOFF_MS` (default 30s)
- capped by `ALERT_DELIVERY_MAX_BACKOFF_MS` (default 30m)

Failure behavior:
1. Non-terminal delivery failure → attempts increment + `nextAttemptAtMs` scheduled.
2. Terminal failure (attempts exhausted or forced) → alert marked `dead_lettered` and mirrored to `billing_dead_letter`.

## Late-arrival policy (MVP)

Current default windowing:
- lookback 1h,
- lateness 5m.

Operational recommendation:
- keep current defaults for hourly cadence,
- run ad-hoc backfill reconciliation with explicit windows for known delayed ingest periods.

## Operational control checklist

1. Confirm `/health/ready` and `/metrics` before enabling automation.
2. Enable automation only with valid `OPENCLAW_GATEWAY_TOKEN` and DB persistence.
3. If alert webhook unavailable, accept `delivered_stub` mode temporarily and monitor dead letters.
4. Track pending/dead-letter growth and adjust retry policy conservatively.
