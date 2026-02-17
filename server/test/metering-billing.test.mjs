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
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-metering-test-'));
  const port = 4500 + Math.floor(Math.random() * 500);
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

test('call end writes one metering record and one billing event across idempotent replay', async () => {
  const srv = await startServer();
  try {
    const createResp = await fetch(`${srv.baseUrl}/v1/call/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({}),
    });
    const createJson = await createResp.json();
    assert.equal(createResp.status, 200);
    const sessionId = createJson.session.sessionId;

    const activate = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        status: 'active',
        provider: 'livekit',
        providerRoomId: 'room-meter-1',
        providerParticipantId: 'part-meter-1',
        providerCallId: 'call-meter-1',
      }),
    });
    assert.equal(activate.status, 200);

    await new Promise((r) => setTimeout(r, 1100));

    const end1 = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ status: 'ended' }),
    });
    assert.equal(end1.status, 200);

    const end2 = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ status: 'ended' }),
    });
    const end2Json = await end2.json();
    assert.equal(end2.status, 200);
    assert.equal(end2Json.idempotentReplay, true);

    const usageResp = await fetch(`${srv.baseUrl}/v1/billing/sessions/${sessionId}/usage-records`);
    const usageJson = await usageResp.json();
    assert.equal(usageResp.status, 200);
    assert.equal(usageJson.count, 1);
    assert.equal(usageJson.records[0].meterId, 'call.duration.seconds');
    assert.ok(usageJson.records[0].quantity >= 1);
    assert.equal(typeof usageJson.records[0].signature, 'string');
    assert.equal(usageJson.records[0].signatureVersion, 'hs256.v1');

    const billingResp = await fetch(`${srv.baseUrl}/v1/billing/sessions/${sessionId}/events`);
    const billingJson = await billingResp.json();
    assert.equal(billingResp.status, 200);
    assert.equal(billingJson.count, 1);
    assert.equal(billingJson.events[0].meterId, 'call.duration.seconds');

    const replayResp = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events`);
    const replayJson = await replayResp.json();
    assert.equal(replayResp.status, 200);
    const billingUsageEvents = replayJson.events.filter((evt) => evt.type === 'billing.usage.recorded');
    assert.equal(billingUsageEvents.length, 1);
  } finally {
    await srv.stop();
  }
});

test('executed action writes one metering record/billing event across duplicate submit', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_meter_action_1';

    const execute1 = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId,
        actionId: 'act-meter-1',
        actionType: 'cv.generate',
        summary: 'Generate CV',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'chef' },
      }),
    });
    assert.equal(execute1.status, 200);

    const execute2 = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId,
        actionId: 'act-meter-1',
        actionType: 'cv.generate',
        summary: 'Generate CV',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'chef' },
      }),
    });
    assert.equal(execute2.status, 200);

    const usageResp = await fetch(`${srv.baseUrl}/v1/billing/sessions/${sessionId}/usage-records?meterId=orchestration.action.executed.count`);
    const usageJson = await usageResp.json();
    assert.equal(usageResp.status, 200);
    assert.equal(usageJson.count, 1);
    assert.equal(usageJson.records[0].quantity, 1);

    const billingResp = await fetch(`${srv.baseUrl}/v1/billing/sessions/${sessionId}/events`);
    const billingJson = await billingResp.json();
    assert.equal(billingResp.status, 200);
    assert.equal(billingJson.count, 1);
    assert.equal(billingJson.events[0].meterId, 'orchestration.action.executed.count');
  } finally {
    await srv.stop();
  }
});

test('blocked sensitive action does not create metering/billing records', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_meter_blocked_1';

    const blocked = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId,
        actionId: 'act-meter-blocked-1',
        actionType: 'outreach.requestSend',
        summary: 'Send outreach',
        riskTier: 'high-risk-external-send',
        payload: { text: 'hello' },
      }),
    });
    assert.equal(blocked.status, 403);

    const usageResp = await fetch(`${srv.baseUrl}/v1/billing/sessions/${sessionId}/usage-records`);
    const usageJson = await usageResp.json();
    assert.equal(usageResp.status, 200);
    assert.equal(usageJson.count, 0);

    const billingResp = await fetch(`${srv.baseUrl}/v1/billing/sessions/${sessionId}/events`);
    const billingJson = await billingResp.json();
    assert.equal(billingResp.status, 200);
    assert.equal(billingJson.count, 0);
  } finally {
    await srv.stop();
  }
});

test('account usage summary aggregates signed records across sessions', async () => {
  const srv = await startServer();
  try {
    const executeA = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_account_sum_1',
        actionId: 'act-account-sum-1',
        actionType: 'cv.generate',
        summary: 'Generate CV A',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'chef' },
      }),
    });
    assert.equal(executeA.status, 200);

    const executeB = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_account_sum_2',
        actionId: 'act-account-sum-2',
        actionType: 'cv.edit',
        summary: 'Edit CV B',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'waiter' },
      }),
    });
    assert.equal(executeB.status, 200);

    const summaryResp = await fetch(`${srv.baseUrl}/v1/billing/accounts/user-a/usage-summary`, {
      headers: { 'x-user-id': 'user-a' },
    });
    const summaryJson = await summaryResp.json();
    assert.equal(summaryResp.status, 200);

    const row = summaryJson.summary.find((entry) => entry.meterId === 'orchestration.action.executed.count');
    assert.ok(row);
    assert.equal(row.unit, 'count');
    assert.equal(row.totalQuantity, 2);
    assert.equal(row.recordsCount, 2);
    assert.equal(summaryJson.records.every((record) => typeof record.signature === 'string'), true);
  } finally {
    await srv.stop();
  }
});

test('billing adjustment emits event and routes forced publish failures to dead-letter', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_adjustment_1';

    const adjOkResp = await fetch(`${srv.baseUrl}/v1/billing/adjustments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId,
        accountId: 'user-a',
        meterId: 'call.duration.seconds',
        amount: -1.25,
        currency: 'EUR',
        reason: 'courtesy_credit',
      }),
    });
    const adjOkJson = await adjOkResp.json();
    assert.equal(adjOkResp.status, 200);
    assert.equal(adjOkJson.published, true);

    const eventsResp = await fetch(`${srv.baseUrl}/v1/billing/sessions/${sessionId}/events?eventType=billing.adjustment.created`);
    const eventsJson = await eventsResp.json();
    assert.equal(eventsResp.status, 200);
    assert.equal(eventsJson.count, 1);
    assert.equal(eventsJson.events[0].eventType, 'billing.adjustment.created');

    const adjDlqResp = await fetch(`${srv.baseUrl}/v1/billing/adjustments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId,
        accountId: 'user-a',
        meterId: 'call.duration.seconds',
        amount: 0.5,
        currency: 'EUR',
        reason: 'manual_patch',
        forcePublishFailure: true,
      }),
    });
    const adjDlqJson = await adjDlqResp.json();
    assert.equal(adjDlqResp.status, 200);
    assert.equal(adjDlqJson.published, false);
    assert.equal(typeof adjDlqJson.deadLetterId, 'string');

    const deadResp = await fetch(`${srv.baseUrl}/v1/billing/sessions/${sessionId}/dead-letters`);
    const deadJson = await deadResp.json();
    assert.equal(deadResp.status, 200);
    assert.equal(deadJson.count, 1);
    assert.equal(deadJson.deadLetters[0].eventType, 'billing.adjustment.created');
  } finally {
    await srv.stop();
  }
});
