# Voice MVP Decision Form (Antonio + Mariana)

Purpose: lock the product choices needed to ship realtime voice with controllable persona switching.

Owner: Product
Status: Draft

---

## 1) Voice Provider + Runtime Mode

- Primary runtime mode for production voice:
  - [ ] LiveKit realtime call transport
  - [ ] Other (specify): __________________
- Fallback mode when provider/session fails:
  - [ ] Text-only chat
  - [ ] Browser speech fallback
  - [ ] Disable session and prompt retry

Decision notes:
- ___________________________________________

---

## 2) Persona Voice Selection

### Antonio
- Voice ID / preset: __________________
- Type:
  - [ ] Stock TTS
  - [ ] Cloned voice
- Tone style (short): __________________

### Mariana
- Voice ID / preset: __________________
- Type:
  - [ ] Stock TTS
  - [ ] Cloned voice
- Tone style (short): __________________

Decision notes:
- ___________________________________________

---

## 3) Voice Switching Behavior

- Who can switch voices during a session?
  - [ ] User only
  - [ ] Orchestrator only
  - [ ] Both
- Mid-session switch allowed?
  - [ ] Yes
  - [ ] No
- Default session voice mode:
  - [ ] Antonio
  - [ ] Mariana
  - [ ] Both (orchestrator decides by turn)

Decision notes:
- ___________________________________________

---

## 4) Clone Safety + Consent Policy

- Clone usage requires explicit consent before first use:
  - [ ] Yes
  - [ ] No
- Consent capture location:
  - [ ] Onboarding
  - [ ] In-session confirmation
  - [ ] Account settings
- Clone voice allowed for outreach/send-like actions:
  - [ ] Yes
  - [ ] No
- Required audit fields:
  - [ ] policyId
  - [ ] decision actor
  - [ ] sessionId
  - [ ] timestamp

Decision notes:
- ___________________________________________

---

## 5) Latency + Quality Bar (Go/No-Go)

- Max acceptable perceived response latency after user turn: ______ ms
- Minimum acceptable reconnect success rate in UAT: ______ %
- Blocking quality failures (must be zero):
  - [ ] wrong persona voice used
  - [ ] unsafe send without confirmation
  - [ ] reconnect fails without recovery state shown

Decision notes:
- ___________________________________________

---

## 6) UAT Scenario Set (minimum 5)

1. CV generation via voice
2. Interview prep via voice
3. Outreach draft with confirmation gate
4. Mid-session persona switch
5. Disconnect/reconnect and recovery

Owner can add scenarios:
- ___________________________________________

---

## 7) Sign-Off

- Product owner: __________________
- Date: __________________
- Approved for implementation:
  - [ ] Yes
  - [ ] No
- Approved for production rollout:
  - [ ] Yes
  - [ ] No
