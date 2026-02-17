# Onboarding, Commercial Readiness, and Support Model (MVP)

## Customer onboarding + tenant checklist

Use operator controls:
- `GET /v1/operator/tenants`
- `GET /v1/operator/tenants/:accountId/config`
- `POST /v1/operator/tenants/:accountId/config`

Checklist:
1. Create tenant config (`status`, `plan`, `maxConcurrentCalls`, feature flags).
2. Validate call/session creation and reconnect path.
3. Validate safety-gated action path.
4. Validate billing traceability endpoint for tenant.
5. Confirm governance data-map and deletion controls.
6. Run acceptance scenarios before pilot go-live.

## Commercial readiness package (sales/legal inputs)

Provide these artifacts per pilot:
- MVP Sellability Contract.
- SLO and release gate policy.
- Security + data governance baseline.
- Billing traceability chain and reconciliation policy.
- Incident response + support escalation model.

## Success metrics and ROI signals

Track for each pilot:
- call completion rate,
- reconnect recovery success rate,
- orchestration success vs safety-block ratio,
- billed usage traceability coverage,
- time-to-resolution for incidents,
- customer outcome signals (time saved, workflow completion speed).

## Lightweight support and escalation model

### Support tiers
- **P1 (active call outage / data integrity risk):** immediate response.
- **P2 (major degradation):** same business day.
- **P3 (non-blocking defects):** next release cycle.

### Escalation
1. Operator triage using incident runbook.
2. Engineering on-call for P1/P2 production incidents.
3. Post-incident summary added to evidence bundle + coordination log.
