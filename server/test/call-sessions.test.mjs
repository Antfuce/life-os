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
      LIVEKIT_API_KEY: 'lk_test_key',
      LIVEKIT_API_SECRET: 'lk_test_secret',
      LIVEKIT_WS_URL: 'wss://livekit.example.test',
      ...extraEnv,
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
    const activated = await activate.json();
    assert.equal(activated.session.providerRoomId, 'room-1');
    assert.equal(activated.session.providerParticipantId, 'part-1');
    assert.equal(activated.session.providerCallId, 'call-1');
    assert.equal(activated.providerAuth.provider, 'livekit');
    assert.equal(activated.providerAuth.room, 'room-1');
    assert.equal(activated.providerAuth.identity, 'part-1');
    assert.equal(typeof activated.providerAuth.token, 'string');

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



test('provider correlation fields are immutable after activation', async () => {
  const srv = await startServer();
  try {
    const created = await createSession(srv.baseUrl, 'user-a', {});
    const sessionId = created.json.session.sessionId;

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

    const mismatch = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({
        status: 'active',
        providerRoomId: 'room-2',
      }),
    });
    const mismatchJson = await mismatch.json();
    assert.equal(mismatch.status, 409);
    assert.equal(mismatchJson.code, 'PROVIDER_CORRELATION_MISMATCH');
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

test('livekit token endpoint mints short-lived token and persists mapping metadata', async () => {
  const srv = await startServer({
    LIVEKIT_WS_URL: 'wss://example.livekit.local',
    LIVEKIT_API_KEY: 'lk_test_key',
    LIVEKIT_API_SECRET: 'lk_test_secret',
  });

  try {
    const created = await createSession(srv.baseUrl, 'user-a', {});
    assert.equal(created.status, 200);
    const sessionId = created.json.session.sessionId;

    const tokenResp = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/livekit/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ ttlSeconds: 90, participantName: 'Antonio' }),
    });
    const tokenJson = await tokenResp.json();
    assert.equal(tokenResp.status, 200);
    assert.equal(tokenJson.ok, true);
    assert.equal(tokenJson.transport.provider, 'livekit');
    assert.equal(tokenJson.transport.wsUrl, 'wss://example.livekit.local');
    assert.equal(tokenJson.transport.expiresInSeconds, 90);
    assert.equal(typeof tokenJson.transport.accessToken, 'string');
    assert.equal(tokenJson.transport.accessToken.split('.').length, 3);

    assert.equal(tokenJson.session.provider, 'livekit');
    assert.ok(tokenJson.session.providerRoomId);
    assert.ok(tokenJson.session.providerParticipantId);
    assert.ok(tokenJson.session.providerCallId);
    assert.equal(tokenJson.session.metadata.livekit.roomName, tokenJson.session.providerRoomId);
  } finally {
    await srv.stop();
  }
});

test('reconnect requires valid resume token and replays from acknowledged sequence', async () => {
  const srv = await startServer();
  try {
    const created = await createSession(srv.baseUrl, 'user-a', { reconnectWindowMs: 120000 });
    assert.equal(created.status, 200);
    const sessionId = created.json.session.sessionId;
    const resumeToken = created.json.session.resumeToken;

    await fetch(`${srv.baseUrl}/v1/realtime/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        type: 'transcript.partial',
        actor: { role: 'agent', id: 'agent-1' },
        payload: { utteranceId: 'u1', speaker: 'agent', text: 'hello', startMs: 0, endMs: 300 },
      }),
    });
    await fetch(`${srv.baseUrl}/v1/realtime/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        type: 'transcript.final',
        actor: { role: 'agent', id: 'agent-1' },
        payload: { utteranceId: 'u1', speaker: 'agent', text: 'hello world', startMs: 0, endMs: 600 },
      }),
    });

    const invalidReconnect = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/reconnect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ resumeToken: 'bad-token' }),
    });
    assert.equal(invalidReconnect.status, 403);

    const reconnect = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/reconnect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ resumeToken, lastAckSequence: 1 }),
    });
    const reconnectJson = await reconnect.json();
    assert.equal(reconnect.status, 200);
    assert.equal(reconnectJson.replay.events.length, 2);
    assert.equal(reconnectJson.replay.events[0].sequence, 2);

    const checkpoint = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/checkpoint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        consumerId: 'web-client',
        watermarkTimestamp: reconnectJson.replay.events[0].timestamp,
        watermarkEventId: reconnectJson.replay.events[0].eventId,
        watermarkSequence: reconnectJson.replay.events[0].sequence,
      }),
    });
    const checkpointJson = await checkpoint.json();
    assert.equal(checkpoint.status, 200);
    assert.equal(checkpointJson.sessionAck.sequence, reconnectJson.replay.events[0].sequence);
  } finally {
    await srv.stop();
  }
});

test('livekit media events are translated into canonical event families before fanout', async () => {
  const srv = await startServer();

  try {
    const created = await createSession(srv.baseUrl, 'user-a', {
      providerRoomId: 'room-translate-1',
      providerParticipantId: 'participant-42',
      providerCallId: 'call-translate-1',
    });
    assert.equal(created.status, 200);
    const sessionId = created.json.session.sessionId;

    const events = [
      { event: 'participant_connected', roomName: 'room-translate-1', participantIdentity: 'participant-42' },
      { event: 'transcription_received', roomName: 'room-translate-1', participantIdentity: 'participant-42', utteranceId: 'utt-1', role: 'participant', text: 'hello', startMs: 0, endMs: 120, final: false },
      { event: 'data_received', roomName: 'room-translate-1', participantIdentity: 'participant-42', actionId: 'a-1', actionType: 'cv.generate', summary: 'generate cv now' },
    ];

    for (const item of events) {
      const ingest = await fetch(`${srv.baseUrl}/v1/call/livekit/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item),
      });
      const ingestJson = await ingest.json();
      assert.equal(ingest.status, 200);
      assert.equal(ingestJson.ok, true);
      assert.equal(ingestJson.ignored, false);
    }

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events`);
    const replayJson = await replay.json();
    assert.equal(replay.status, 200);
    const types = replayJson.events.map((e) => e.type);

    assert.ok(types.includes('call.started'));
    assert.ok(types.includes('call.connected'));
    assert.ok(types.includes('transcript.partial'));
    assert.ok(types.includes('orchestration.action.requested'));
  } finally {
    await srv.stop();
  }
});

test('failing a session emits terminal failure event', async () => {
  const srv = await startServer();
  try {
    const created = await createSession(srv.baseUrl, 'user-a', {});
    const sessionId = created.json.session.sessionId;

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

    const failed = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-a' },
      body: JSON.stringify({ status: 'failed', error: 'provider disconnected permanently' }),
    });
    assert.equal(failed.status, 200);

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events`);
    const replayJson = await replay.json();
    const terminal = replayJson.events.find((evt) => evt.type === 'call.terminal_failure');
    assert.ok(terminal);
    assert.equal(terminal.payload.code, 'CALL_SESSION_IRRECOVERABLE');
  } finally {
    await srv.stop();
  }
});
