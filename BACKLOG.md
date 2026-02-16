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
- **Status:** **Partially implemented**
- **What:** Wire LiveKit transport through backend token issuance + provider event ingestion/translation.
- **Current status:** Token issuance, session↔room mapping persistence, canonical event translation, and webhook authenticity/replay protection are in place.
- **Acceptance criteria:**
  - [x] Backend issues short-lived LiveKit access token tied to session/user mapping.
  - [x] Inbound provider events translate into canonical `call.*` / `transcript.*` / `orchestration.*` families.
  - [x] Inbound provider event authenticity/replay protection is enforced and tested (signature verification + replay guard).
  - [ ] End-to-end provider integration check against live LiveKit environment (room join/publish/subscribe roundtrip) is captured as repeatable evidence.
- **Implementation:** `server/index.mjs`, `server/livekit-bridge.mjs`, `server/db.mjs` (`livekit_webhook_receipt`), `server/test/call-sessions.test.mjs`
- **Verification (current):**
  - `node --test server/test/call-sessions.test.mjs` (token + translation + webhook signature/replay coverage)
- **Owner:** Backend
- **Dependencies:** Depends on **1. Call Session Service**

#### 3. Realtime Event Schema v1
- **Status:** **Done**
- **What:** Enforce canonical realtime envelope + typed event families.
- **Current status:** Canonical envelope validation, family payload contracts, deterministic replay semantics, and schema-regression fixture guard are implemented.
- **Acceptance criteria:**
  - [x] Canonical envelope (`eventId`, `sessionId`, `ts`, `type`, `payload`, `schemaVersion`) is validated at ingest.
  - [x] Legacy key normalization (`timestamp`/`version`) and unsupported-envelope-key rejection are enforced.
  - [x] Deterministic replay ordering and transcript supersession behavior are covered by tests.
  - [x] Full payload-contract coverage across all emitted families (including newly added billing/dead-letter paths) is documented and test-locked with schema fixtures.
  - [x] Contract regression guard exists for newly introduced event types before prod push (beyond endpoint-level assertions).
- **Implementation:** `server/realtime-events.mjs` (`SUPPORTED_EVENT_TYPES`), `server/test/fixtures/realtime-event-contract.v1.json`, `server/test/realtime-schema-contract.test.mjs`, `server/test/realtime-events.test.mjs`, `.github/workflows/ci.yml`
- **Verification:**
  - `node --test server/test/realtime-schema-contract.test.mjs`
  - `node --test server/test/realtime-events.test.mjs`
- **Owner:** Backend + OpenClaw
- **Dependencies:** Parallel with **1**, required by **2** and all downstream realtime work

#### 4. Failure Recovery + Reconnect Semantics
- **Status:** **Partially implemented**
- **What:** Provide resilient resume/reconnect behavior with replay/checkpoint semantics and terminal-failure signaling.
- **Current status:** Resume token checks, replay-from-ack, and checkpoint persistence are implemented; resilience hardening is not fully closed.
- **Acceptance criteria:**
  - [x] Reconnect requires valid `resumeToken` and enforces reconnect window expiry.
  - [x] Replay starts from acknowledged sequence/checkpoint and is deterministic.
  - [x] Terminal session failure emits canonical failure event path.
  - [ ] Concurrency/chaos reconnect tests cover duplicate reconnect attempts, ack races, and late checkpoints.
  - [ ] Operational runbook + alerting expectations for reconnect failure modes are documented.
- **Implementation:** `server/index.mjs` (`/v1/call/sessions/:sessionId/reconnect`, realtime replay/checkpoint endpoints), `server/db.mjs` (resume/ack columns), `server/test/call-sessions.test.mjs`
- **Verification (current):**
  - `node --test server/test/call-sessions.test.mjs`
- **Owner:** Backend
- **Dependencies:** Depends on **1**, **2**, and **3**

#### P0 Phase-Gate Checklist (Mandatory before P1 continuation)
- **Checklist status:** ✅ Completed (governance pass executed)
- **Gate decision:** 🚧 **HOLD** until remaining P0 acceptance criteria in #2/#3/#4 are closed.

