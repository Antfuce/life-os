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
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-realtime-test-'));
  const port = 4200 + Math.floor(Math.random() * 500);
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

async function emit(baseUrl, event) {
  const r = await fetch(`${baseUrl}/v1/realtime/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
  return { status: r.status, json: await r.json() };
}

test('required realtime event families validate and malformed aliases fail fast', async () => {
  const srv = await startServer();
  const sessionId = 'sess_contract_1';
  const actor = { role: 'system', id: 'backend' };

  try {
    const fixtures = [
      { type: 'call.started', payload: { callId: sessionId, channel: 'voice', direction: 'outbound', provider: 'livekit' } },
      { type: 'transcript.partial', payload: { utteranceId: 'utt-1', speaker: 'user', text: 'hello', startMs: 0, endMs: 150 } },
      { type: 'orchestration.action.requested', payload: { actionId: 'a1', actionType: 'generate_cv', summary: 'Build CV draft' } },
      { type: 'action.executed', payload: { actionId: 'a1', durationMs: 1200 } },
      { type: 'safety.approved', payload: { policyId: 'policy-1', decision: 'approved' } },
      { type: 'billing.usage.recorded', payload: { meterId: 'm1', billableSeconds: 5 } },
      { type: 'usage.tick', payload: { meterId: 'm1', billableSeconds: 6 } },
    ];

    for (const fixture of fixtures) {
      const out = await emit(srv.baseUrl, { sessionId, actor, ...fixture });
      assert.equal(out.status, 200, fixture.type);
      assert.equal(out.json.ok, true);
    }

    const badAlias = await emit(srv.baseUrl, {
      eventId: 'evt_bad_alias',
      ts: Date.now(),
      schemaVersion: '1.0',
      timestamp: new Date().toISOString(),
      sessionId,
      type: 'call.started',
      actor,
      payload: { callId: sessionId, channel: 'voice', direction: 'outbound', provider: 'livekit' },
      version: '1.0',
    });
    assert.equal(badAlias.status, 400);
    assert.equal(badAlias.json.code, 'INVALID_REALTIME_EVENT');
  } finally {
    await srv.stop();
  }
});

test('replay returns strictly newer events than watermark and dedupes by eventId', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_replay_1';
    const actor = { role: 'system', id: 'backend' };

    await emit(srv.baseUrl, {
      eventId: 'evt-001',
      timestamp: '2026-02-16T00:00:00.000Z',
      sessionId,
      type: 'usage.tick',
      actor,
      payload: { meterId: 'm1', billableSeconds: 1 },
      version: '1.0',
    });

    const duplicate = await emit(srv.baseUrl, {
      eventId: 'evt-001',
      timestamp: '2026-02-16T00:00:00.000Z',
      sessionId,
      type: 'usage.tick',
      actor,
      payload: { meterId: 'm1', billableSeconds: 1 },
      version: '1.0',
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.json.deduped, true);

    await emit(srv.baseUrl, {
      eventId: 'evt-002',
      timestamp: '2026-02-16T00:00:01.000Z',
      sessionId,
      type: 'usage.tick',
      actor,
      payload: { meterId: 'm1', billableSeconds: 2 },
      version: '1.0',
    });

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events?afterTimestamp=2026-02-16T00:00:00.000Z&afterEventId=evt-001`);
    const replayJson = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayJson.events.length, 1);
    assert.equal(replayJson.events[0].eventId, 'evt-002');

    const cp = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/checkpoint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        consumerId: 'web-client',
        watermarkTimestamp: '2026-02-16T00:00:01.000Z',
        watermarkEventId: 'evt-002',
      }),
    });
    assert.equal(cp.status, 200);

    const replayFromCheckpoint = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events?consumerId=web-client`);
    const replayFromCheckpointJson = await replayFromCheckpoint.json();
    assert.equal(replayFromCheckpoint.status, 200);
    assert.equal(replayFromCheckpointJson.events.length, 0);
  } finally {
    await srv.stop();
  }
});

test('transcript.final deterministically supersedes transcript.partial', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_transcript_1';
    const actor = { role: 'provider', id: 'livekit' };

    await emit(srv.baseUrl, {
      eventId: 'evt-t1',
      timestamp: '2026-02-16T00:01:00.000Z',
      sessionId,
      type: 'transcript.partial',
      actor,
      payload: { utteranceId: 'utt-1', speaker: 'user', text: 'hel', startMs: 0, endMs: 100 },
      version: '1.0',
    });

    await emit(srv.baseUrl, {
      eventId: 'evt-t2',
      timestamp: '2026-02-16T00:01:01.000Z',
      sessionId,
      type: 'transcript.partial',
      actor,
      payload: { utteranceId: 'utt-1', speaker: 'user', text: 'hello wo', startMs: 0, endMs: 250 },
      version: '1.0',
    });

    await emit(srv.baseUrl, {
      eventId: 'evt-t3',
      timestamp: '2026-02-16T00:01:02.000Z',
      sessionId,
      type: 'transcript.final',
      actor,
      payload: { utteranceId: 'utt-1', speaker: 'user', text: 'hello world', startMs: 0, endMs: 300 },
      version: '1.0',
    });

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events`);
    const replayJson = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayJson.events.length, 3);
    assert.equal(replayJson.transcriptState.length, 1);
    assert.equal(replayJson.transcriptState[0].type, 'transcript.final');
    assert.equal(replayJson.transcriptState[0].payload.text, 'hello world');
  } finally {
    await srv.stop();
  }
});
