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

async function startServer(extraEnv = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-prod-ready-test-'));
  const port = 4900 + Math.floor(Math.random() * 250);
  const dbFile = path.join(dir, 'test.db');
  const child = spawn('node', ['index.mjs'], {
    cwd: path.resolve('server'),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      LIFE_OS_DB: dbFile,
      OPENCLAW_GATEWAY_TOKEN: 'test-token',
      ...extraEnv,
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

test('health/ready and metrics endpoints expose sellability baseline telemetry', async () => {
  const srv = await startServer();
  try {
    const health = await fetch(`${srv.baseUrl}/health`);
    const healthJson = await health.json();
    assert.equal(health.status, 200);
    assert.equal(healthJson.ok, true);
    assert.equal(typeof healthJson.slo.gate.pass, 'boolean');

    const ready = await fetch(`${srv.baseUrl}/health/ready`);
    const readyJson = await ready.json();
    assert.equal(ready.status, 200);
    assert.equal(readyJson.ready, true);

    const eventResp = await fetch(`${srv.baseUrl}/v1/realtime/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trace-id': 'trace-test-1',
      },
      body: JSON.stringify({
        sessionId: 'sess_obs_1',
        type: 'call.started',
        payload: {
          callId: 'sess_obs_1',
          channel: 'voice',
          direction: 'outbound',
          provider: 'livekit',
        },
      }),
    });
    assert.equal(eventResp.status, 200);
    assert.equal(eventResp.headers.get('x-trace-id'), 'trace-test-1');

    const metricsJsonResp = await fetch(`${srv.baseUrl}/metrics?format=json`);
    const metricsJson = await metricsJsonResp.json();
    assert.equal(metricsJsonResp.status, 200);
    assert.equal(metricsJson.ok, true);
    assert.equal(typeof metricsJson.metrics.requestsTotal, 'number');

    const metricsPromResp = await fetch(`${srv.baseUrl}/metrics?format=prom`);
    const metricsProm = await metricsPromResp.text();
    assert.equal(metricsPromResp.status, 200);
    assert.equal(metricsProm.includes('lifeos_requests_total'), true);
  } finally {
    await srv.stop();
  }
});

test('rate limiting blocks burst traffic on non-exempt endpoint', async () => {
  const srv = await startServer({ RATE_LIMIT_MAX_REQUESTS: '1', RATE_LIMIT_WINDOW_MS: '120000' });
  try {
    const r1 = await fetch(`${srv.baseUrl}/v1/realtime/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_rl_1',
        type: 'call.started',
        payload: {
          callId: 'sess_rl_1',
          channel: 'voice',
          direction: 'outbound',
          provider: 'livekit',
        },
      }),
    });
    assert.equal(r1.status, 200);

    const r2 = await fetch(`${srv.baseUrl}/v1/realtime/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_rl_1',
        type: 'call.started',
        payload: {
          callId: 'sess_rl_1',
          channel: 'voice',
          direction: 'outbound',
          provider: 'livekit',
        },
      }),
    });
    const r2Json = await r2.json();
    assert.equal(r2.status, 429);
    assert.equal(r2Json.code, 'RATE_LIMITED');
  } finally {
    await srv.stop();
  }
});

test('data-governance map, deletion capability, and auditability work end-to-end', async () => {
  const srv = await startServer();
  try {
    const execute = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId: 'sess_gov_1',
        actionId: 'act-gov-1',
        actionType: 'cv.generate',
        summary: 'Generate CV',
        riskTier: 'low-risk-write',
        payload: { targetRole: 'chef' },
      }),
    });
    assert.equal(execute.status, 200);

    const dataMapResp = await fetch(`${srv.baseUrl}/v1/governance/accounts/user-a/data-map`, {
      headers: { 'x-user-id': 'user-a' },
    });
    const dataMapJson = await dataMapResp.json();
    assert.equal(dataMapResp.status, 200);
    assert.equal(dataMapJson.currentCounts.usageMeterRecords >= 1, true);

    const dryRunResp = await fetch(`${srv.baseUrl}/v1/governance/accounts/user-a/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ mode: 'dry-run', userId: 'user-a' }),
    });
    const dryRunJson = await dryRunResp.json();
    assert.equal(dryRunResp.status, 200);
    assert.equal(dryRunJson.dryRun, true);

    const executeDeleteResp = await fetch(`${srv.baseUrl}/v1/governance/accounts/user-a/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ mode: 'execute', confirm: true, userId: 'user-a' }),
    });
    const executeDeleteJson = await executeDeleteResp.json();
    assert.equal(executeDeleteResp.status, 200);
    assert.equal(executeDeleteJson.deleted.totalDeleted >= 1, true);

    const usageAfterResp = await fetch(`${srv.baseUrl}/v1/billing/accounts/user-a/usage-summary`, {
      headers: { 'x-user-id': 'user-a' },
    });
    const usageAfterJson = await usageAfterResp.json();
    assert.equal(usageAfterResp.status, 200);
    assert.equal(usageAfterJson.recordsCount, 0);

    const auditResp = await fetch(`${srv.baseUrl}/v1/governance/accounts/user-a/audit`, {
      headers: { 'x-user-id': 'user-a' },
    });
    const auditJson = await auditResp.json();
    assert.equal(auditResp.status, 200);
    assert.equal(auditJson.count >= 2, true);
  } finally {
    await srv.stop();
  }
});

test('operator tenant controls support onboarding baseline', async () => {
  const srv = await startServer();
  try {
    const upsertResp = await fetch(`${srv.baseUrl}/v1/operator/tenants/user-pilot/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gateway-token': 'test-token' },
      body: JSON.stringify({
        status: 'active',
        plan: 'pilot',
        maxConcurrentCalls: 7,
        flags: { realtimeCallsEnabled: true },
        metadata: { owner: 'sales' },
      }),
    });
    const upsertJson = await upsertResp.json();
    assert.equal(upsertResp.status, 200);
    assert.equal(upsertJson.tenant.plan, 'pilot');

    const getResp = await fetch(`${srv.baseUrl}/v1/operator/tenants/user-pilot/config`, {
      headers: { 'x-gateway-token': 'test-token' },
    });
    const getJson = await getResp.json();
    assert.equal(getResp.status, 200);
    assert.equal(getJson.tenant.maxConcurrentCalls, 7);

    const listResp = await fetch(`${srv.baseUrl}/v1/operator/tenants?limit=10`, {
      headers: { 'x-gateway-token': 'test-token' },
    });
    const listJson = await listResp.json();
    assert.equal(listResp.status, 200);
    assert.equal(listJson.count >= 1, true);
  } finally {
    await srv.stop();
  }
});
