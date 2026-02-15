import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';

import { buildServer } from './index.mjs';

async function withServer(run) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'lifeos-test-'));
  const dbFile = path.join(tmpDir, 'test.db');
  const prev = {
    key: process.env.LIVEKIT_API_KEY,
    secret: process.env.LIVEKIT_API_SECRET,
    ttl: process.env.LIVEKIT_TOKEN_TTL_SECONDS,
  };

  process.env.LIVEKIT_API_KEY = 'lk_test_key';
  process.env.LIVEKIT_API_SECRET = 'lk_test_secret';
  process.env.LIVEKIT_TOKEN_TTL_SECONDS = '120';

  const app = await buildServer({ dbFile });

  try {
    await run(app);
  } finally {
    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
    process.env.LIVEKIT_API_KEY = prev.key;
    process.env.LIVEKIT_API_SECRET = prev.secret;
    process.env.LIVEKIT_TOKEN_TTL_SECONDS = prev.ttl;
  }
}

async function createSession(app) {
  const createRes = await app.inject({
    method: 'POST',
    url: '/v1/call/sessions',
    headers: { 'x-user-id': 'user_123' },
    payload: { metadata: { source: 'test' } },
  });
  assert.equal(createRes.statusCode, 200);
  return createRes.json().session;
}

function decodePayload(token) {
  const [, payloadPart] = token.split('.');
  return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
}

test('minted livekit token has short expiry and no secret exposure', async () => {
  await withServer(async (app) => {
    const session = await createSession(app);

    const beforeSec = Math.floor(Date.now() / 1000);
    const tokenRes = await app.inject({
      method: 'POST',
      url: `/v1/call/sessions/${session.sessionId}/livekit/token`,
      headers: { 'x-user-id': 'user_123' },
      payload: { ttlSeconds: 90 },
    });

    assert.equal(tokenRes.statusCode, 200);
    const body = tokenRes.json();
    assert.equal(body.provider, 'livekit');
    assert.ok(body.token);
    assert.equal(body.apiSecret, undefined);

    const payload = decodePayload(body.token);
    assert.equal(payload.iss, 'lk_test_key');
    assert.equal(payload.video.room, body.roomName);

    const ttl = payload.exp - beforeSec;
    assert.ok(ttl <= 91 && ttl >= 85, `ttl out of expected range: ${ttl}`);
  });
});

test('session room + participant mapping persists to session record', async () => {
  await withServer(async (app) => {
    const session = await createSession(app);

    const tokenRes = await app.inject({
      method: 'POST',
      url: `/v1/call/sessions/${session.sessionId}/livekit/token`,
      headers: { 'x-user-id': 'user_123' },
    });
    assert.equal(tokenRes.statusCode, 200);
    const tokenBody = tokenRes.json();

    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/call/sessions/${session.sessionId}`,
      headers: { 'x-user-id': 'user_123' },
    });
    assert.equal(getRes.statusCode, 200);

    const persisted = getRes.json().session;
    assert.equal(persisted.providerRoomName, tokenBody.roomName);
    assert.equal(persisted.providerParticipantIdentity, tokenBody.participantIdentity);
    assert.equal(persisted.providerParticipantName, tokenBody.participantName);
  });
});

test('duplicate provider webhook events are suppressed', async () => {
  await withServer(async (app) => {
    const session = await createSession(app);
    const tokenRes = await app.inject({
      method: 'POST',
      url: `/v1/call/sessions/${session.sessionId}/livekit/token`,
      headers: { 'x-user-id': 'user_123' },
    });
    const { roomName } = tokenRes.json();

    const eventPayload = {
      eventId: 'evt-dup-1',
      type: 'participant_joined',
      roomName,
    };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/providers/livekit/webhook',
      payload: eventPayload,
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().canonicalType, 'call.connected');

    const second = await app.inject({
      method: 'POST',
      url: '/v1/providers/livekit/webhook',
      payload: eventPayload,
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().duplicate, true);
    assert.equal(second.json().suppressed, true);
  });
});
