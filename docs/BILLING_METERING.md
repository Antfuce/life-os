# Billing & Metering Spec (Backend Authoritative)

## Scope
This document defines backend billing entities and controls for metered OpenClaw usage.

## Data Model Entities

### 1) `call_session`
Tracks one provider-bound backend call (`/v1/chat/turn`, `/v1/chat/stream`).

Key fields:
- `id`
- `conversationId`
- `route`
- `provider`
- `model`
- `startedAtMs`, `endedAtMs`
- `internalDurationMs`
- `providerDurationMs`
- `status`

### 2) `usage_interval`
Stores authoritative usage windows from backend wall-clock windows.

Key fields:
- `callSessionId`
- `usageType` (`llm_wall_clock_ms`)
- `source` (`backend_authoritative_window`)
- `startAtMs`, `endAtMs`
- `quantityMs`
- `unitCostCents`, `costCents`

### 3) `rating_rule`
Defines unit pricing and thresholds by usage type.

Key fields:
- `usageType`
- `unitCostCents`
- `warningThresholdCents`
- `hardStopThresholdCents`
- effective window (`effectiveFromMs`, `effectiveToMs`)

### 4) `invoice_record`
Stores invoice-period summaries and rollups.

Key fields:
- `invoiceNumber`
- `periodStartMs`, `periodEndMs`
- `subtotalCents`, `adjustmentsCents`, `totalCents`
- `providerDurationMs`, `internalDurationMs`

### 5) `billing_adjustment`
Stores manual/system corrections and credits/debits linked to invoices.

Key fields:
- `invoiceRecordId`
- `adjustmentType`
- `amountCents`
- `reason`
- `createdBy`

### 6) `billing_audit_event`
Immutable audit trail for every billing-affecting event.

Examples:
- `billing.call_session_started`
- `billing.provider_request_sent`
- `billing.usage_interval_recorded`
- `billing.warning_threshold_reached`
- `billing.hard_stop_threshold_reached`
- `billing.call_session_stopped`

## Authoritative Metering Rule
All usage metering MUST use backend-captured timestamps (`Date.now()` in API process), never frontend clocks.

## Reconciliation Job Spec
Run a scheduled reconciliation job (e.g. every 15 minutes and daily closeout):

1. Select closed `call_session` rows where both `internalDurationMs` and `providerDurationMs` are present.
2. Compute delta:
   - `deltaMs = ABS(providerDurationMs - internalDurationMs)`
   - `deltaPct = deltaMs / GREATEST(providerDurationMs, 1)`
3. Mark sessions requiring review if:
   - `deltaMs > 5000` OR
   - `deltaPct > 0.05`
4. Emit `billing_audit_event` with reconciliation result.
5. Create `billing_adjustment` candidates (draft) if invoice period is open.
6. Surface counts in ops dashboard (future endpoint).

## Spend Controls
Two guardrails are enforced:
- Warning threshold (`LIFE_OS_METERING_WARNING_MS` and rating-rule warning cents).
- Hard stop (`LIFE_OS_METERING_HARD_STOP_MS` and rating-rule hard-stop cents).

On hard-stop, backend aborts stream or rejects response with 429.

## Env Tunables
- `LIFE_OS_COST_PER_MS_CENTS`
- `LIFE_OS_WARNING_THRESHOLD_CENTS`
- `LIFE_OS_HARD_STOP_THRESHOLD_CENTS`
- `LIFE_OS_METERING_WARNING_MS`
- `LIFE_OS_METERING_HARD_STOP_MS`
