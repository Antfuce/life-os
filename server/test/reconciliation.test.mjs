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
