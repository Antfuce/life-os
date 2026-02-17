# Observability Package and Incident Response (MVP)

## What is instrumented in code

### Structured logging
- Request completion logs include:
  - `traceId`, `method`, `route`, `statusCode`, `durationMs`.
- `traceId` is propagated via `x-trace-id` header.

### Health checks
- `GET /health` for liveness + SLO snapshot.
- `GET /health/ready` for readiness (DB probe + gate context).

### Metrics
- `GET /metrics?format=json|prom`
- Includes:
  - total requests,
  - 5xx errors,
  - rate-limited requests,
  - route-level latency/error summaries,
  - SLO measured values and gate pass/fail.

### Alerting path (reconciliation)
- Reconciliation mismatches create `billing_reconciliation_alert` records.
- Delivery worker endpoint:
  - `POST /v1/billing/reconciliation/alerts/deliver`.
- Failed deliveries are dead-lettered into `billing_dead_letter`.

## Live-call incident optimization

Use runbooks:
- [LIVE_CALL_INCIDENT_RESPONSE.md](../runbooks/LIVE_CALL_INCIDENT_RESPONSE.md)
- [RECONNECT_FAILURE_OPERATIONS.md](../runbooks/RECONNECT_FAILURE_OPERATIONS.md)

Priority order during incident:
1. Protect active calls/reconnect path.
2. Stop external side effects from unsafe orchestration.
3. Preserve event/audit trail.
4. Recover customer-visible service.
