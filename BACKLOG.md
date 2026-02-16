# BACKLOG.md — Life OS Priority Queue

> Canonical backlog: this file is the active source of truth for execution priority.
> If `backlog.md` differs, follow `BACKLOG.md`.


## Current Sprint: Realtime Call Foundation


### P0 — Critical Path (Do First)

#### 1. Call Session Service (Backend)
- **Status:** **Done** (P0 acceptance satisfied)
- **What:** API service for creating, listing, reading, and state-updating call sessions with strict auth and lifecycle rules.
- **Proof notes:**
  - **What changed:** Session CRUD + state transitions enforce authenticated ownership, immutable provider correlation after activation, and replay-safe/idempotent state updates.
  - **Where:** `server/index.mjs`, `server/db.mjs`, `server/test/call-sessions.test.mjs`
  - **Verification:**
    - `node --test server/test/call-sessions.test.mjs` → **8/8 pass** (includes auth scoping, transition guards, immutability, idempotent replay)
    - `npm run lint` → exits clean (no parse/lint blockers)
- **Owner:** Backend
- **Dependencies:** None (foundational)

#### 2. LiveKit Session Bridge (Realtime Transport)
- **Status:** **Done** (P0 acceptance satisfied)
- **What:** LiveKit transport is wired through backend token issuance + provider event ingestion/translation.
- **Proof notes:**
  - **What changed:** Added backend token endpoint, session↔room/participant mapping persistence, and LiveKit webhook/event translation into canonical `call.*` / `transcript.*` / `orchestration.*` events.
  - **Where:** `server/index.mjs`, `server/livekit-bridge.mjs`, `server/test/call-sessions.test.mjs`
  - **Verification:**
    - `node --test server/test/call-sessions.test.mjs` → **8/8 pass** (includes `livekit/token` and media-event canonical translation tests)
    - `node --test server/test/*.test.mjs` → **13/13 pass** baseline
- **Owner:** Backend
- **Dependencies:** Depends on **1. Call Session Service**

#### 3. Realtime Event Schema v1
- **Status:** **Done** (P0 acceptance satisfied)
- **What:** Canonical envelope + typed families are implemented and enforced at ingestion.
- **Proof notes:**
  - **What changed:** Added strict envelope validator (`eventId`, `sessionId`, `ts`, `type`, `payload`, `schemaVersion`), family/type payload checks, legacy key normalization (`timestamp`/`version`), and explicit rejection of unsupported envelope keys.
  - **Where:** `server/realtime-events.mjs`, `server/index.mjs` (`/v1/realtime/events`), `server/test/realtime-events.test.mjs`, `.github/workflows/ci.yml` (conflict/syntax CI guards)
  - **Verification:**
    - `node --test server/test/realtime-events.test.mjs` → **3/3 pass** (schema validation, deterministic replay ordering, transcript supersession)
    - `node --test server/test/*.test.mjs` → **13/13 pass** baseline
- **Owner:** Backend + OpenClaw
- **Dependencies:** Parallel with **1**, required by **2** and all downstream realtime work

#### 4. Failure Recovery + Reconnect Semantics
- **Status:** **Done** (P0 acceptance satisfied)
- **What:** Resume/reconnect path is implemented with replay/checkpoint semantics and terminal-failure signaling.
- **Proof notes:**
  - **What changed:** Added `resumeToken`, reconnect window expiry checks, replay from `lastAckSequence`, checkpoint persistence, and terminal failure event handling.
  - **Where:** `server/index.mjs` (`/v1/call/sessions/:sessionId/reconnect`, realtime replay/checkpoint endpoints), `server/db.mjs` (resume/ack columns), `server/test/call-sessions.test.mjs`
  - **Verification:**
    - `node --test server/test/call-sessions.test.mjs` → **8/8 pass** (includes reconnect validity, bad token rejection, replay from ACK)
    - `node --test server/test/*.test.mjs` → **13/13 pass** baseline
- **Owner:** Backend
- **Dependencies:** Depends on **1**, **2**, and **3**

---

### P1 — Orchestration, Safety, and Persistence

- **Gate:** ✅ **GO** (2026-02-16) — P0 #1–#4 acceptance criteria are documented as satisfied; reviewer decision is **go** for P1 kickoff.

