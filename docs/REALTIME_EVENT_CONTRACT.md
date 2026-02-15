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

- `call.*`, `transcript.*`, `orchestration.*`, `action.*`, `safety.*`, `billing.*`, `usage.*`

See backend validator in `server/realtime-events.mjs` for exact payload constraints.

## Runtime validation at emission boundary

Backend publisher validates every event envelope + payload before persistence/fanout:

- Invalid events fail fast (HTTP 400 / publisher exception).
- Server logs `realtime_event_validation_failed` with errors.
- In-memory counters track emitted, invalid, and deduped events.

## Replay, watermark, dedupe, reconnect

- Event store is append-only and session-scoped.
- Dedupe key is `eventId` (idempotent insert).
- Each persisted event is assigned a per-session `sequence` for reconnect replay.
- Primary replay semantics: events where `sequence > afterSequence`.
- Watermark fallback semantics: events strictly newer than `(ts, eventId)`.
- Transcript materialization always prefers `transcript.final` over partial events for same `utteranceId`.

## Versioning + compatibility (v1.x)

- `schemaVersion` is semantic contract version for envelope + payload rules.
- v1.x guarantees stable envelope keys and backward-compatible payload evolution.
- Breaking changes require a major version bump (`2.0`).
