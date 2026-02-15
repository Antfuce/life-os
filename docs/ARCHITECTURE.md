# Architecture

## System Diagram Narrative

Life-OS is designed as a strict, layered recruitment workflow system:

1. **Client UI (Web Frontend)**
   - Handles user interactions, call controls, live transcript rendering, and deliverables display.
   - Connects only to the backend over HTTPS/WebSocket.
2. **Backend Realtime Gateway (Authoritative Integration Layer)**
   - Manages authenticated sessions.
   - Terminates client WebSocket connections.
   - Orchestrates realtime event flow between client, call provider, and OpenClaw.
   - Persists product data to the database and billing ledger.
3. **Call Provider (LiveKit)**
   - Handles telephony/media connection state and provider-native room and participant events.
   - Streams call events/media metadata to the backend gateway.
4. **OpenClaw (AI Orchestrator)**
   - Performs LLM routing, tool orchestration, and structured AI outputs.
   - Returns candidate insights/actions to backend for persistence and downstream UX updates.

In short: **Client UI ↔ Backend Realtime Gateway ↔ (LiveKit + OpenClaw)**.

## Strict Boundaries (Non-Negotiable)

- **Frontend never calls OpenClaw directly.**
- **Frontend never talks to the database directly.**
- **OpenClaw never writes to the database directly.**
- **Backend/API is the only integration and persistence layer.**

These boundaries ensure security, auditability, and deterministic state recovery.

## Authoritative Data Stores

The backend owns all writes and maintains clear source-of-truth tables/collections:

- **Sessions**
  - Canonical store for session lifecycle (`created`, `active`, `ended`, `failed`).
  - Includes user identity, provider session IDs, and connection metadata.
- **Transcripts**
  - Append-only event stream with stable ordering keys (`session_id`, `sequence`, `provider_event_id`).
  - Stores both raw provider segments and normalized transcript chunks.
- **Actions**
  - Structured action records produced by OpenClaw (e.g., follow-ups, interview prep tasks).
  - Versioned to support idempotent upserts and replay safety.
- **Deliverables**
  - Generated outputs (CV drafts, interview prep packets, outreach drafts).
  - Immutable snapshots plus latest-pointer for UX retrieval.
- **Billing Ledgers**
  - Financial source of truth for usage metering and billable events.
  - Append-only ledger entries tied to session and provider usage identifiers.

## Failure Modes and Recovery

### 1) Provider Disconnect (LiveKit disconnect / call interruption)

**Failure mode:** LiveKit connection is lost mid-session.

**Recovery strategy:**
- Backend marks provider channel as `degraded` and emits status to client immediately.
- Retry provider reconnection with bounded exponential backoff.
- If reconnection succeeds, resume session with continuity markers.
- If retries exhaust, finalize session gracefully as `ended_with_provider_disconnect` and preserve partial transcript/deliverables.

### 2) WebSocket Reconnect (client network instability)

**Failure mode:** Client WebSocket disconnects while session remains active server-side.

**Recovery strategy:**
- Client reconnects using session token + last acknowledged sequence number.
- Backend replays missed events from transcript/action streams since that sequence.
- Rehydration is idempotent; client replaces stale in-memory state with replayed authoritative state.

### 3) Duplicate Events (provider retries / at-least-once delivery)

**Failure mode:** LiveKit or internal workers deliver duplicate event payloads.

**Recovery strategy:**
- Enforce idempotency keys (`provider_event_id`, `session_id + sequence`, or hash fingerprint).
- Persist first-seen event; ignore/log duplicates.
- Upsert AI action outputs using deterministic record IDs.
- Billing ledger accepts only unique billable keys to prevent double charging.

## SLO Targets

These SLOs guide implementation and observability baselines for MVP:

- **Realtime event latency (P95):**
  - Client UI event visible within **≤ 600 ms** from backend receipt.
- **Event delivery reliability:**
  - **≥ 99.9%** of non-terminal realtime events delivered to active websocket clients (monthly).
- **Transcript availability delay (P95):**
  - Transcript segment visible in UI within **≤ 2.5 s** from provider emission.
- **Session recovery success rate:**
  - **≥ 99.5%** successful client state rehydration after transient websocket reconnect.

## Observability Notes

To support SLO compliance:
- Track end-to-end timestamps (`provider_emitted_at`, `backend_received_at`, `client_delivered_at`).
- Emit structured reconnect/replay metrics.
- Alert on duplicate-event suppression spikes and replay backlog growth.
- Periodically reconcile billing ledger against provider usage exports.