- [x] Repo hygiene sweep completed on backend code/tests (`server/**/*.mjs`, `server/test/**/*.mjs`) for merge markers and branch-label debris.
- [x] Hygiene verification commands executed (`grep` scans for `<<<<<<<`, `=======`, `>>>>>>>`, and stray branch-label lines) with no findings in backend sources/tests.
- [x] Docs alignment completed: P0 #2/#3/#4 statuses reconciled to partially implemented with explicit acceptance criteria and current-state notes.
- [x] Cross-agent audit log restored: latest production pushes and this stabilization pass documented in `docs/COORDINATION.md` using changed / next / risks format.
- [x] Stabilization sign-off recorded by execution owner (OpenClaw run note + baseline checks).

**Feature freeze rule:** Until this gate is flipped from **HOLD** to **GO**, only stabilization/closure work for P0 acceptance criteria is allowed; no net-new P1 feature scope.

---

### P1 — Orchestration, Safety, and Persistence

- **Gate:** 🚧 **HOLD** (2026-02-16 stabilization pass) — P0 #2/#3/#4 are now explicitly tracked as partial; no additional P1 feature expansion until the formal P0 phase-gate checklist above stays green and unresolved acceptance criteria are closed.

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
- **Status:** **Done**
- **What:** Persist transcripts and event stream as source of truth.
- **Progress:** Implemented append-only transcript snapshot persistence from canonical realtime ingest, transcript snapshot query API, retention compaction endpoint, and replay/snapshot query diagnostics.
- **Implementation:** `server/db.mjs` (`transcript_snapshot` table, stats + compaction queries), `server/index.mjs` (snapshot write-on-ingest, `/v1/realtime/sessions/:sessionId/transcript-snapshots`, `/v1/realtime/sessions/:sessionId/transcript-snapshots/compact`, diagnostics in replay APIs), `server/test/realtime-events.test.mjs`
- **Verification:**
  - `node --test server/test/realtime-events.test.mjs` → transcript supersession, append-only persistence, stats, and compaction behavior pass.
  - `node --test server/test/*.test.mjs` → green backend baseline.
- **Owner:** Backend
- **Dependencies:** Depends on **3**; unlocks **4**, **9**, and **10**

---

### P1/P2 — Metering, Billing, and Reconciliation

#### 8. Usage Metering Pipeline (P1)
- **Status:** **Done**
- **What:** Capture usage units from call lifecycle and orchestration actions.
- **Progress:** Added durable, idempotent usage metering records for call duration and action execution, plus account-level summary aggregation and signed meter records (`hs256.v1`).
- **Implementation:** `server/db.mjs` (`usage_meter_record` schema/signature/account fields + account summary queries), `server/index.mjs` (metering pipeline + `/v1/billing/accounts/:accountId/usage-summary`), `server/test/metering-billing.test.mjs`
- **Verification:**
  - `node --test server/test/metering-billing.test.mjs` → call/action dedupe + account usage summary + signature assertions pass.
  - `node --test server/test/*.test.mjs` → green backend baseline.
- **Owner:** Backend
- **Dependencies:** Depends on **1**, **3**, and **7**

#### 9. Billing Event Emission (P1)
- **Status:** **Done**
- **What:** Emit billing-grade events from metering and persistence layers.
- **Progress:** Added idempotent `billing.usage.recorded` emission, implemented `billing.adjustment.created`, persisted billing event log with event type metadata, and added dead-letter routing path for publish failures.
- **Implementation:** `server/db.mjs` (`billing_usage_event`, `billing_dead_letter`), `server/index.mjs` (`/v1/billing/sessions/:sessionId/events`, `/v1/billing/sessions/:sessionId/dead-letters`, `/v1/billing/adjustments`), `server/test/metering-billing.test.mjs`
- **Verification:**
  - `node --test server/test/metering-billing.test.mjs` → usage event idempotency, adjustment emission, and dead-letter routing checks pass.
- **Owner:** Backend
- **Dependencies:** Depends on **8** and **7**

