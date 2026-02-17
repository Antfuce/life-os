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

test('GET /v1/user/memory returns empty list initially', async () => {
  const server = await startServer();
  try {
    const res = await fetch(`${server.baseUrl}/v1/user/memory`, {
      headers: { 'x-user-id': 'test-user-1' },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.memories));
    assert.strictEqual(data.memories.length, 0);
  } finally {
    await server.stop();
  }
});

test('POST /v1/user/memory creates a new memory', async () => {
  const server = await startServer();
  try {
    const res = await fetch(`${server.baseUrl}/v1/user/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'test-user-2',
      },
      body: JSON.stringify({
        category: 'career',
        key: 'current_role',
        value: 'Senior Engineer',
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.id);
    assert.strictEqual(data.userId, 'test-user-2');
    assert.strictEqual(data.category, 'career');
    assert.strictEqual(data.key, 'current_role');
    assert.strictEqual(data.value, 'Senior Engineer');
    assert.ok(data.created_date);
  } finally {
    await server.stop();
  }
});

test('GET /v1/user/memory returns created memories', async () => {
  const server = await startServer();
  try {
    // Create a memory
    const createRes = await fetch(`${server.baseUrl}/v1/user/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'test-user-3',
      },
      body: JSON.stringify({
        category: 'lifestyle',
        key: 'location_preference',
        value: 'Remote',
      }),
    });
    const created = await createRes.json();

    // List memories
    const listRes = await fetch(`${server.baseUrl}/v1/user/memory`, {
      headers: { 'x-user-id': 'test-user-3' },
    });
    assert.strictEqual(listRes.status, 200);
    const data = await listRes.json();
    assert.strictEqual(data.memories.length, 1);
    assert.strictEqual(data.memories[0].id, created.id);
    assert.strictEqual(data.memories[0].value, 'Remote');
  } finally {
    await server.stop();
  }
});

test('DELETE /v1/user/memory/:id deletes a memory', async () => {
  const server = await startServer();
  try {
    // Create a memory
    const createRes = await fetch(`${server.baseUrl}/v1/user/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'test-user-4',
      },
      body: JSON.stringify({
        category: 'travel',
        key: 'favorite_destination',
        value: 'Paris',
      }),
    });
    const created = await createRes.json();

    // Delete the memory
    const deleteRes = await fetch(`${server.baseUrl}/v1/user/memory/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'test-user-4' },
    });
    assert.strictEqual(deleteRes.status, 200);
    const deleteData = await deleteRes.json();
    assert.strictEqual(deleteData.success, true);
    assert.strictEqual(deleteData.id, created.id);

    // Verify it's deleted
    const listRes = await fetch(`${server.baseUrl}/v1/user/memory`, {
      headers: { 'x-user-id': 'test-user-4' },
    });
    const listData = await listRes.json();
    assert.strictEqual(listData.memories.length, 0);
  } finally {
    await server.stop();
  }
});

test('DELETE /v1/user/memory/:id returns 403 for other user memory', async () => {
  const server = await startServer();
  try {
    // Create a memory as user A
    const createRes = await fetch(`${server.baseUrl}/v1/user/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'test-user-5a',
      },
      body: JSON.stringify({
        category: 'social',
        key: 'network_size',
        value: '500+',
      }),
    });
    const created = await createRes.json();

    // Try to delete as user B
    const deleteRes = await fetch(`${server.baseUrl}/v1/user/memory/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'test-user-5b' },
    });
    assert.strictEqual(deleteRes.status, 403);
    const deleteData = await deleteRes.json();
    assert.strictEqual(deleteData.code, 'FORBIDDEN');
  } finally {
    await server.stop();
  }
});

test('POST /v1/user/memory returns 400 for missing fields', async () => {
  const server = await startServer();
  try {
    const res = await fetch(`${server.baseUrl}/v1/user/memory`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'test-user-6',
      },
      body: JSON.stringify({
        category: 'career',
        // missing key and value
      }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'INVALID_REQUEST');
  } finally {
    await server.stop();
  }
});

test('GET /v1/user/memory returns 401 without x-user-id', async () => {
  const server = await startServer();
  try {
    const res = await fetch(`${server.baseUrl}/v1/user/memory`);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.code, 'AUTH_REQUIRED');
  } finally {
    await server.stop();
  }
});
