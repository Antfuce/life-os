# UAT Go/No-Go Run Sheet (Release Blocking)

Use this exactly before UI UAT/release.  
**Strict rule:** release is **GO only if all 5 gates are PASS**. If any gate fails, release is **NO-GO**.

---

## Quick usage

1. Set environment values (`BASE_URL`, `USER_ID`).
2. Run each gate command block.
3. Record PASS/FAIL in the report template at the end.
4. If any gate is FAIL, stop and fix before UAT signoff.

---

## Gate 1 — Repo Hygiene Gate (Blocker)

### Objective
No merge/conflict artifacts in runtime/test files.

### Command (mandatory evidence)
```bash
cd /root/.openclaw/workspace/projects/life-os
grep -RInE "^(\s*(<<<<<<<|=======|>>>>>>>|codex/[^[:space:]]*|prod)\s*)$" server src || true
```

### PASS criteria
- Command returns **no output**.

### FAIL criteria
- Any match appears.

---

## Gate 2 — Backend Executability Gate (Blocker)

### Objective
Backend starts and core health/contract endpoints respond before frontend/UAT.

### Commands
```bash
cd /root/.openclaw/workspace/projects/life-os/server

# Start backend (new shell/process)
HOST=127.0.0.1 PORT=3001 OPENCLAW_GATEWAY_TOKEN=test-token node index.mjs
```

In another shell:
```bash
BASE_URL="http://127.0.0.1:3001"

curl -fsS "$BASE_URL/health" >/tmp/uat-health.json
curl -fsS "$BASE_URL/health/ready" >/tmp/uat-ready.json
curl -fsS "$BASE_URL/" >/tmp/uat-root.json

# verify endpoint map includes call lifecycle + turn
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('/tmp/uat-root.json','utf8'));const e=j?.endpoints||{};const ok=e.createCallSession&&e.updateCallSession&&e.reconnectCallSession&&e.executeCallTurn; if(!ok){console.error('Missing required endpoints in root contract map');process.exit(1)}; console.log('OK endpoints:', e.createCallSession, e.executeCallTurn);"
```

### PASS criteria
- `/health` and `/health/ready` return 200.
- Root contract map includes call lifecycle + turn endpoint definitions.

### FAIL criteria
- Backend fails to start, health endpoints fail, or contract map missing required endpoints.

---

## Gate 3 — Call Lifecycle Gate (Blocker)

### Objective
Prove end-to-end call session lifecycle including reconnect baseline behavior.

### Commands
```bash
BASE_URL="http://127.0.0.1:3001"
USER_ID="uat-user-1"

# 1) create session
CREATE_JSON=$(curl -fsS -X POST "$BASE_URL/v1/call/sessions" \
  -H "content-type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"userId":"'"$USER_ID"'"}')

SESSION_ID=$(node -e "const j=JSON.parse(process.argv[1]);console.log(j.session.sessionId)" "$CREATE_JSON")
RESUME_TOKEN=$(node -e "const j=JSON.parse(process.argv[1]);console.log(j.session.resumeToken)" "$CREATE_JSON")

# 2) activate
curl -fsS -X POST "$BASE_URL/v1/call/sessions/$SESSION_ID/state" \
  -H "content-type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"userId":"'"$USER_ID"'","status":"active","provider":"web-realtime","providerRoomId":"room-'"$SESSION_ID"'","providerParticipantId":"part-'"$USER_ID"'","providerCallId":"call-'"$SESSION_ID"'"}' >/tmp/uat-activate.json

# 3) turn through call-session path
curl -fsS -X POST "$BASE_URL/v1/call/sessions/$SESSION_ID/turn" \
  -H "content-type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"userId":"'"$USER_ID"'","sessionId":"'"$SESSION_ID"'","conversationId":"'"$SESSION_ID"'","persona":"both","text":"UAT check: draft outreach","messages":[{"role":"user","content":"UAT check: draft outreach"}]}' >/tmp/uat-turn.json

# 4) realtime replay baseline
curl -fsS "$BASE_URL/v1/realtime/sessions/$SESSION_ID/events?afterSequence=0&limit=200" \
  -H "x-user-id: $USER_ID" >/tmp/uat-events.json

# 5) reconnect baseline
curl -fsS -X POST "$BASE_URL/v1/call/sessions/$SESSION_ID/reconnect" \
  -H "content-type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"userId":"'"$USER_ID"'","resumeToken":"'"$RESUME_TOKEN"'"}' >/tmp/uat-reconnect.json

# 6) end
curl -fsS -X POST "$BASE_URL/v1/call/sessions/$SESSION_ID/state" \
  -H "content-type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"userId":"'"$USER_ID"'","status":"ended"}' >/tmp/uat-ended.json

# assert key event families exist
node -e "const fs=require('fs');const ev=JSON.parse(fs.readFileSync('/tmp/uat-events.json','utf8')).events||[];const t=new Set(ev.map(e=>e.type));const required=['call.started','call.connected','transcript.final'];const miss=required.filter(x=>!t.has(x));if(miss.length){console.error('Missing realtime events:',miss.join(','));process.exit(1)};console.log('OK realtime families present');"
```

