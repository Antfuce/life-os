# Reliability SLOs and Release Gates (MVP)

## Baseline SLOs

These are pilot-stage targets, not enterprise guarantees.

- **Availability target:** >= 99.5%
- **API p95 latency target:** <= 350 ms (core API calls)
- **Server 5xx error-rate target:** <= 1%

Runtime snapshot is exposed through:
- `GET /health`
- `GET /metrics?format=json|prom`

## Error budget policy

Monthly error budget = 0.5% unavailability.

If budget burn exceeds threshold:
1. Freeze net-new feature work.
2. Prioritize incident fixes and reliability debt.
3. Re-run release acceptance and evidence bundle.

## Release gates (CI + review)

A change is release-eligible only when all pass:

1. Lint/typecheck + backend tests pass.
2. Release acceptance scenarios pass (`server/test/release-acceptance.test.mjs`).
3. Production readiness tests pass (`server/test/production-readiness.test.mjs`).
4. Evidence bundle exists and includes mandatory sections.
5. Review checklist gates are satisfied for direct-to-prod.

## Operational SLO caveat

SLO telemetry is currently in-process (single-node memory metrics). This is valid for MVP pilots but should be moved to durable time-series storage before scale-up.
