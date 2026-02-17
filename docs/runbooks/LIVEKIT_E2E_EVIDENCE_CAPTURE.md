# Runbook — LiveKit E2E Evidence Capture (P0 #2 closure)

Use this to capture repeatable proof for the final P0 #2 criterion:
- real room join,
- media publish/subscribe,
- backend event ingestion path.

## Preconditions

- Backend reachable with real LiveKit credentials configured:
  - `LIVEKIT_WS_URL`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
- `OPENCLAW_GATEWAY_TOKEN` configured.
- Operator/test user available (`x-user-id`).

## Step 1 — Prepare context + token

```bash
node scripts/livekit-e2e-evidence.mjs \
  --mode=prepare \
  --baseUrl=http://127.0.0.1:3001 \
  --userId=pilot-livekit
```

This creates:
- `docs/releases/livekit-e2e-context.json`

## Step 2 — Perform real LiveKit join/publish

1. Open: <https://meet.livekit.io>
2. Use `transport.wsUrl` from the context file.
3. Use `transport.accessToken` from the context file.
4. Join room and publish mic for ~10s.
5. Optionally send/receive room data if your scenario requires it.

## Step 3 — Collect backend evidence

```bash
node scripts/livekit-e2e-evidence.mjs --mode=collect
```

This writes a timestamped evidence report under `docs/releases/`.

## Step 4 — Attach to release evidence bundle

Update `docs/releases/LATEST_EVIDENCE_BUNDLE.md` with:
- run timestamp,
- report file path,
- observed event families,
- pass/fail callout.

## Expected success signals

- Session endpoint reports healthy session object.
- Replay endpoint contains expected call/transcript event families.
- No signature/replay rejection errors for valid provider webhooks.
- Evidence report committed alongside coordination update.
