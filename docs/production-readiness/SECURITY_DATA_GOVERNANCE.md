# Security Baseline + Data Governance (MVP)

## Security baseline controls

### API/realtime hardening
- Canonical realtime event envelope validation.
- Unsupported envelope key rejection.
- Session ownership checks on user-scoped resources.
- Internal endpoints protected by `x-gateway-token`.
- Baseline route-level rate limiting.
- Security response headers (`nosniff`, frame deny, referrer policy).

### Auth validation
- `x-user-id` required for user-scoped routes.
- Body/header cross-user mismatch blocked.
- Internal worker/operator routes require gateway token.

### Secrets handling (MVP policy)
- Secrets sourced from environment variables.
- Never hardcode production secrets in repo.
- No secret values logged in structured request logs.

## Minimal threat model (MVP)

Primary threats:
1. Unauthorized cross-account access.
2. Replay/duplicate effects in billing/alerts.
3. Event contract corruption causing silent drift.
4. Abuse bursts impacting availability.

Current mitigations:
- auth ownership checks,
- idempotent event insertion keys,
- deterministic event IDs,
- rate limiting + health/metrics visibility,
- dead-letter paths for failed side effects.

## Data governance controls

### Data flow map endpoint
- `GET /v1/governance/accounts/:accountId/data-map`

### Retention windows (policy baseline)
- call sessions/realtime events: 30 days
- transcript snapshots: 14 days
- metering/billing/reconciliation/audit: 365 days

### Deletion capability
- `POST /v1/governance/accounts/:accountId/delete`
- Supports dry-run and execute modes.

### Auditability
- Governance actions write immutable entries into `governance_audit_log`.
- Query via:
  - `GET /v1/governance/accounts/:accountId/audit`
