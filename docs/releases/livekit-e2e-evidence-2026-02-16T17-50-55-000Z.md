# LiveKit E2E Integration Evidence

Generated: 2026-02-16T17:51:33.405Z

## Context
- baseUrl: http://127.0.0.1:3901
- userId: pilot-livekit
- sessionId: sess_2a6e8f373ee9b883
- roomName: room_sess_2a6e8f373ee9b883
- participantIdentity: backend-pilot-livekit-bac7bc6245

## Session API
- GET /v1/call/sessions/:sessionId status: 200
- session status: created

## Event Replay
- GET /v1/realtime/sessions/:sessionId/events status: 200
- event count: 2
- unique event types:
  - call.connected
  - call.started

## Manual verification checklist
- [x] Room join succeeded in LiveKit UI (operator confirmed at 2026-02-16 17:50 UTC)
- [x] Media publish/subscription observed (operator confirmed at 2026-02-16 17:50 UTC)
- [x] Backend captured expected canonical call events (`call.started`, `call.connected`) in replay for this session.
- [x] Evidence attached to release bundle (`docs/releases/LATEST_EVIDENCE_BUNDLE.md`)

## Raw diagnostics

```json
{
  "eventsQueryMs": 0,
  "snapshotsQueryMs": 0,
  "totalQueryMs": 0,
  "snapshotLimit": 2000,
  "snapshotRowsRead": 0,
  "eventsRowsRead": 2
}
```
