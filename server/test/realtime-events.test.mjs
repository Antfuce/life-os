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

test('canonical envelope validates and legacy keys are normalized at ingestion', async () => {
  const srv = await startServer();
  const sessionId = 'sess_contract_1';

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
      const out = await emit(srv.baseUrl, { sessionId, ...fixture });
      assert.equal(out.status, 200, fixture.type);
      assert.equal(out.json.ok, true);
      assert.equal(typeof out.json.event.ts, 'string');
      assert.equal(out.json.event.schemaVersion, '1.0');
    }

    const normalizedLegacy = await emit(srv.baseUrl, {
      eventId: 'evt_legacy_1',
      timestamp: '2026-02-16T00:00:00.000Z',
      sessionId,
      type: 'usage.tick',
      actor: { role: 'system', id: 'backend' },
      payload: { meterId: 'm2', billableSeconds: 1 },
      version: '1.0',
    });
    assert.equal(normalizedLegacy.status, 200);
    assert.equal(normalizedLegacy.json.event.ts, '2026-02-16T00:00:00.000Z');
    assert.equal(normalizedLegacy.json.event.schemaVersion, '1.0');
    assert.equal(normalizedLegacy.json.event.timestamp, undefined);
    assert.equal(normalizedLegacy.json.event.version, undefined);

    const badKey = await emit(srv.baseUrl, {
      eventId: 'evt_bad_key',
      ts: '2026-02-16T00:00:01.000Z',
      sessionId,
      type: 'usage.tick',
      payload: { meterId: 'm2', billableSeconds: 1 },
      schemaVersion: '1.0',
      foo: 'bar',
    });
    assert.equal(badKey.status, 400);
    assert.equal(badKey.json.code, 'INVALID_REALTIME_EVENT');
  } finally {
    await srv.stop();
  }
});

test('replay is idempotent for duplicates and deterministic for out-of-order arrivals', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_replay_1';

    await emit(srv.baseUrl, {
      eventId: 'evt-010',
      ts: '2026-02-16T00:00:10.000Z',
      sessionId,
      type: 'usage.tick',
      payload: { meterId: 'm1', billableSeconds: 10 },
      schemaVersion: '1.0',
    });

    await emit(srv.baseUrl, {
      eventId: 'evt-005',
      ts: '2026-02-16T00:00:05.000Z',
      sessionId,
      type: 'usage.tick',
      payload: { meterId: 'm1', billableSeconds: 5 },
      schemaVersion: '1.0',
    });

    const duplicate = await emit(srv.baseUrl, {
      eventId: 'evt-010',
      ts: '2026-02-16T00:00:10.000Z',
      sessionId,
      type: 'usage.tick',
      payload: { meterId: 'm1', billableSeconds: 10 },
      schemaVersion: '1.0',
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.json.deduped, true);

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events`);
    const replayJson = await replay.json();
    assert.equal(replay.status, 200);
    assert.deepEqual(replayJson.events.map((evt) => evt.eventId), ['evt-005', 'evt-010']);

    const replayAfterWatermark = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events?afterTs=2026-02-16T00:00:05.000Z&afterEventId=evt-005`);
    const replayAfterWatermarkJson = await replayAfterWatermark.json();
    assert.equal(replayAfterWatermark.status, 200);
    assert.equal(replayAfterWatermarkJson.events.length, 1);
    assert.equal(replayAfterWatermarkJson.events[0].eventId, 'evt-010');

    const cp = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/checkpoint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        consumerId: 'web-client',
        watermarkTs: '2026-02-16T00:00:10.000Z',
        watermarkEventId: 'evt-010',
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

test('transcript.final deterministically supersedes transcript.partial and persists snapshots append-only', async () => {
  const srv = await startServer();
  try {
    const sessionId = 'sess_transcript_1';

    await emit(srv.baseUrl, {
      eventId: 'evt-t1',
      ts: '2026-02-16T00:01:00.000Z',
      sessionId,
      type: 'transcript.partial',
      payload: { utteranceId: 'utt-1', speaker: 'user', text: 'hel', startMs: 0, endMs: 100 },
      schemaVersion: '1.0',
    });

    await emit(srv.baseUrl, {
      eventId: 'evt-t2',
      ts: '2026-02-16T00:01:01.000Z',
      sessionId,
      type: 'transcript.partial',
      payload: { utteranceId: 'utt-1', speaker: 'user', text: 'hello wo', startMs: 0, endMs: 250 },
      schemaVersion: '1.0',
    });

    await emit(srv.baseUrl, {
      eventId: 'evt-t3',
      ts: '2026-02-16T00:01:02.000Z',
      sessionId,
      type: 'transcript.final',
      payload: { utteranceId: 'utt-1', speaker: 'user', text: 'hello world', startMs: 0, endMs: 300 },
      schemaVersion: '1.0',
    });

    const duplicateFinal = await emit(srv.baseUrl, {
      eventId: 'evt-t3',
      ts: '2026-02-16T00:01:02.000Z',
      sessionId,
      type: 'transcript.final',
      payload: { utteranceId: 'utt-1', speaker: 'user', text: 'hello world', startMs: 0, endMs: 300 },
      schemaVersion: '1.0',
    });
    assert.equal(duplicateFinal.status, 200);
    assert.equal(duplicateFinal.json.deduped, true);

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events?diagnostics=true&snapshotLimit=10`);
    const replayJson = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayJson.events.length, 3);
    assert.equal(replayJson.transcriptState.length, 1);
    assert.equal(replayJson.transcriptState[0].type, 'transcript.final');
    assert.equal(replayJson.transcriptState[0].payload.text, 'hello world');
    assert.equal(replayJson.transcriptSnapshotsCount, 3);
    assert.equal(typeof replayJson.diagnostics.eventsQueryMs, 'number');
    assert.equal(typeof replayJson.diagnostics.snapshotsQueryMs, 'number');
    assert.equal(replayJson.diagnostics.snapshotRowsRead, 3);

    const snapshotsResp = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/transcript-snapshots?includeStats=true`);
    const snapshotsJson = await snapshotsResp.json();
    assert.equal(snapshotsResp.status, 200);
    assert.equal(snapshotsJson.count, 3);
    assert.equal(snapshotsJson.snapshots.length, 3);
    assert.deepEqual(snapshotsJson.snapshots.map((s) => s.type), ['transcript.partial', 'transcript.partial', 'transcript.final']);
    assert.deepEqual(snapshotsJson.snapshots.map((s) => s.sequence), [1, 2, 3]);
    assert.equal(snapshotsJson.snapshots[2].payload.text, 'hello world');
    assert.equal(snapshotsJson.stats.count, 3);
    assert.equal(snapshotsJson.stats.minSequence, 1);
    assert.equal(snapshotsJson.stats.maxSequence, 3);

    const compactResp = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/transcript-snapshots/compact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keepLast: 2 }),
    });
    const compactJson = await compactResp.json();
    assert.equal(compactResp.status, 200);
    assert.equal(compactJson.deletedCount, 1);
    assert.equal(compactJson.after.count, 2);

    const snapshotsAfterCompactResp = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/transcript-snapshots`);
    const snapshotsAfterCompactJson = await snapshotsAfterCompactResp.json();
    assert.equal(snapshotsAfterCompactResp.status, 200);
    assert.equal(snapshotsAfterCompactJson.count, 2);
    assert.deepEqual(snapshotsAfterCompactJson.snapshots.map((s) => s.sequence), [2, 3]);
  } finally {
    await srv.stop();
  }
});
