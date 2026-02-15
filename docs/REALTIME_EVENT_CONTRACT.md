# Realtime Event Contract (Canonical v1.0)

This is the single source of truth for backend-published realtime events.

## Envelope (required)

All events MUST use exactly these keys:

```json
{
  "eventId": "evt_01JABCDEF1234567890",
codex/review-progress-towards-mvp-hd413u
  "sessionId": "ses_9f8e7d6c5b4a",
  "sequence": 42,
  "ts": "2026-02-15T14:05:12.345Z",
  "type": "call.created",
=======
  "sequence": 42,
  "timestamp": "2026-02-16T10:00:00.000Z",
  "sessionId": "sess_123",
  "type": "call.started",
  "actor": {
    "role": "system",
    "id": "backend"
  },
 prod
  "payload": {},
  "schemaVersion": "1.0"
}
```

codex/review-progress-towards-mvp-hd413u
### Envelope fields

- `eventId` (string, required): Globally unique event identifier. Recommended: ULID/UUIDv7. Used for deduplication and replay checkpoints.
- `sequence` (integer, required): Monotonic per-session sequence number used for replay checkpoints and ordering.
- `ts` (string, required): RFC 3339 / ISO-8601 UTC timestamp indicating when the server emitted the event.
- `sessionId` (string, required): Stable identifier for the interview/recruitment session stream.
- `type` (string, required): Event type discriminator (examples in sections below).
- `payload` (object, required): Event-specific data.
- `schemaVersion` (string, required): Contract schema version of this envelope/event format.

## 2) Call-State Events

Call lifecycle events for voice/video sessions.

### `call.created`
Emitted when a call session record is created by backend.

Payload:
- `callId` (string)
- `channel` (`voice` | `video`)
- `direction` (`inbound` | `outbound`)
- `provider` (string)

### `call.active`
Emitted once a session transitions into active media state.

Payload:
- `callId` (string)
- `connectedAt` (timestamp)
- `providerSessionId` (string, optional)

### `call.ended`
Emitted when call terminates normally or by user hangup.

Payload:
- `callId` (string)
- `endedAt` (timestamp)
- `durationSeconds` (integer, >= 0)
- `endReason` (`completed` | `user_hangup` | `timeout` | `agent_handover`)

### `call.failed`
Emitted when session transitions into failed state.

Payload:
- `callId` (string, optional if setup failed before allocation)
- `code` (string)
- `message` (string)
- `retryable` (boolean)

## 3) Transcript and Speaker Events

Realtime transcription and diarization events.

### `transcript.partial`
Interim transcript hypothesis; **not durable**.

Payload:
- `utteranceId` (string)
- `speaker` (`user` | `agent` | `unknown`)
- `text` (string)
- `startMs` (integer)
- `endMs` (integer)
- `confidence` (number, 0..1, optional)

Rules:
- Multiple `transcript.partial` events may be emitted for the same `utteranceId`.
- New partials supersede previous partials for that same `utteranceId`.

### `transcript.final`
Finalized transcript segment; **durable** and eligible for downstream actions.

Payload:
- `utteranceId` (string)
- `speaker` (`user` | `agent`)
- `text` (string)
- `startMs` (integer)
- `endMs` (integer)
- `confidence` (number, 0..1, optional)

Rules:
- Exactly one `transcript.final` should exist per `utteranceId`.
- A `transcript.final` closes the partial stream for that utterance.
- Consumers must treat final as source-of-truth for storage and analytics.

### `speaker.changed`
Diarization boundary marker indicating active speaker transition.

Payload:
- `from` (`user` | `agent` | `unknown`)
- `to` (`user` | `agent` | `unknown`)
- `atMs` (integer)

## 4) Agent Action Events

Events emitted for AI-generated or system-generated actions in the workflow.

### `action.proposed`
An action candidate has been produced but not yet committed.

Payload:
- `actionId` (string)
- `actionType` (e.g. `generate_cv`, `schedule_interview`, `draft_outreach`)
- `summary` (string)
- `inputRefs` (array of identifiers, optional)

### `action.requires_confirmation`
Action is blocked pending explicit user confirmation.

Payload:
- `actionId` (string)
- `reason` (string)
- `confirmationToken` (string)
- `expiresAt` (timestamp, optional)

### `action.executed`
Action finished successfully.

