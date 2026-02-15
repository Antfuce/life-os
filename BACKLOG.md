# BACKLOG.md — Life OS Priority Queue

## Current Sprint: Realtime Call Foundation

### P0 — Critical Path (Do First)

#### 1. Call Session Service (Backend)
- **Status:** Not started
- **What:** Implement API service that creates, tracks, and terminates call sessions.
- **Scope:**
  > Canonical backlog: this file is the active source of truth for execution priority.

> If `backlog.md` differs, follow `BACKLOG.md`.
- Create session lifecycle (`created`, `active`, `ended`, `failed`)
  - Assign `sessionId` and correlation metadata
  - Enforce auth/user mapping for each call session
- **Owner:** Backend
- **Dependencies:** None (foundational)

#### 2. WebSocket Gateway (Realtime Transport)
- **Status:** Not started
- **What:** Build realtime gateway for bidirectional events between frontend and backend.
- **Scope:**
  - Session-authenticated websocket upgrade
  - Heartbeats/ping-pong
  - Server fan-out for session events
  - Backpressure/basic rate limits
- **Owner:** Backend
- **Dependencies:** Depends on **1. Call Session Service**

#### 3. Realtime Event Schema v1
- **Status:** Not started
- **What:** Define and version canonical event contract for call flow.
- **Scope:**
  - Event envelope (`eventId`, `sessionId`, `ts`, `type`, `payload`, `schemaVersion`)
  - Required event families: `call.*`, `transcript.*`, `orchestration.*`, `safety.*`, `billing.*`
  - Validation and schema docs
- **Owner:** Backend + OpenClaw
- **Dependencies:** Parallel with **1**, required by **2** and all downstream realtime work

#### 4. Failure Recovery + Reconnect Semantics
- **Status:** Not started
- **What:** Ensure call continuity under disconnects and transient backend failures.
- **Scope:**
  - Session resume token and reconnect window
  - Idempotent event replay from last acknowledged sequence
  - Retry policies and terminal failure events for UX
- **Owner:** Backend
- **Dependencies:** Depends on **1**, **2**, and **3**

---

### P1 — Orchestration, Safety, and Persistence

#### 5. In-Call Orchestration Actions
- **Status:** Not started
- **What:** Execute structured orchestration actions while call is live.
- **Scope:**
  - Action intents emitted as `orchestration.action.requested`
  - Backend tool execution + result events
  - Deterministic acknowledgement/failure handling
- **Owner:** OpenClaw + Backend
- **Dependencies:** Depends on **2** and **3**

#### 6. Safety Gates for In-Call Execution
- **Status:** Not started
- **What:** Add explicit policy and confirmation gates before sensitive actions.
- **Scope:**
  - Human confirmation for outreach/send-like operations
  - Policy engine events (`safety.blocked`, `safety.approved`)
  - Audit metadata in every decision
- **Owner:** Backend
- **Dependencies:** Depends on **5** and **3**

#### 7. Transcript + Event Persistence
- **Status:** Not started
- **What:** Persist transcripts and event stream as source of truth.
- **Scope:**
  - Append-only event store for all realtime events
  - Transcript snapshots + utterance indexing
  - Query APIs for session replay and debugging
- **Owner:** Backend
- **Dependencies:** Depends on **3**; unlocks **4**, **9**, and **10**

---

### P1/P2 — Metering, Billing, and Reconciliation

#### 8. Usage Metering Pipeline (P1)
- **Status:** Not started
- **What:** Capture usage units from call lifecycle and orchestration actions.
- **Scope:**
  - Meter call duration and billable action counts
  - Normalize units per session/account
  - Emit signed metering records
- **Owner:** Backend
- **Dependencies:** Depends on **1**, **3**, and **7**

#### 9. Billing Event Emission (P1)
- **Status:** Not started
- **What:** Emit billing-grade events from metering and persistence layers.
- **Scope:**
  - `billing.usage.recorded`, `billing.adjustment.created`
  - Idempotency keys and replay-safe publishing
  - Dead-letter queue for failed downstream writes
- **Owner:** Backend
- **Dependencies:** Depends on **8** and **7**

#### 10. Hourly Charging Reconciliation Job (P2)
- **Status:** Not started
- **What:** Reconcile metered usage vs charged amounts every hour.
- **Scope:**
  - Aggregation window and late-arrival handling
  - Diff reports for under/over-charge
  - Alerting hooks for unresolved mismatches
- **Owner:** Backend
- **Dependencies:** Depends on **9**

---

### Deferred / Roadmap (Not in Current Sprint)

#### Deferred from earlier chat-first scope

#### D1. CV Module Integration Test
- **Status:** Deferred (roadmap)
- **Reason:** Superseded by call-first realtime foundation sequencing.

#### D2. Interview Module Wiring
- **Status:** Deferred (roadmap)
- **Reason:** Depends on stable in-call orchestration events.

#### D3. Outreach Module + Confirmation Gates
- **Status:** Partially re-scoped into **P1 #6 Safety Gates**
- **Reason:** UI module work deferred until backend safety/event contracts are stable.

#### D4. Stable Tunnel Setup
- **Status:** Deferred
- **Reason:** Ops hardening task, not blocker for core architecture contract in this sprint.

#### D5. Error UI + Observability
- **Status:** Deferred
- **Reason:** Keep scope on transport/orchestration/persistence foundation first.

### P3 — Future (Post-MVP)

#### 8. Multi-User Support
- **What:** User identity/auth mapping
- **Note:** Base44 user → backend userId

#### 9. Real-time Collaboration
- **What:** Antonio & Mariana simultaneous editing

#### 10. Mobile App
- **What:** React Native or PWA

---

## Dependency Chain (Explicit)

1. **Call Session Service (#1)** → required by WebSocket Gateway (#2) and Metering (#8)
2. **Event Schema v1 (#3)** → required by Gateway (#2), Recovery (#4), Orchestration (#5), Persistence (#7), Metering (#8)
3. **WebSocket Gateway (#2)** + **Schema (#3)** → required by In-Call Orchestration (#5)
4. **In-Call Orchestration (#5)** → required by Safety Gates (#6)
5. **Persistence (#7)** + **Metering (#8)** → required by Billing Events (#9)
6. **Billing Events (#9)** → required by Hourly Reconciliation (#10)

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

**Backend:** Start P0 #1 Call Session Service, then implement P0 #3 Event Schema in parallel