#### 5. In-Call Orchestration Actions
- **Status:** **In progress**
- **What:** Execute structured orchestration actions while call is live.
- **Progress:** Action lifecycle now emits request + decision + terminal execution/failure events with deterministic ack semantics (`ack.status = executed|failed`, deterministic outcome refs).
- **Implementation:** `server/index.mjs` (`/v1/orchestration/actions/execute`), `server/test/safety-gates.test.mjs`
- **Verification:**
  - `node --test server/test/safety-gates.test.mjs` → includes deterministic fail-ack path for unsupported action types.
  - `node --test server/test/*.test.mjs` → green baseline.
- **Remaining scope:** wire real tool-executor outcomes (beyond stub result refs) and add deterministic ack behavior for repeated successful retries at action-id level.
- **Owner:** OpenClaw + Backend
- **Dependencies:** Depends on **2** and **3**

#### 6. Safety Gates for In-Call Execution
- **Status:** **In progress**
- **What:** Add explicit policy and confirmation gates before sensitive actions.
- **Progress:** Sensitive outreach/send-like actions are blocked without explicit confirmation; approved decisions emit `safety.approved`; blocked decisions emit `safety.blocked`; decisions are audit-persisted.
- **Implementation:** `server/index.mjs` (`createPolicyDecision`, `/v1/orchestration/actions/execute`, `/v1/actions/decision`), `server/test/safety-gates.test.mjs`
- **Verification:**
  - `node --test server/test/safety-gates.test.mjs` → blocked-without-confirmation + approved-with-confirmation paths pass.
- **Remaining scope:** move from boolean confirmation to explicit confirmation-token/approval workflow and tighten policy configuration surface.
- **Owner:** Backend
- **Dependencies:** Depends on **5** and **3**

#### 7. Transcript + Event Persistence
- **Status:** **In progress**
- **What:** Persist transcripts and event stream as source of truth.
- **Progress:** Added append-only transcript snapshot persistence derived from canonical realtime ingest, plus transcript snapshot query API for replay/debug.
- **Implementation:** `server/db.mjs` (`transcript_snapshot` table + indexes + query statements), `server/index.mjs` (snapshot write-on-ingest, `/v1/realtime/sessions/:sessionId/transcript-snapshots`, transcript state derived from persisted snapshots), `server/test/realtime-events.test.mjs`
- **Verification:**
  - `node --test server/test/realtime-events.test.mjs` → transcript supersession + append-only snapshot persistence checks pass.
  - `node --test server/test/*.test.mjs` → green backend baseline.
- **Remaining scope:** add retention/compaction policy + operational observability around snapshot growth and replay latency.
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

1. **Call Session Service (#1)** → required by LiveKit Session Bridge (#2) and Metering (#8)
2. **Event Schema v1 (#3)** → required by LiveKit Session Bridge (#2), Recovery (#4), Orchestration (#5), Persistence (#7), Metering (#8)
3. **LiveKit Session Bridge (#2)** + **Schema (#3)** → required by In-Call Orchestration (#5)
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
7. Call session API scaffolding added (`/v1/call/sessions*`)
8. Call session list endpoint added (`GET /v1/call/sessions` with user scoping + limit)
9. Call session auth hardening + strict lifecycle transition/idempotency rules added (`/v1/call/sessions*`)
10. Provider correlation identifiers added (`provider`, `providerRoomId`, `providerParticipantId`, `providerCallId`) with atomic activation updates

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

**2026-02-16:** Voice/media provider locked to LiveKit for realtime calls
- Source: product announcement and architecture alignment
- Implication: P0 transport work now targets LiveKit token issuance, room mapping, and backend event bridge

---

## Next 5 Tasks (Execution Order)

1. **In-Call Orchestration Actions (P1 #5)**
   - Emit `orchestration.action.requested`, execute backend tool actions, and return deterministic success/failure acknowledgment events.
2. **Safety Gates for In-Call Execution (P1 #6)**
   - Enforce explicit approval gates for sensitive actions and audit every decision path.
3. **Transcript + Event Persistence Hardening (P1 #7)**
   - Finalize append-only durability, replay/debug query surfaces, and transcript indexing guarantees.
4. **Usage Metering Pipeline (P1 #8)**
   - Capture billable usage units from call lifecycle + orchestration in normalized records.
5. **Billing Event Emission (P1 #9)**
   - Emit replay-safe billing events with idempotency guarantees and failure routing.

---

## Next Action

**Backend:** Continue P1 #7 persistence hardening (retention/observability), then begin P1 #8 usage metering records + idempotent billing event emission scaffolding.
