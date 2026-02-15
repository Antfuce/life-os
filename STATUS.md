# STATUS — Antonio & Mariana (life-os)

## What this is
Base44-hosted frontend + external backend API (Fastify) that calls OpenClaw `/v1/responses`.

## Source of truth
- **GitHub repo:** `Antfuce/life-os`
- **Branch:** `prod` (treat as default / deploy branch)

## Running services (current)
### Backend API
- Local (VPS): `http://127.0.0.1:3001`
- Public (Cloudflare *quick tunnel*, ephemeral):
  - `https://introduce-condo-arctic-raises.trycloudflare.com`
  - Health: `GET /health` → `{ "ok": true }`

### Frontend
- Hosted by Base44 (URL lives in Base44)
- Frontend must set env var and republish:
  - `VITE_API_ORIGIN=https://introduce-condo-arctic-raises.trycloudflare.com`

## What works
- `/v1/chat/turn` (non-streaming)
- `/v1/chat/stream` (SSE streaming; UI streams into placeholder message)
- Default persona: `executor` (Agent 4)
- Persistence v0: SQLite stores conversations + messages on backend
  - File: `server/data/lifeos.db` (ignored by git)

## What’s flaky / known issues
- Cloudflare **quick tunnel** URLs can die → requires updating Base44 env var + republish.
- Voice output not implemented (text streaming only).

## Next steps (highest leverage)
1) Replace quick tunnel with **durable** hosting: named Cloudflare tunnel or a real domain.
2) Add user identity/auth mapping (Base44 user → backend `userId`) for multi-user correctness.
3) Recruitment vertical MVP deliverables (CV / interview / outreach) + execution gates.

## Provider decision update
- Realtime voice/media provider is now **LiveKit** (replacing prior placeholder provider references).
- Next backend transport work should target LiveKit room/token integration.

