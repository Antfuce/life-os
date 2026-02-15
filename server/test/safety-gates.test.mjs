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
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-safety-test-'));
  const port = 4400 + Math.floor(Math.random() * 500);
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

test('send/outreach action requires explicit confirmation and emits safety.blocked', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_safety_blocked_1';
    const response = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId,
        actionId: 'act-send-1',
        actionType: 'outreach.requestSend',
        summary: 'Send outreach message',
        riskTier: 'high-risk-external-send',
        payload: { message: 'hello' },
      }),
    });
    const json = await response.json();
    assert.equal(response.status, 403);
    assert.equal(json.code, 'SAFETY_BLOCKED');

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events`);
    const replayJson = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayJson.events.length, 2);
    assert.equal(replayJson.events[0].type, 'orchestration.action.requested');
    assert.equal(replayJson.events[1].type, 'safety.blocked');
  } finally {
    await srv.stop();
  }
});

test('confirmed outreach action emits safety.approved then executes', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_safety_approved_1';
    const response = await fetch(`${srv.baseUrl}/v1/orchestration/actions/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        sessionId,
        actionId: 'act-send-2',
        actionType: 'outreach.requestSend',
        summary: 'Send outreach message',
        riskTier: 'high-risk-external-send',
        userConfirmation: true,
        payload: { message: 'hello' },
      }),
    });
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.equal(json.ok, true);

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events`);
    const replayJson = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayJson.events.length, 3);
    assert.equal(replayJson.events[0].type, 'orchestration.action.requested');
    assert.equal(replayJson.events[1].type, 'safety.approved');
    assert.equal(replayJson.events[2].type, 'action.executed');
  } finally {
    await srv.stop();
  }
});
