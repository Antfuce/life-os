import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { EVENT_VERSION, SUPPORTED_EVENT_TYPES, validateRealtimeEventEnvelope } from '../realtime-events.mjs';

async function loadFixtures() {
  const raw = await readFile(path.resolve('server/test/fixtures/realtime-event-contract.v1.json'), 'utf8');
  return JSON.parse(raw);
}

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
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-schema-contract-test-'));
  const port = 5300 + Math.floor(Math.random() * 150);
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

function fixtureToEnvelope(fixture, idx, sessionId = 'sess_schema_contract') {
  return {
    eventId: `evt_schema_${idx}`,
    sessionId,
    ts: '2026-02-16T00:00:00.000Z',
    type: fixture.type,
    payload: fixture.payload,
    schemaVersion: EVENT_VERSION,
  };
}

test('schema contract fixtures cover all supported realtime event types', async () => {
  const fixtures = await loadFixtures();
  assert.equal(fixtures.schemaVersion, EVENT_VERSION);

  const supportedTypes = new Set(SUPPORTED_EVENT_TYPES);
  const fixtureTypes = new Set(fixtures.valid.map((f) => String(f.type)));

  assert.deepEqual([...fixtureTypes].sort(), [...supportedTypes].sort());
});

test('valid schema fixtures pass envelope validation and ingest endpoint', async () => {
  const fixtures = await loadFixtures();
  const srv = await startServer();

  try {
    for (let i = 0; i < fixtures.valid.length; i += 1) {
      const envelope = fixtureToEnvelope(fixtures.valid[i], i + 1);
      const validation = validateRealtimeEventEnvelope(envelope);
      assert.equal(validation.ok, true, `validation failed for ${fixtures.valid[i].type}`);

      const ingest = await fetch(`${srv.baseUrl}/v1/realtime/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(envelope),
      });
      const ingestJson = await ingest.json();
      assert.equal(ingest.status, 200, `ingest failed for ${fixtures.valid[i].type}`);
      assert.equal(ingestJson.ok, true);
      assert.equal(ingestJson.event.type, fixtures.valid[i].type);
    }
  } finally {
    await srv.stop();
  }
});

test('invalid schema fixtures fail envelope validation and ingest endpoint', async () => {
  const fixtures = await loadFixtures();
  const srv = await startServer();

  try {
    for (let i = 0; i < fixtures.invalid.length; i += 1) {
      const envelope = fixtureToEnvelope(fixtures.invalid[i], i + 1000);
      const validation = validateRealtimeEventEnvelope(envelope);
      assert.equal(validation.ok, false, `invalid fixture unexpectedly valid for ${fixtures.invalid[i].type}`);

      const ingest = await fetch(`${srv.baseUrl}/v1/realtime/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(envelope),
      });
      const ingestJson = await ingest.json();
      assert.equal(ingest.status, 400, `invalid fixture unexpectedly ingested for ${fixtures.invalid[i].type}`);
      assert.equal(ingestJson.code, 'INVALID_REALTIME_EVENT');
    }
  } finally {
    await srv.stop();
  }
});
