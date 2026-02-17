# Voice MVP UAT Runsheet

Use this runsheet to decide if the current build is ready for user-facing realtime voice testing.

---

## Gate A — Hygiene + Build Confidence

- [ ] No merge/conflict artifacts in touched runtime and test files
- [ ] Backend starts and `/health` returns OK
- [ ] Critical endpoint smoke checks pass:
  - [ ] `/v1/call/sessions`
  - [ ] `/v1/call/sessions/:sessionId/livekit/token`
  - [ ] `/v1/call/sessions/:sessionId/reconnect`
  - [ ] `/v1/chat/stream`

Result: PASS / FAIL
Notes:

---

## Gate B — Realtime Voice Session Basics

- [ ] Voice session can be created from UI
- [ ] Call state transitions are visible (`connecting`, `connected`, `reconnecting`, `ended|failed`)
- [ ] User can complete a full spoken turn and hear response audio
- [ ] Latency feels live (sub-second orchestration update perception)

Result: PASS / FAIL
Notes:

---

## Gate C — Persona Voice Behavior

- [ ] Antonio voice is correctly used when selected
- [ ] Mariana voice is correctly used when selected
- [ ] Mid-session switching follows product decision form
- [ ] Active voice is clearly visible in UI

Result: PASS / FAIL
Notes:

---

## Gate D — Safety + Confirmation

- [ ] Outreach/send-like action requires explicit confirmation
- [ ] Confirm path executes and logs decision
- [ ] Cancel path blocks execution and logs decision
- [ ] Timeout path blocks execution and logs decision

Result: PASS / FAIL
Notes:

---

## Gate E — Recovery + Continuity

- [ ] Simulated disconnect triggers reconnect state
- [ ] Resume token path restores continuity
- [ ] Replay from last acknowledged sequence is correct
- [ ] Terminal failure state is visible if reconnect cannot recover

Result: PASS / FAIL
Notes:

---

## Final UAT Decision

- [ ] GO for broader internal testing
- [ ] HOLD (fix blockers)

Blockers:
- ____________________________________

Approver:
Date:
