import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

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

async function startMockResponsesServer(responseText) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/responses') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      return;
    }

    const payload = {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: responseText }],
        },
      ],
    };

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/v1/responses`;

  return {
    url,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function startServer(extraEnv = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'life-os-test-turn-'));
  const port = 4100 + Math.floor(Math.random() * 1000);
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

async function createSession(baseUrl, userId) {
  const r = await fetch(`${baseUrl}/v1/call/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({ userId }),
  });
  return { status: r.status, json: await r.json() };
}

test('turn endpoint enforces call session ownership', async () => {
  const mock = await startMockResponsesServer('Hello from assistant');
  const srv = await startServer({ OPENCLAW_RESPONSES_URL: mock.url });

  try {
    const created = await createSession(srv.baseUrl, 'user-a');
    assert.equal(created.status, 200);
    const sessionId = created.json.session.sessionId;

    const denied = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/turn`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user-b',
      },
      body: JSON.stringify({ userId: 'user-b', text: 'hello' }),
    });

    const deniedJson = await denied.json();
    assert.equal(denied.status, 403);
    assert.equal(deniedJson.code, 'CROSS_USER_FORBIDDEN');
  } finally {
    await srv.stop();
    await mock.stop();
  }
});

test('turn endpoint emits canonical transcript and action lifecycle events', async () => {
  const assistantResponse = [
    '[UI:SPEAKER_CHANGE speaker="antonio"]',
    '[UI:DELIVERABLE_OUTREACH]',
    '{"messages":[{"body":"Hi Sarah — quick follow-up."}],"requireConfirmation":true}',
    '[/UI:DELIVERABLE_OUTREACH]',
    '[UI:CONFIRM_REQUIRED actionId="send-outreach-1" message="Send this message to Sarah?" riskTier="high-risk-external-send" timeout="30000"]',
    'Draft ready.',
  ].join('\n');

  const mock = await startMockResponsesServer(assistantResponse);
  const srv = await startServer({ OPENCLAW_RESPONSES_URL: mock.url });

  try {
    const created = await createSession(srv.baseUrl, 'user-a');
    assert.equal(created.status, 200);
    const sessionId = created.json.session.sessionId;

    const turn = await fetch(`${srv.baseUrl}/v1/call/sessions/${sessionId}/turn`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user-a',
      },
      body: JSON.stringify({
        userId: 'user-a',
        sessionId,
        conversationId: sessionId,
        persona: 'both',
        text: 'Can you draft outreach?',
        messages: [{ role: 'user', content: 'Can you draft outreach?' }],
      }),
    });

    const turnJson = await turn.json();
    assert.equal(turn.status, 200);
    assert.equal(turnJson.ok, true);
    assert.equal(turnJson.sessionId, sessionId);

    const eventTypes = (turnJson.events || []).map((e) => e.type);
    assert.ok(eventTypes.includes('transcript.final'));
    assert.ok(eventTypes.includes('action.proposed'));
    assert.ok(eventTypes.includes('action.requires_confirmation'));

    const replay = await fetch(`${srv.baseUrl}/v1/realtime/sessions/${sessionId}/events?afterSequence=0&limit=200`);
    const replayJson = await replay.json();
    assert.equal(replay.status, 200);

    const replayTypes = (replayJson.events || []).map((e) => e.type);
    assert.ok(replayTypes.includes('transcript.final'));
    assert.ok(replayTypes.includes('action.proposed'));
    assert.ok(replayTypes.includes('action.requires_confirmation'));

    const transcriptFinalEvents = (replayJson.events || []).filter((e) => e.type === 'transcript.final');
    const speakers = transcriptFinalEvents.map((e) => e.payload?.speaker).sort();
    assert.ok(speakers.includes('user'));
    assert.ok(speakers.includes('agent'));
  } finally {
    await srv.stop();
    await mock.stop();
  }
});