#### 10. Hourly Charging Reconciliation Job (P2)
- **Status:** **Done (MVP baseline)**
- **What:** Reconcile metered usage vs charged amounts every hour.
- **Progress:** Added reconciliation scaffolding with windowing + lateness controls, persisted run/mismatch/alert artifacts, scheduler trigger endpoint (`/v1/billing/reconciliation/hourly-trigger`), alert-delivery worker endpoint (`/v1/billing/reconciliation/alerts/deliver`), retry/backoff scheduling, dead-letter terminal handling, and internal scheduler automation status controls.
- **Implementation:** `server/db.mjs` (`billing_reconciliation_run`, `billing_reconciliation_mismatch`, `billing_reconciliation_alert`, pending-alert retry fields/queries, scheduler/account discovery), `server/index.mjs` (reconciliation execution + hourly trigger + alert delivery + automation policy wiring), `server/test/reconciliation.test.mjs`, `docs/production-readiness/RECONCILIATION_OPERATIONS_POLICY.md`
- **Verification:**
  - `node --test server/test/reconciliation.test.mjs` → ok-path, mismatch-path, account scoping, scheduler trigger idempotency-by-window, retry/backoff behavior, and alert worker delivery/dead-letter checks pass.
  - `node --test server/test/*.test.mjs` → green backend baseline.
  - rollout smoke (automation enabled) verifies `/health/ready`, scheduler status, hourly trigger, and dry-run worker responses are healthy.
- **Follow-up ops hardening:** finalize late-arrival backfill SLO policy and monitor retry/dead-letter trend during pilot onboarding.
- **Owner:** Backend
- **Dependencies:** Depends on **9**

### MVP Milestone — Production Readiness Layer
- **Status:** **Done (baseline shipped)**
- **Objective:** Cross-cutting hardening layer for sellable paid-pilot readiness without enterprise bloat.
- **Shipped in this milestone increment:**
  - MVP sellability contract + scope boundary docs.
  - Baseline reliability SLO + release-gate documentation.
  - Observability baseline in code (trace IDs, structured request logs, health/readiness, metrics).
  - Security baseline in code (rate limiting, stricter internal auth boundaries, security headers).
  - Data governance controls (data-map, account deletion capability, governance audit trail).
  - Billing traceability endpoint (`usage -> billing -> reconciliation` links).
  - Tenant/operator controls for onboarding (`/v1/operator/tenants*`).
  - Buyer-visible acceptance scenarios + production readiness tests + CI release-gate checks.
  - Mandatory evidence bundle verification (`scripts/verify-production-readiness.mjs`).
- **Implementation:** `server/index.mjs`, `server/db.mjs`, `server/test/release-acceptance.test.mjs`, `server/test/production-readiness.test.mjs`, `.github/workflows/ci.yml`, `docs/production-readiness/*`, `docs/runbooks/*`, `docs/releases/LATEST_EVIDENCE_BUNDLE.md`
- **Follow-up ops hardening:** enable scheduler automation in production with explicit runbook sign-off and finalize late-arrival reconciliation SLO policy.

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

1. **Close P0 #2 remaining acceptance criteria (LiveKit bridge evidence)**
   - Capture repeatable live-integration evidence against real LiveKit room join/publish/subscribe flow.
2. **Close P0 #4 remaining acceptance criteria (recovery hardening)**
   - Add reconnect race/chaos tests + operational runbook/alerts for reconnect failure modes.
3. **Re-run P0 phase gate and flip HOLD→GO (for further P1 expansion)**
   - Require hygiene, docs, and evidence checklist to stay green before reopening net-new P1 scope.
4. **Pilot launch prep packet finalization**
   - Freeze MVP sellability docs/evidence bundle and operator onboarding checklist for first paid pilot.
5. **Targeted UI stabilization sprint (bug triage + fixes)**
   - Resolve top buyer-visible UI defects once P0 gate re-opens.

---

## Next Action

**Backend:** execute and document repeatable live LiveKit integration evidence (room join/publish/subscribe + webhook signature path) to close final P0 #2 acceptance criterion.
