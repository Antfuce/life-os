# Call-Session → UI Event Mapping (Transitional Contract)

This document defines how the Home talk UI maps canonical realtime events (`call.*`, `transcript.*`, `orchestration.*`, `action.*`, `safety.*`) into the UI contract (`text.*`, `deliverable.*`, approval states).

## Goal

Backend is the source of truth for session/call/action lifecycle.
Frontend acts as:
1. intent dispatcher
2. thin renderer
3. compatibility adapter for existing UI components

## Session authority

- UI must create and activate a call session via:
  - `POST /v1/call/sessions`
  - `POST /v1/call/sessions/:sessionId/state` (`active`)
- UI should end session on reset:
  - `POST /v1/call/sessions/:sessionId/state` (`ended`)

## Canonical → UI mapping

| Canonical event | UI event/effect |
|---|---|
| `call.started` | `status` ("Call session started") |
| `call.connected` | `status` ("Call connected") |
| `call.error` | `error` |
| `call.terminal_failure` | `error` (non-recoverable) |
| `transcript.partial` (speaker=user) | update live voice caption |
| `transcript.final` (speaker=agent) | `text.done` append assistant message |
| `orchestration.action.requested` | `action.audit` (`pending/requested`) |
| `safety.blocked` + `reason=explicit_user_confirmation_required` | `confirm.required` |
| `safety.approved` | `action.approval.state=approved` |
| `action.executed` | `action.approval.state=executed` |
| `action.failed` | `action.approval.state=failed` |

## Transitional note

Current assistant text generation still uses `/v1/chat/stream` while the call-session/realtime lifecycle is now explicit and backend-authoritative.

Planned next step:
- replace chat-stream-only text transport with fully transport-backed realtime voice/text stream (LiveKit/realtime families), keeping browser Web Speech only as fallback.
