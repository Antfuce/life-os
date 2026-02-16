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
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-recon-test-'));
  const port = 4800 + Math.floor(Math.random() * 300);
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

test('reconciliation run returns ok when metered and billed usage match', async () => {
  const srv = await startServer();
  try {
    const execResp = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_recon_ok_1',
        actionId: 'act-recon-ok-1',
        actionType: 'cv.generate',
        summary: 'Generate CV',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'chef' },
      }),
    });
    assert.equal(execResp.status, 200);

    const runResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        accountId: 'user-a',
        lookbackHours: 24,
        latenessMs: 0,
        reason: 'test-ok',
      }),
    });
    const runJson = await runResp.json();
    assert.equal(runResp.status, 200);
    assert.equal(runJson.run.status, 'ok');
    assert.equal(runJson.run.mismatchCount, 0);
    assert.equal(runJson.alert, null);

    const runsResp = await fetch(`${srv.baseUrl}/v1/billing/accounts/user-a/reconciliation/runs`, {
      headers: { 'x-user-id': 'user-a' },
    });
    const runsJson = await runsResp.json();
    assert.equal(runsResp.status, 200);
    assert.equal(runsJson.count >= 1, true);
    assert.equal(runsJson.runs[0].runId, runJson.run.runId);
  } finally {
    await srv.stop();
  }
});

test('reconciliation run records mismatches and queues alert hook payload', async () => {
  const srv = await startServer();
  try {
    const execResp = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_recon_mm_1',
        actionId: 'act-recon-mm-1',
        actionType: 'cv.generate',
        summary: 'Generate CV',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'manager' },
      }),
    });
    assert.equal(execResp.status, 200);

    const adjustmentResp = await fetch(`${srv.baseUrl}/v1/billing/adjustments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_recon_mm_1',
        accountId: 'user-a',
        meterId: 'orchestration.action.executed.count',
        amount: 0.55,
        currency: 'EUR',
        reason: 'manual-adjustment',
      }),
    });
    assert.equal(adjustmentResp.status, 200);

    const runResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        accountId: 'user-a',
        lookbackHours: 24,
        latenessMs: 0,
        reason: 'test-mismatch',
      }),
    });
    const runJson = await runResp.json();
    assert.equal(runResp.status, 200);
    assert.equal(runJson.run.status, 'mismatch');
    assert.equal(runJson.run.mismatchCount >= 1, true);
    assert.equal(typeof runJson.alert?.alertId, 'string');

    const detailResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/runs/${runJson.run.runId}`, {
      headers: { 'x-user-id': 'user-a' },
    });
    const detailJson = await detailResp.json();
    assert.equal(detailResp.status, 200);
    assert.equal(detailJson.run.runId, runJson.run.runId);
    assert.equal(detailJson.mismatchCount >= 1, true);
    assert.equal(detailJson.alerts.length, 1);
    assert.equal(detailJson.alerts[0].status, 'pending');
  } finally {
    await srv.stop();
  }
});

