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
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-test-'));
  const port = 3100 + Math.floor(Math.random() * 1000);
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

  let logs = '';
  child.stdout.on('data', (d) => { logs += d.toString(); });
  child.stderr.on('data', (d) => { logs += d.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);

  async function stop() {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.on('exit', resolve);
      setTimeout(resolve, 1000);
    });
    await rm(dir, { recursive: true, force: true });
  }

  return { baseUrl, stop, logs: () => logs };
}

async function createSession(baseUrl, userId, body = {}) {
  const r = await fetch(`${baseUrl}/v1/call/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
}

test('authorized user can only access own sessions', async () => {
  const srv = await startServer();
  try {
    const created = await createSession(srv.baseUrl, 'user-a', {});
    assert.equal(created.status, 200);
    const sessionId = created.json.session.sessionId;

    const listOwn = await fetch(`${srv.baseUrl}/v1/call/sessions`, { headers: { 'x-user-id': 'user-a' } });
    const ownJson = await listOwn.json();
    assert.equal(listOwn.status, 200);
    assert.equal(ownJson.sessions.length, 1);

    const listOther = await fetch(`${srv.baseUrl}/v1/call/sessions`, { headers: { 'x-user-id': 'user-b' } });
    const otherJson = await listOther.json();
    assert.equal(listOther.status, 200);
    assert.equal(otherJson.sessions.length, 0);

    const getOther = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}`, { headers: { 'x-user-id': 'user-b' } });
    const getOtherJson = await getOther.json();
    assert.equal(getOther.status, 403);
    assert.equal(getOtherJson.code, 'CROSS_USER_FORBIDDEN');
  } finally {
    await srv.stop();
  }
});

test('invalid lifecycle transitions are blocked', async () => {
  const srv = await startServer();
  try {
    const created = await createSession(srv.baseUrl, 'user-a', {});
    const sessionId = created.json.session.sessionId;

    const invalidEnd = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ status: 'ended' }),
    });
    const invalidEndJson = await invalidEnd.json();
    assert.equal(invalidEnd.status, 409);
    assert.equal(invalidEndJson.code, 'INVALID_TRANSITION');

    const activate = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        status: 'active',
        provider: 'livekit',
        providerRoomId: 'room-1',
        providerParticipantId: 'part-1',
        providerCallId: 'call-1',
      }),
    });
    assert.equal(activate.status, 200);

    const invalidBack = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ status: 'created' }),
    });
    const invalidBackJson = await invalidBack.json();
    assert.equal(invalidBack.status, 409);
    assert.equal(invalidBackJson.code, 'INVALID_TRANSITION');
  } finally {
    await srv.stop();
  }
});

test('duplicate activate/end updates are replay-safe', async () => {
  const srv = await startServer();
  try {
    const created = await createSession(srv.baseUrl, 'user-a', {});
    const sessionId = created.json.session.sessionId;

    const activate1 = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        status: 'active',
        provider: 'livekit',
        providerRoomId: 'room-1',
        providerParticipantId: 'part-1',
        providerCallId: 'call-1',
      }),
    });
    const act1 = await activate1.json();
    assert.equal(activate1.status, 200);

    const activate2 = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        status: 'active',
        provider: 'livekit',
        providerRoomId: 'room-1',
        providerParticipantId: 'part-1',
        providerCallId: 'call-1',
      }),
    });
    const act2 = await activate2.json();
    assert.equal(activate2.status, 200);
    assert.equal(act2.idempotentReplay, true);
    assert.equal(act2.session.startedAtMs, act1.session.startedAtMs);

    const end1 = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ status: 'ended' }),
    });
    const ended1 = await end1.json();
    assert.equal(end1.status, 200);

    const end2 = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ status: 'ended' }),
    });
    const ended2 = await end2.json();
    assert.equal(end2.status, 200);
    assert.equal(ended2.idempotentReplay, true);
    assert.equal(ended2.session.endedAtMs, ended1.session.endedAtMs);
  } finally {
    await srv.stop();
  }
});
