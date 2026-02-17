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
- UI executes assistant turns through call session:
  - `POST /v1/call/sessions/:sessionId/turn`

## Canonical → UI mapping

| Canonical event | UI event/effect |
|---|---|
| `call.started`/`call.connecting` | `call.runtime.state=connecting` + status |
| `call.connected` | `call.runtime.state=connected` + status |
| `call.reconnecting` | `call.runtime.state=reconnecting` + status |
| `call.ended` | `call.runtime.state=ended` |
| `call.error`/`call.terminal_failure` | `call.runtime.state=failed` + `error` (recoverable actions shown) |
| `call.voice.config.updated` | `voice.config` (persona/label/profile/policy/synthesis gate) |
| `call.turn.owner_changed` | `turn.state` (`listening`/`thinking`) |
| `call.turn.timing` | `turn.state` timing payload + SLO breach cue |
| `transcript.partial` (speaker=user) | update live voice caption |
| `transcript.final` (speaker=agent) | `text.done` append assistant message |
| `orchestration.action.requested` | `action.audit` (`pending/requested`) |
| `safety.blocked` + `reason=explicit_user_confirmation_required` | `confirm.required` |
| `safety.blocked` + `actionType~voice` | explicit voice-policy error state |
| `safety.approved` | `action.approval.state=approved` |
| `action.executed` | `action.approval.state=executed` |
| `action.failed` | `action.approval.state=failed` |

## Current transport note

`Home.jsx` turn execution is now call-session authoritative (`POST /v1/call/sessions/:sessionId/turn`) and no longer uses `/v1/chat/stream`.

Browser Web Speech remains available only as an explicit fallback mode (non-transport-realtime) and is labeled as such in UI.
