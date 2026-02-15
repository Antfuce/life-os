# MVP Execution Plan (P0 Tracks 1–3)

_Last updated: 2026-02-16_

This plan breaks the current critical-path backend work into deployable slices so we can move quickly without coupling too many risks into one release.

## Can this be done "in one run"?

**Recommendation: no.**

Tracks #1, #2, and #3 are tightly related, but shipping them as one bundle increases rollback risk and slows debugging. Instead, run them as **4 sequential deploy slices** with clear verification checkpoints.

## Deploy Slice A — P0 #1 completion hardening

Scope:
- Finalize call session lifecycle hardening.
- Ensure all `/v1/call/sessions*` operations are ownership-safe and idempotent.
- Ensure provider correlation fields are persisted and immutable after first successful activation.

Exit criteria:
- Session create/get/update/list behavior is replay-safe.
- Invalid lifecycle transitions are blocked.
- Error responses are normalized and traceable.

## Deploy Slice B — Runtime parity unblock (required before meaningful CI confidence)

Scope:
- Pin runtime to a Node version that supports `node:sqlite`.
- Update developer docs and CI runtime to avoid Node 20 mismatch.

Exit criteria:
- Integration tests that boot server DB layer can run in CI and local with documented runtime.
- "Works on my machine" drift is removed.

## Deploy Slice C — P0 #3 event schema enforcement

Scope:
- Lock event envelope fields (`eventId`, `timestamp`, `sessionId`, `type`, `actor`, `payload`, `version`).
- Add emission-time schema validation for canonical event families.
- Add replay and dedupe contract checks (`eventId` watermark behavior).

Exit criteria:
- Realtime events are contract-valid by default.
- Replay semantics are deterministic.

## Deploy Slice D — P0 #2 LiveKit bridge

Scope:
- Backend-only LiveKit token issuance.
- Session-to-room/participant mapping persistence.
- Provider-native event normalization into canonical `call.*` events.

Exit criteria:
- Frontend receives normalized call state from backend only.
- Provider disconnect/reconnect flow emits canonical state transitions.

## Execution order and ownership

1. Slice A (Backend)
2. Slice B (Backend + DevEx/CI)
3. Slice C (Backend + OpenClaw contract touchpoint)
4. Slice D (Backend transport integration)

## Risks to watch

- Runtime mismatch blocking integration tests (`node:sqlite` availability).
- Schema drift between docs and emitted backend events.
- Provider event duplication causing state regression without strict dedupe.

## Immediate next action

Start **Slice B** now so test signal is trustworthy before bridge/schema iterations proceed.
