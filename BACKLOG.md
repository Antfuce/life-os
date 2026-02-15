# BACKLOG.md — Life OS Priority Queue

> Canonical backlog: this file is the active source of truth for execution priority.
> If `backlog.md` differs, follow `BACKLOG.md`.

## Current Sprint: UI Contract v1.0 Implementation

### P0 — Critical Path (Do First)

#### 1. CV Module Integration Test
- **Status:** Code complete, needs testing
- **What:** Test `deliverable.cv` event flow end-to-end
- **Steps:**
  1. Set `VITE_API_ORIGIN` to tunnel URL
  2. Publish Base44
  3. Say "Build my CV" → verify MODE_ACTIVATE fires
  4. Verify CV module appears with actions
  5. Test "Export PDF" action
- **Owner:** Atlas (me)
- **Blocked by:** Stable tunnel URL

#### 2. Interview Module Wiring
- **Status:** In progress (UI wired, needs end-to-end verification)
- **What:** Wire `deliverable.interview` into LiveInterviewPrep
- **Pattern:** Same as CV module (deliverable → component)
- **Components:** LiveInterviewPrep.jsx
- **Owner:** Atlas

#### 3. Outreach Module + Confirmation Gates
- **Status:** In progress (module + confirm endpoint added, needs integrated QA)  
- **What:** Create OutreachModule + wire `confirm.required` events
- **Critical:** Must implement execution gates before any send capability
- **Owner:** Atlas

---

### P1 — Infrastructure Hardening

#### 4. Stable Tunnel Setup
- **Status:** Quick tunnels dying
- **What:** Named Cloudflare tunnel with systemd
- **URL:** lifeos-api.kefirkotunnel.trycloudflare.com
- **Owner:** Atlas + Toni (needs DNS check)

#### 5. Error UI + Observability
- **Status:** Basic error display exists
- **What:** 
  - Better error states when API down
  - Request ID correlation
  - User-friendly error messages
- **Owner:** Atlas

---

### P2 — Product Polish

#### 6. Voice Mode Completion
- **Status:** Partial (STT working, TTS exists)
- **What:**
  - Fix mic permissions in Base44
  - Smooth voice→text transitions
  - Voice-activated mode switching
- **Owner:** Future sprint

#### 7. Persistence Layer
- **Status:** SQLite exists, not wired to UI
- **What:** Load conversations on startup
- **Owner:** Future sprint

---

### P3 — Future (Post-MVP)

#### 8. Multi-User Support
- **What:** User identity/auth mapping
- **Note:** Base44 user → backend userId

#### 9. Real-time Collaboration
- **What:** Antonio & Mariana simultaneous editing

#### 10. Mobile App
- **What:** React Native or PWA

---

## Completed This Session ✅

1. UI Contract v1.0 schema defined
2. Backend emits structured events (server/index.mjs)
3. Event reducer hook created (useUIEventReducer.js)
4. Module registry created (moduleRegistry.js)
5. CV components wired to event system (LiveCVPreview, InlineCVPreview)
6. GitHub prod branch updated

---

## Blockers

| Blocker | Impact | Resolution |
|---------|--------|------------|
| Tunnel URL keeps changing | Can't test on Base44 | Set up named tunnel or use quick tunnel + update env |
| GPT-5.2 Codex costs | Token burn | Use Moonshot/OpenCode Kimi (free) |

---

## Decision Log

**2026-02-15:** Abandoned VPS local setup. Returned to Base44.
- Reason: Infrastructure cost ($1-2/hour) > value delivered
- Decision: Use VPS only for API gateway, not full-stack hosting

**2026-02-15:** Implemented UI Contract v1.0
- Backend owns intent detection and mode lifecycle
- Frontend only renders based on events
- Backward compatibility maintained

---

## Next Action

**Atlas:** Get stable tunnel URL → Update Base44 env → Test CV flow
