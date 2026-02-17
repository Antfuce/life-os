# MVP Sellability Contract

## Objective

Define what the MVP reliably delivers for paid pilots, and explicitly freeze out scope that causes drift.

## In-scope outcomes (sellable)

1. **Live call execution loop**
   - Session lifecycle (`created -> active -> ended|failed`) with reconnect semantics.
2. **Safe orchestration in-call**
   - Structured action execution with safety gating for sensitive actions.
3. **Deterministic audit trail**
   - Canonical realtime events + transcript snapshots + action audit records.
4. **Billing evidence chain**
   - Signed usage records, billing usage events, reconciliation artifacts, traceability endpoint.
5. **MVP operations baseline**
   - Health probes, metrics, incident runbook, rate limits, internal worker triggers.

## Non-goals (this milestone)

- Enterprise-grade multi-region HA.
- Full SOC2 control set implementation.
- Fully automated legal invoicing + payment settlement.
- Advanced policy engine/DSL for safety rules.
- Deep multi-tenant RBAC and delegated admin workflows.

## Explicit exclusions

- Per-customer custom workflow engines.
- Long-term data lake and BI stack.
- 24/7 staffed support NOC.
- Full outbound provider abstraction framework.

## Acceptance signal

MVP is considered sellable when:
- release acceptance scenarios pass in CI,
- production readiness evidence bundle is complete,
- SLO/reliability gate baseline and runbook package are present,
- reconciliation + alert worker wiring is operationally documented.
