# MVP CHECKLIST — Antonio & Mariana (V1)

## Infrastructure
- [x] Base44 frontend can call external API (via `VITE_API_ORIGIN`)
- [x] API health endpoint (`/health`)
- [x] Chat endpoint (`POST /v1/chat/turn`)
- [x] Streaming endpoint (`POST /v1/chat/stream` SSE)
- [x] Backend persistence v0 (SQLite)
- [ ] Durable public API URL (no quick-tunnel churn)
- [ ] Basic rate limits + spend caps

## Product (Recruitment vertical only)
- [x] Default persona = `executor`
- [ ] Intent routing: detect CV vs interview vs outreach
- [ ] CV deliverable:
  - [ ] Structured CV JSON
  - [ ] Clean rendered preview/export (PDF later)
- [ ] Interview deliverable:
  - [ ] Question pack + tips + followups
- [ ] Outreach deliverable:
  - [ ] 3–5 outreach messages + personalization slots

## Execution gates (no accidental sends)
- [ ] Draft is automatic
- [ ] "Send" requires explicit UI confirmation
- [ ] Audit log of actions

## Quality
- [ ] Error UI (API down / tunnel dead)
- [ ] Observability: request id + logs correlation
- [ ] BUGS.md kept current
