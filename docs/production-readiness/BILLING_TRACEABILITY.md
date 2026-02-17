# Billing Readiness Foundations (MVP)

## Deterministic billing evidence chain

1. Usage event occurs (`call.ended`, `action.executed`).
2. Signed usage record persisted (`usage_meter_record`).
3. Billing event persisted (`billing_usage_event`).
4. Reconciliation run compares expected vs actual quantities.
5. Mismatches generate alerts and delivery/dead-letter records.

## Traceability endpoint

- `GET /v1/billing/accounts/:accountId/traceability`

Returns linked artifacts:
- usage records,
- billing events,
- reconciliation runs,
- trace links (`usageRecordId -> billingEventId`).

## Reconciliation operations

- Manual run:
  - `POST /v1/billing/reconciliation/run`
- Hourly trigger (internal):
  - `POST /v1/billing/reconciliation/hourly-trigger`
- Alert worker (internal):
  - `POST /v1/billing/reconciliation/alerts/deliver`

## Remaining production hardening for billing

- Cron-managed automatic schedule policy.
- Explicit retry/backoff + poison-message threshold for alert delivery.
- Finalized late-arrival backfill policy for reconciliation windows.