test('reconciliation run detail is account scoped', async () => {
  const srv = await startServer();
  try {
    const execResp = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_recon_scope_1',
        actionId: 'act-recon-scope-1',
        actionType: 'cv.generate',
        summary: 'Generate CV',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'chef' },
      }),
    });
    assert.equal(execResp.status, 200);

    const runResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ accountId: 'user-a', lookbackHours: 24, latenessMs: 0 }),
    });
    const runJson = await runResp.json();
    assert.equal(runResp.status, 200);

    const forbiddenResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/runs/${runJson.run.runId}`, {
      headers: { 'x-user-id': 'user-b' },
    });
    const forbiddenJson = await forbiddenResp.json();
    assert.equal(forbiddenResp.status, 403);
    assert.equal(forbiddenJson.code, 'CROSS_USER_FORBIDDEN');
  } finally {
    await srv.stop();
  }
});

test('hourly scheduler trigger creates account runs and skips existing window reruns', async () => {
  const srv = await startServer();
  try {
    const execA = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_recon_sched_a',
        actionId: 'act-recon-sched-a',
        actionType: 'cv.generate',
        summary: 'Generate CV A',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'chef' },
      }),
    });
    assert.equal(execA.status, 200);

    const execB = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-b' },
      body: JSON.stringify({
        sessionId: 'sess_recon_sched_b',
        actionId: 'act-recon-sched-b',
        actionType: 'cv.generate',
        summary: 'Generate CV B',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'waiter' },
      }),
    });
    assert.equal(execB.status, 200);

    const nowMs = Date.now();
    const windowStartMs = nowMs - (24 * 60 * 60 * 1000);
    const windowEndMs = nowMs + 1000;

    const trigger1 = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/hourly-trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gateway-token': 'test-token' },
      body: JSON.stringify({ windowStartMs, windowEndMs }),
    });
    const trigger1Json = await trigger1.json();
    assert.equal(trigger1.status, 200);
    assert.equal(trigger1Json.createdRuns >= 2, true);
    assert.equal(trigger1Json.skippedExistingRuns, 0);

    const trigger2 = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/hourly-trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gateway-token': 'test-token' },
      body: JSON.stringify({ windowStartMs, windowEndMs }),
    });
    const trigger2Json = await trigger2.json();
    assert.equal(trigger2.status, 200);
    assert.equal(trigger2Json.createdRuns, 0);
    assert.equal(trigger2Json.skippedExistingRuns >= 2, true);
  } finally {
    await srv.stop();
  }
});

test('alert-delivery worker delivers pending alerts and dead-letters delivery failures', async () => {
  const srv = await startServer();
  try {
    const execResp = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_recon_worker_1',
        actionId: 'act-recon-worker-1',
        actionType: 'cv.generate',
        summary: 'Generate CV worker',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'manager' },
      }),
    });
    assert.equal(execResp.status, 200);

    const adjustmentResp = await fetch(`${srv.baseUrl}/v1/billing/adjustments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_recon_worker_1',
        accountId: 'user-a',
        meterId: 'orchestration.action.executed.count',
        amount: 1.0,
        currency: 'EUR',
        reason: 'force mismatch',
      }),
    });
    assert.equal(adjustmentResp.status, 200);

    const runResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ accountId: 'user-a', lookbackHours: 24, latenessMs: 0, reason: 'worker-test' }),
    });
    const runJson = await runResp.json();
    assert.equal(runResp.status, 200);
    assert.equal(runJson.run.status, 'mismatch');
    assert.equal(runJson.alert?.alertId ? true : false, true);

    const deliverOkResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/alerts/deliver`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gateway-token': 'test-token' },
      body: JSON.stringify({ limit: 10 }),
    });
    const deliverOkJson = await deliverOkResp.json();
    assert.equal(deliverOkResp.status, 200);
    assert.equal(deliverOkJson.deliveredCount >= 1, true);

    const detailAfterDeliverResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/runs/${runJson.run.runId}`, {
      headers: { 'x-user-id': 'user-a' },
    });
    const detailAfterDeliverJson = await detailAfterDeliverResp.json();
    assert.equal(detailAfterDeliverResp.status, 200);
    assert.equal(['delivered', 'delivered_stub'].includes(detailAfterDeliverJson.alerts[0].status), true);

    const runFailResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ accountId: 'user-a', lookbackHours: 24, latenessMs: 0, reason: 'worker-fail-test' }),
    });
    const runFailJson = await runFailResp.json();
    assert.equal(runFailResp.status, 200);

    const deliverFailResp = await fetch(`${srv.baseUrl}/v1/billing/reconciliation/alerts/deliver`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gateway-token': 'test-token' },
      body: JSON.stringify({
        limit: 10,
        forceFailureAlertIds: [runFailJson.alert?.alertId].filter(Boolean),
      }),
    });
    const deliverFailJson = await deliverFailResp.json();
    assert.equal(deliverFailResp.status, 200);
    assert.equal(deliverFailJson.failedCount >= 1, true);

    const deadLettersResp = await fetch(`${srv.baseUrl}/v1/billing/accounts/user-a/dead-letters`, {
      headers: { 'x-user-id': 'user-a' },
    });
    const deadLettersJson = await deadLettersResp.json();
    assert.equal(deadLettersResp.status, 200);
    assert.equal(deadLettersJson.count >= 1, true);
    assert.equal(
      deadLettersJson.deadLetters.some((row) => row.eventType === 'billing.reconciliation.alert.delivery_failed'),
      true,
    );
  } finally {
    await srv.stop();
  }
});