### PASS criteria
- Session created, activated, turn succeeds, reconnect succeeds, end succeeds.
- Realtime events include core family baseline (`call.started`, `call.connected`, `transcript.final`).

### FAIL criteria
- Any lifecycle step fails or required event families missing.

---

## Gate 4 — UI Contract + Safety Gate (Blocker)

### Objective
Base44/Home UI correctly renders backend events and enforces safety confirmation flow.

### Manual UAT checklist (Base44)
1. Open Home talk UI (latest publish + hard refresh).
2. Start talk session (mic or typed input).
3. Confirm assistant response appears from backend-driven flow (not stuck spinner).
4. Trigger outreach-style request that requires confirmation.
5. Verify confirmation modal appears (no silent auto-send).
6. Click **Confirm** and verify action state transitions to approved/executed.
7. Repeat and click **Cancel** and verify cancelled path is shown.
8. Verify no frontend-only fake success path when backend blocks.

### Optional API corroboration during UI test
```bash
# Replace with session captured during UI run
SESSION_ID="<ui-session-id>"
USER_ID="<ui-user-id>"
BASE_URL="http://127.0.0.1:3001"

curl -fsS "$BASE_URL/v1/realtime/sessions/$SESSION_ID/events?afterSequence=0&limit=500" \
  -H "x-user-id: $USER_ID" >/tmp/uat-ui-events.json

node -e "const fs=require('fs');const ev=JSON.parse(fs.readFileSync('/tmp/uat-ui-events.json','utf8')).events||[];const t=ev.map(e=>e.type);console.log('types:',[...new Set(t)].join(', '));"
```

### PASS criteria
- UI renders call/transcript/action events correctly.
- Confirmation/safety flow is enforced in UI and follows backend decisioning.

### FAIL criteria
- Missing confirmation, unsafe auto-send, or UI state diverges from backend events.

---

## Gate 5 — Docs Sync Gate (Blocker)

### Objective
Status/roadmap docs match real tested system before UAT signoff.

### Commands
```bash
cd /root/.openclaw/workspace/projects/life-os

# docs touched for this UAT cycle
git diff --name-only HEAD~1..HEAD | grep -E "BACKLOG.md|docs/COORDINATION.md|docs/REVIEW_MODE_CHECKLIST.md|docs/runbooks/UAT_GO_NO_GO_RUN_SHEET.md" || true

# marker scan in docs as hygiene check
grep -RInE "^(\s*(<<<<<<<|=======|>>>>>>>|codex/[^[:space:]]*|prod)\s*)$" BACKLOG.md docs || true
```

### PASS criteria
- Docs reflect current architecture/testing reality.
- No merge/conflict artifacts in backlog/docs.

### FAIL criteria
- Docs stale/misaligned or conflict markers present.

---

## Final Go/No-Go Rule

- **GO:** Gate 1 = PASS, Gate 2 = PASS, Gate 3 = PASS, Gate 4 = PASS, Gate 5 = PASS.
- **NO-GO:** any single gate = FAIL.

---

## Copy-paste report template

```text
UAT GO/NO-GO REPORT
Timestamp (UTC):
Commit/Branch:
Environment (Base44 publish/build ref):

Gate 1 — Repo Hygiene: PASS|FAIL
Evidence:

Gate 2 — Backend Executability: PASS|FAIL
Evidence:

Gate 3 — Call Lifecycle: PASS|FAIL
Evidence:

Gate 4 — UI Contract + Safety: PASS|FAIL
Evidence:

Gate 5 — Docs Sync: PASS|FAIL
Evidence:

FINAL DECISION: GO|NO-GO
Blockers (if NO-GO):
Owner + next action:
```
