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
- **Status:** **Done**
- **What:** Wire LiveKit transport through backend token issuance + provider event ingestion/translation.
- **Current status:** Token issuance, session↔room mapping persistence, canonical event translation, webhook authenticity/replay protection, and live-provider operator evidence capture are in place.
- **Acceptance criteria:**
  - [x] Backend issues short-lived LiveKit access token tied to session/user mapping.
  - [x] Inbound provider events translate into canonical `call.*` / `transcript.*` / `orchestration.*` families.
  - [x] Inbound provider event authenticity/replay protection is enforced and tested (signature verification + replay guard).
  - [x] End-to-end provider integration check against live LiveKit environment (room join/publish/subscribe roundtrip) is captured as repeatable evidence.
- **Implementation:** `server/index.mjs`, `server/livekit-bridge.mjs`, `server/db.mjs` (`livekit_webhook_receipt`), `server/test/call-sessions.test.mjs`, `scripts/livekit-e2e-evidence.mjs`, `docs/releases/livekit-e2e-evidence-2026-02-16T17-50-55-000Z.md`
- **Verification:**
  - `node --test server/test/call-sessions.test.mjs` (token + translation + webhook signature/replay coverage)
  - `node scripts/livekit-e2e-evidence.mjs --mode=prepare --baseUrl=http://127.0.0.1:3901 --userId=pilot-livekit`
  - `node scripts/livekit-e2e-evidence.mjs --mode=collect --context=/tmp/livekit-e2e-context.json --report=docs/releases/livekit-e2e-evidence-2026-02-16T17-50-55-000Z.md`
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
- **Status:** **Done**
- **What:** Provide resilient resume/reconnect behavior with replay/checkpoint semantics and terminal-failure signaling.
- **Current status:** Resume token checks, deterministic replay, stale-checkpoint protection, and reconnect failure operations runbook are in place.
- **Acceptance criteria:**
  - [x] Reconnect requires valid `resumeToken` and enforces reconnect window expiry.
  - [x] Replay starts from acknowledged sequence/checkpoint and is deterministic.
  - [x] Terminal session failure emits canonical failure event path.
  - [x] Concurrency/chaos reconnect tests cover duplicate reconnect attempts, ack races, and late checkpoints.
  - [x] Operational runbook + alerting expectations for reconnect failure modes are documented.
- **Implementation:** `server/index.mjs` (`/v1/call/sessions/:sessionId/reconnect`, checkpoint stale-sequence guard), `server/db.mjs` (resume/ack columns), `server/test/call-sessions.test.mjs`, `docs/runbooks/RECONNECT_FAILURE_OPERATIONS.md`
- **Verification:**
  - `node --test server/test/call-sessions.test.mjs`
- **Owner:** Backend
- **Dependencies:** Depends on **1**, **2**, and **3**

#### P0 Phase-Gate Checklist (Mandatory before P1 continuation)
- **Checklist status:** ✅ Completed (governance pass executed)
- **Gate decision:** ✅ **GO** (all P0 acceptance criteria #1/#2/#3/#4 closed with evidence)

- [x] Repo hygiene sweep completed on backend code/tests (`server/**/*.mjs`, `server/test/**/*.mjs`) for merge markers and branch-label debris.
- [x] Hygiene verification commands executed (`grep` scans for `<<<<<<<`, `=======`, `>>>>>>>`, and stray branch-label lines) with no findings in backend sources/tests.
- [x] Docs alignment maintained: P0 #1/#2/#3/#4 closure reflected with explicit acceptance criteria and evidence links.
- [x] Cross-agent audit log restored: latest production pushes and this stabilization pass documented in `docs/COORDINATION.md` using changed / next / risks format.
- [x] Stabilization sign-off recorded by execution owner (OpenClaw run note + baseline checks).

**Feature freeze rule:** ✅ Gate is now **GO**; P0-only freeze is lifted and controlled P1 continuation is allowed with evidence discipline intact.

---

### P1 — Orchestration, Safety, and Persistence

- **Gate:** ✅ **GO** (2026-02-16 evidence closure pass) — P0 criteria are closed; continue P1 expansion in priority order with synchronized tests/docs/evidence.

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

#### 11. Frontend Talk Flow Migration to Call-Session/Realtime Authority (P1)
- **Status:** **In progress**
- **What:** Move Home talk UX from chat-first to explicit call-session lifecycle + canonical realtime event authority.
- **Progress:** Home now creates/activates call sessions (`/v1/call/sessions`, `/state`), polls canonical realtime events (`/v1/realtime/sessions/:sessionId/events`), dispatches transcript/action lifecycle from backend events, and dispatches orchestration actions via backend endpoint instead of local-only lifecycle timers.
- **Implementation:** `src/pages/Home.jsx`, `docs/CALL_UI_EVENT_MAPPING.md`
- **Remaining scope:**
  - Replace `/v1/chat/stream` with transport-native realtime voice/text stream.
  - Complete deprecation of frontend-managed action lifecycle/timeouts.
  - Finalize canonical mapping coverage for `deliverable.*` publication path.
- **Owner:** Frontend + Backend
- **Dependencies:** Depends on **1**, **2**, **3**, **5**, **6**

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


## Architecture Migration Status (Reality Check)

- **Current state:** Hybrid. The repository contains backend-authoritative call/realtime endpoints, while parts of frontend still use legacy/Base44-native data paths.
- **Required target:** Frontend renders UI and calls backend only; backend remains the only persistence/business-logic layer; OpenClaw remains orchestration-only.
- **Before Phase-1 completion:**
  1. Migrate talk experience entry path in `src/pages/Home.jsx` to explicit call-session lifecycle (`/v1/call/sessions*`, reconnect, terminal failure states).
  2. Remove remaining direct `base44.entities.*` usage from user-facing production flows in favor of backend endpoints.
  3. Keep `BACKLOG.md`, `docs/COORDINATION.md`, and `docs/REVIEW_MODE_CHECKLIST.md` updated together on every production push.

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

1. **Targeted UI stabilization sprint (bug triage + fixes)**
   - Resolve top buyer-visible UI defects now that P0 gate is GO.
2. **P1 #5/#6 continuation (tokenized safety + richer executor semantics)**
   - Upgrade confirmation workflow from boolean to explicit confirmation-token lifecycle and tighten idempotent executor semantics.
3. **Pilot launch prep packet finalization**
   - Freeze MVP sellability docs/evidence bundle and operator onboarding checklist for first paid pilot.
4. **Operational reconciliation policy tuning**
   - Validate retry/dead-letter trends under pilot traffic and finalize late-arrival backfill SLO policy.
5. **Release hardening sweep before pilot start**
   - Re-run full acceptance/tests/docs verification and publish updated evidence summary.

---

## Next Action

**Product + Backend:** start UI stabilization triage/fix pass on top buyer-visible defects while preserving P1 safety/orchestration guardrails.
