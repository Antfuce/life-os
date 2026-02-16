# Production Readiness Layer (MVP)

This document is the umbrella for the **single cross-cutting production hardening milestone** that moves Life OS from prototype to sellable MVP readiness.

## Scope of this milestone

This layer hardens the current architecture across:
- realtime calls,
- API and orchestration,
- metering/billing/reconciliation,
- direct-to-prod delivery governance.

It intentionally avoids heavyweight enterprise platform complexity.

## Included artifacts

1. [MVP Sellability Contract](./MVP_SELLABILITY_CONTRACT.md)
2. [SLOs + release gates](./SLOS_RELEASE_GATES.md)
3. [Observability + incident response](./OBSERVABILITY_INCIDENTS.md)
4. [Security + data governance baseline](./SECURITY_DATA_GOVERNANCE.md)
5. [Billing readiness + traceability](./BILLING_TRACEABILITY.md)
6. [Onboarding, operator controls, commercial/support readiness](./ONBOARDING_COMMERCIAL_SUPPORT.md)
7. [Reconciliation operations policy (scheduler + retry)](./RECONCILIATION_OPERATIONS_POLICY.md)
8. [Live-call incident runbook](../runbooks/LIVE_CALL_INCIDENT_RESPONSE.md)
9. [Reconnect failure operations runbook](../runbooks/RECONNECT_FAILURE_OPERATIONS.md)
10. [LiveKit E2E evidence capture runbook](../runbooks/LIVEKIT_E2E_EVIDENCE_CAPTURE.md)
11. [Latest release evidence bundle](../releases/LATEST_EVIDENCE_BUNDLE.md)

## Production controls shipped in code

- Structured request logging with `traceId` propagation (`x-trace-id`).
- Health probes:
  - `GET /health`
  - `GET /health/ready`
- Metrics endpoint:
  - `GET /metrics?format=json|prom`
- Baseline API rate limiting and security headers.
- Reconciliation operational wiring:
  - `POST /v1/billing/reconciliation/hourly-trigger` (internal)
  - `POST /v1/billing/reconciliation/alerts/deliver` (internal)
- Data governance controls:
  - `GET /v1/governance/accounts/:accountId/data-map`
  - `POST /v1/governance/accounts/:accountId/delete`
  - `GET /v1/governance/accounts/:accountId/audit`
- Billing traceability:
  - `GET /v1/billing/accounts/:accountId/traceability`
- Tenant operator controls:
  - `GET /v1/operator/tenants` (internal)
  - `GET/POST /v1/operator/tenants/:accountId/config` (internal)

## Release gate integration

CI now requires:
- backend/unit/integration tests,
- buyer-visible release acceptance scenarios,
- production readiness docs + evidence bundle verification.

This keeps direct-to-prod velocity while enforcing minimum trust and operability standards for paid pilots.
