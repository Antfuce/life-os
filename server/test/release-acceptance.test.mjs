import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function waitForHealth(baseUrl) {
  const max = Date.now() + 8000;
  while (Date.now() < max) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not become healthy in time');
}

async function startServer() {
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-release-acceptance-test-'));
  const port = 5200 + Math.floor(Math.random() * 200);
  const dbFile = path.join(dir, 'test.db');
  const child = spawn('node', ['index.mjs'], {
    cwd: path.resolve('server'),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      LIFE_OS_DB: dbFile,
      OPENCLAW_GATEWAY_TOKEN: 'test-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForHealth(`http://127.0.0.1:${port}`);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        child.on('exit', resolve);
        setTimeout(resolve, 1000);
      });
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('buyer-visible scenario: call flow produces traceable billable artifacts', async () => {
  const srv = await startServer();
  try {
    const createResp = await fetch(`${srv.baseUrl}/v1/call/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'pilot-a' },
      body: JSON.stringify({}),
    });
    const createJson = await createResp.json();
    assert.equal(createResp.status, 200);

    const sessionId = createJson.session.sessionId;

    const activateResp = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'pilot-a' },
      body: JSON.stringify({
        status: 'active',
        provider: 'livekit',
        providerRoomId: 'pilot-room-a',
        providerParticipantId: 'pilot-participant-a',
        providerCallId: 'pilot-call-a',
      }),
    });
    assert.equal(activateResp.status, 200);

    await new Promise((r) => setTimeout(r, 1100));

    const endResp = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'pilot-a' },
      body: JSON.stringify({ status: 'ended' }),
    });
    assert.equal(endResp.status, 200);

    const traceResp = await fetch(`${srv.baseUrl}/v1/billing/accounts/pilot-a/traceability`, {
      headers: { 'x-user-id': 'pilot-a' },
    });
    const traceJson = await traceResp.json();
    assert.equal(traceResp.status, 200);
    assert.equal(traceJson.usageRecords.length >= 1, true);
    assert.equal(traceJson.billingEvents.length >= 1, true);
    assert.equal(traceJson.traceLinks.some((link) => link.usageRecordFound === true), true);
  } finally {
    await srv.stop();
  }
});

test('buyer-visible scenario: sensitive outreach is policy-gated and auditable', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_acceptance_outreach_1';

    const blockedResp = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'pilot-a' },
      body: JSON.stringify({
        sessionId,
        actionId: 'act-accept-outreach-1',
        actionType: 'outreach.requestSend',
        summary: 'Send outreach candidate message',
        riskTier: 'high-risk-external-send',
        payload: { text: 'Hello from pilot' },
      }),
    });
    const blockedJson = await blockedResp.json();
    assert.equal(blockedResp.status, 403);
    assert.equal(blockedJson.code, 'SAFETY_BLOCKED');

    const approvedResp = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'pilot-a' },
      body: JSON.stringify({
        sessionId,
        actionId: 'act-accept-outreach-2',
        actionType: 'outreach.requestSend',
        summary: 'Send outreach candidate message',
        riskTier: 'high-risk-external-send',
        userConfirmation: true,
        payload: { text: 'Hello from pilot with confirmation' },
      }),
    });
    const approvedJson = await approvedResp.json();
    assert.equal(approvedResp.status, 200);
    assert.equal(approvedJson.ack.status, 'executed');

    const replayResp = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events`);
    const replayJson = await replayResp.json();
    assert.equal(replayResp.status, 200);

    const eventTypes = replayJson.events.map((e) => e.type);
    assert.equal(eventTypes.includes('safety.blocked'), true);
    assert.equal(eventTypes.includes('safety.approved'), true);
    assert.equal(eventTypes.includes('action.executed'), true);
  } finally {
    await srv.stop();
  }
});
