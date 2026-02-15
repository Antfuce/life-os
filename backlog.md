BACKLOG.md — Life-OS Execution Queue

This file is the single source of truth for what gets built next.
All coding agents must follow this order and respect dependencies.

🎯 MVP Promise

Talk once → Generate CV → Prepare Interview → Generate Outreach

Everything must serve this.

Not in scope yet:

Autonomous job applying

Concierge / Life-OS features

Voice calling automation execution (calls happening is in scope; automation is not)

Multi-agent experiments unrelated to recruitment

🧭 Priority Bands

P0 = Foundation & stability (must exist first)

P1 = Core MVP features

P2 = Productization & beta readiness

🟥 P0 — Foundation & Stability
T0 — Commit Project Brain Docs

Depends on: none
Goal: agents must understand the repo before coding.

Acceptance

AGENTS.md exists at repo root ✅

docs/BACKLOG.md exists

docs/ARCHITECTURE.md exists (to be added)

Files

docs/BACKLOG.md

docs/ARCHITECTURE.md

T1 — Standardize Environment & Secrets

Depends on: none

Remove machine-specific assumptions.

Acceptance

No hardcoded /root/.openclaw/... paths

.env.example exists

Missing secrets fail gracefully

Same env names work locally, Codex, VPS

Files

server/index.mjs

server/index.v2.mjs

.env.example

T2 — Database Decision & Migration (SQLite → Postgres/Supabase)

Depends on: T1

Backend must own product data.

Acceptance
Create schema for:

users

sessions

messages

memories

deliverables

files

SQLite no longer primary store.

Files

server/db.mjs replacement

new DB client integration

T3 — Stable Backend Origin (Domain + TLS + CORS + /health)

Depends on: T1

Quick tunnels are not production.

Acceptance

Stable domain configured

TLS end-to-end

Explicit CORS policy

/health endpoint exists

🟧 P1 — Core MVP Spine
T4 — /v1/chat/turn Endpoint (non-stream)

Depends on: T1

Automation & tools need a non-stream endpoint.

Acceptance

Endpoint exists

Same schema as /v1/chat/stream

Example request documented

T5 — Backend Intent Router

Depends on: T1

Remove frontend regex hacks.

Backend detects:

CV creation

Interview prep

Outreach generation

Normal chat

T7 — API Key Auth + Rate Limiting

Depends on: T1

Protect OpenClaw & LLM usage.

Acceptance

Missing key → 401

Basic rate limiting enabled

T6 — Persist Persona Selection

Depends on: T2

Personas:

Antonio

Mariana

Both

Executor

Persist per session/user.

🟨 P1 — Real Value Creation
T8 — CV Generation Pipeline ⭐

Depends on: T2, T4, T5

Flow:
Chat → structured CV → PDF/preview → stored deliverable

This is the first “WOW moment”.

T9 — Deliverables Panel (Persistent Outputs)

Depends on: T2, T8

Right panel must show:

CVs

Interview packs

Outreach drafts

Persistent across sessions.

T10 — Outreach Generator (Alice DNA)

Depends on: T2, T5

Generate:

LinkedIn messages

Emails

Follow-ups

Stored as deliverables.

T11 — Human-in-the-Loop Approval Flow

Depends on: T10

Before sending:
Preview → Edit → Approve.

🟩 P1 — Real-Time Voice Infrastructure
T15 — Real-Time Voice Call Lane (WebRTC/SIP)

Depends on: T3

We are building live calls, not STT/TTS loops.

Architecture must include:

Media lane

WebRTC/SIP audio streaming

Control lane

WebSocket/SSE for transcripts + UI updates

Reasoning lane

Backend → OpenClaw only when needed

T16 — Live Transcript & Speaker Events

Depends on: T15

Frontend receives:

Live transcript stream

Speaker changes

AI thinking state

T17 — Model Cost Ladder for Realtime

Depends on: T15

Reduce cost:

realtime-mini → conversation flow

heavier model → CV / outreach generation

🟦 P2 — Productization
T12 — Observability & Logging

Depends on: T1

Structured logs

Request IDs

OpenClaw call metrics

T13 — Analytics (MVP)

Depends on: T2, T8

Track:

sessions started

CVs generated

outreach drafts generated

T14 — Beta Testing Workflow

Depends on: T9, T13

Prepare first 10–20 testers:

onboarding script

feedback loop

weekly review process

🧱 How Agents Work With This File

When starting work:

Pick highest task without unmet dependencies

Open PR with title format:

[T<ID>] Title (layer)


Example:

[T8] CV pipeline MVP (openclaw)
