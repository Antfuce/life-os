# Realtime Event Contract (Canonical v1.0)

This is the single source of truth for backend-published realtime events.

## Envelope (required)

All events MUST use exactly these keys:

```json
{
  "eventId": "evt_01JABCDEF1234567890",
  "sessionId": "sess_123",
  "ts": "2026-02-16T10:00:00.000Z",
  "type": "call.started",
  "payload": {},
  "schemaVersion": "1.0"
}
```

### Field rules

- `eventId` (string, required): globally unique per event. Used as dedupe key.
- `sessionId` (string, required): session stream partition key.
- `ts` (string, required): ISO-8601 UTC emit timestamp.
- `type` (string, required): event discriminator.
- `payload` (object, required): type-specific schema.
- `schemaVersion` (string, required): currently `1.0`.

### Drift policy

Canonical emission only supports these six keys. Ingestion boundaries MAY normalize legacy keys (`timestamp` -> `ts`, `version` -> `schemaVersion`) before validation. Unknown extra keys must fail validation.

## Required event families and payload schemas

## `call.*`

- `call.started`
  - `callId` (string)
  - `channel` (`voice | video`)
  - `direction` (`inbound | outbound`)
  - `provider` (string)
- `call.connected`
  - `callId` (string)
  - `connectedAt` (ISO-8601)
  - `providerSessionId` (string, optional)
- `call.ended`
  - `callId` (string)
  - `endedAt` (ISO-8601)
  - `durationSeconds` (integer >= 0)
  - `endReason` (`completed | user_hangup | timeout | agent_handover`)
- `call.error`
  - `callId` (string, optional)
  - `code` (string)
  - `message` (string)
  - `retryable` (boolean)

## `transcript.*`

- `transcript.partial`
  - `utteranceId` (string)
  - `speaker` (`user | agent | unknown`)
  - `text` (string)
  - `startMs` (integer >= 0)
  - `endMs` (integer >= 0)
  - `confidence` (number, optional)
- `transcript.final`
  - `utteranceId` (string)
  - `speaker` (`user | agent`)
  - `text` (string)
  - `startMs` (integer >= 0)
  - `endMs` (integer >= 0)
  - `confidence` (number, optional)

Determinism rule: `transcript.final` always supersedes all `transcript.partial` events for the same `utteranceId`.

## `orchestration.*` / `action.*`

- `orchestration.action.requested`
  - `actionId` (string)
  - `actionType` (string)
  - `summary` (string)
- `action.proposed`
  - `actionId` (string)
  - `actionType` (string)
  - `summary` (string)
- `action.requires_confirmation`
  - `actionId` (string)
  - `reason` (string)
  - `confirmationToken` (string)
- `action.executed`
  - `actionId` (string)
  - `durationMs` (integer >= 0)
  - `resultRef` (string, optional)
- `action.failed`
  - `actionId` (string)
  - `code` (string)
  - `message` (string)
  - `retryable` (boolean)

## `safety.*`

- `safety.blocked`
  - `policyId` (string)
  - `reason` (string)
  - `decision` (string)
- `safety.approved`
  - `policyId` (string)
  - `decision` (string)

## `billing.*` / `usage.*`

- `billing.usage.recorded`
  - `meterId` (string)
  - `billableSeconds` (integer >= 0)
- `billing.adjustment.created`
  - `adjustmentId` (string)
  - `meterId` (string)
  - `amount` (number)
  - `currency` (string)
- `usage.tick`
  - `meterId` (string)
  - `billableSeconds` (integer >= 0)
- `usage.warning`
  - `meterId` (string)
  - `thresholdType` (`seconds | cost`)
  - `thresholdValue` (number)
  - `currentValue` (number)
  - `message` (string)
- `usage.stopped`
  - `meterId` (string)
  - `finalBillableSeconds` (integer >= 0)
  - `reason` (`budget_exceeded | policy_limit | manual_stop`)

## Runtime validation at emission boundary

Backend publisher validates every event envelope + payload before persistence/fanout:

- Invalid events fail fast (HTTP 400 / publisher exception).
- Server logs `realtime_event_validation_failed` with errors.
- In-memory counters track emitted, invalid, and deduped events.

## Replay, watermark, and dedupe semantics

- Event store is append-only and session-scoped.
- Dedupe key is `eventId` (idempotent insert).
- Consumers store watermark tuple `(ts, eventId)` per `sessionId`.
- Replay query returns only events strictly newer than watermark:
  - `(event.ts > watermark.ts)` OR
  - `(event.ts == watermark.ts AND event.eventId > watermark.eventId)`
- Sorting is deterministic: `ts ASC`, then `eventId ASC`.
- Transcript state materialization prefers `transcript.final` over partials for same `utteranceId`.

## Versioning + compatibility (v1.x)

- `schemaVersion` is semantic contract version for envelope + payload rules.
- v1.x guarantees:
  - existing required envelope keys remain stable,
  - existing event types remain backward compatible,
  - added payload fields are additive/optional by default.
- breaking changes (field removals/renames, incompatible type changes, alias removal after temporary support) require a major version bump (`2.0`).
- If temporary compatibility aliases are introduced in future, they must be explicitly documented with deprecation window and test coverage.
