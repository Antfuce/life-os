# Realtime Event Contract

This document defines the canonical realtime event model used between the backend/API and subscribed clients (web, mobile, dashboards) for recruitment sessions.

## 1) Event Envelope

All realtime messages **must** be wrapped in the following envelope.

```json
{
  "eventId": "evt_01JABCDEF1234567890",
  "timestamp": "2026-02-15T14:05:12.345Z",
  "sessionId": "ses_9f8e7d6c5b4a",
  "type": "call.started",
  "actor": {
    "role": "system",
    "id": "backend"
  },
  "payload": {},
  "version": "1.0"
}
```

### Envelope fields

- `eventId` (string, required): Globally unique event identifier. Recommended: ULID/UUIDv7. Used for deduplication and replay checkpoints.
- `timestamp` (string, required): RFC 3339 / ISO-8601 UTC timestamp indicating when the server emitted the event.
- `sessionId` (string, required): Stable identifier for the interview/recruitment session stream.
- `type` (string, required): Event type discriminator (examples in sections below).
- `actor` (object, required): Origin of the event.
  - `actor.role` (enum): `user` | `agent` | `system` | `provider`.
  - `actor.id` (string): Identifier for actor source (`candidate_123`, `agent_scheduler`, `backend`, `twilio`).
- `payload` (object, required): Event-specific data.
- `version` (string, required): Contract schema version of this envelope/event format.

## 2) Call-State Events

Call lifecycle events for voice/video sessions.

### `call.started`
Emitted when a call attempt is initiated.

Payload:
- `callId` (string)
- `channel` (`voice` | `video`)
- `direction` (`inbound` | `outbound`)
- `provider` (string)

### `call.connected`
Emitted once media path is confirmed active.

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

### `call.error`
Emitted when call setup/transport fails.

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
- A billable second is any elapsed second while the session is in an active billed state (`call.connected` through `call.ended`, excluding provider outages marked non-billable).
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
2. **Ordering**: Consumers sort/process by `timestamp`; if equal, break ties by lexical `eventId`.
3. **Checkpointing**: Clients persist the highest processed watermark as `(timestamp, eventId)` per `sessionId`.
4. **Replay request**: On reconnect, clients send last watermark; server replays events strictly after that watermark.
5. **At-least-once semantics**: Replayed events may include duplicates if transport uncertainty exists; dedupe is mandatory.
6. **Final transcript precedence**: `transcript.final` supersedes any cached partial content for the same `utteranceId` even if replayed out of perceived UI order.
7. **Terminal state**: After receiving terminal events (`call.ended`, `usage.stopped`), clients keep stream open only for late diagnostics (`call.error`, `action.failed`) within server TTL window.
8. **Version mismatch**: If `version` is unsupported, client must emit telemetry and fall back to safe display-only mode.

---

This contract is intentionally backend-centric per architecture constraints: frontend clients consume normalized backend events and must not connect directly to orchestration providers.