Payload:
- `actionId` (string)
- `resultRef` (string, optional)
- `durationMs` (integer)

### `action.failed`
Action execution failed.

Payload:
- `actionId` (string)
- `code` (string)
- `message` (string)
- `retryable` (boolean)

## 5) Metering Events (Billable-Seconds Model)

Metering is session-scoped and computed in billable seconds.

### Billing model
- A billable second is any elapsed second while the session is in an active billed state (`call.active` through `call.ended`, excluding provider outages marked non-billable).
- Billing is calculated by the backend as authoritative source.
- Clients should display usage as estimate until final settlement.

### `usage.tick`
Periodic usage update.

Payload:
- `meterId` (string)
- `billableSeconds` (integer, cumulative)
- `estimatedCost` (number, optional)
- `currency` (string, optional)

### `usage.warning`
Threshold alert.

Payload:
- `meterId` (string)
- `thresholdType` (`seconds` | `cost`)
- `thresholdValue` (number)
- `currentValue` (number)
- `message` (string)

### `usage.stopped`
Metering halted due to limit or policy.

Payload:
- `meterId` (string)
- `finalBillableSeconds` (integer)
- `reason` (`budget_exceeded` | `policy_limit` | `manual_stop`)

## 6) Idempotency and Replay Rules (Reconnect Handling)

To ensure robust reconnect behavior and at-least-once delivery safety:

1. **Deduplication key**: Clients must dedupe by `eventId`.
2. **Ordering**: Consumers sort/process by increasing `sequence`; `ts` is informational.
3. **Checkpointing**: Clients persist the highest processed `sequence` per `sessionId`.
4. **Replay request**: On reconnect, clients send `afterSequence`; server replays events where `sequence > afterSequence`.
5. **At-least-once semantics**: Replayed events may include duplicates if transport uncertainty exists; dedupe is mandatory.
6. **Final transcript precedence**: `transcript.final` supersedes any cached partial content for the same `utteranceId` even if replayed out of perceived UI order.
7. **Terminal state**: After receiving terminal events (`call.ended`, `usage.stopped`), clients keep stream open only for late diagnostics (`call.failed`, `action.failed`) within server TTL window.
8. **Version mismatch**: If `schemaVersion` is unsupported, client must emit telemetry and fall back to safe display-only mode.

---

This contract is intentionally backend-centric per architecture constraints: frontend clients consume normalized backend events and must not connect directly to orchestration providers.
=======
### Field rules

- `eventId` (string, required): globally unique per event. Used as dedupe key.
- `sequence` (integer, server-assigned): monotonic per-session ordering key used for reconnect replay.
- `timestamp` (string, required): ISO-8601 UTC emit timestamp.
- `sessionId` (string, required): session stream partition key.
- `type` (string, required): event discriminator.
- `actor` (object, required):
  - `role`: `user | agent | system | provider`
  - `id`: non-empty string source identifier.
- `payload` (object, required): type-specific schema.
- `version` (string, required): currently `1.0`.

### Drift policy

The aliases `ts` and `schemaVersion` are **not supported** in canonical v1.0 emission. Events containing them must fail validation at publish boundary.

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
- `call.terminal_failure`
  - `callId` (string)
  - `failedAt` (ISO-8601)
  - `code` (string)
  - `message` (string)

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
- Consumers should store `sequence` as primary checkpoint; timestamp/eventId tuple remains supported fallback.
- Replay by sequence returns events where `event.sequence > lastAckSequence`.
- Watermark replay fallback returns only events strictly newer than `(timestamp, eventId)`:
  - `(event.timestamp > watermark.timestamp)` OR
  - `(event.timestamp == watermark.timestamp AND event.eventId > watermark.eventId)`
- Sorting is deterministic: `sequence ASC` for sequence replay, otherwise `timestamp ASC` then `eventId ASC`.
- Transcript state materialization prefers `transcript.final` over partials for same `utteranceId`.

## Versioning + compatibility (v1.x)

- `version` is semantic contract version for envelope + payload rules.
- v1.x guarantees:
  - existing required envelope keys remain stable,
  - existing event types remain backward compatible,
  - added payload fields are additive/optional by default.
- breaking changes (field removals/renames, incompatible type changes, alias removal after temporary support) require a major version bump (`2.0`).
- If temporary compatibility aliases are introduced in future, they must be explicitly documented with deprecation window and test coverage.
 prod
