#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

function arg(name, fallback = null) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (!hit) return fallback;
  return hit.slice(pref.length);
}

const mode = arg('mode', 'prepare');
const baseUrl = arg('baseUrl', process.env.LIFE_OS_API_ORIGIN || 'http://127.0.0.1:3001');
const userId = arg('userId', process.env.LIFE_OS_USER_ID || 'pilot-livekit');
const contextPath = arg('context', 'docs/releases/livekit-e2e-context.json');
const reportPath = arg('report', `docs/releases/livekit-e2e-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);

async function postJson(url, body, headers = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: resp.status, json, text };
}

async function getJson(url, headers = {}) {
  const resp = await fetch(url, { headers });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: resp.status, json, text };
}

async function ensureDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function prepare() {
  const create = await postJson(`${baseUrl}/v1/call/sessions`, {}, { 'x-user-id': userId });
  if (create.status !== 200 || !create.json?.session?.sessionId) {
    throw new Error(`create session failed (${create.status}): ${create.text}`);
  }

  const sessionId = create.json.session.sessionId;
  const token = await postJson(`${baseUrl}/v1/call/sessions/${sessionId}/livekit/token`, { ttlSeconds: 600, participantName: userId }, { 'x-user-id': userId });
  if (token.status !== 200 || !token.json?.transport?.accessToken) {
    throw new Error(`mint token failed (${token.status}): ${token.text}`);
  }

  const context = {
    createdAt: new Date().toISOString(),
    baseUrl,
    userId,
    sessionId,
    transport: token.json.transport,
  };

  await ensureDir(contextPath);
  await writeFile(contextPath, JSON.stringify(context, null, 2));

  console.log('Prepared LiveKit E2E context.');
  console.log(`- Context file: ${contextPath}`);
  console.log(`- Session: ${sessionId}`);
  console.log(`- Room: ${token.json.transport.roomName}`);
  console.log(`- Identity: ${token.json.transport.participantIdentity}`);
  console.log('\nManual step now:');
  console.log('1) Open https://meet.livekit.io');
  console.log(`2) Enter server URL: ${token.json.transport.wsUrl}`);
  console.log(`3) Enter access token from ${contextPath} (transport.accessToken)`);
  console.log('4) Join room and publish microphone for ~10s');
  console.log('5) After that, run this script with --mode=collect');
}

async function collect() {
  const raw = await readFile(contextPath, 'utf8');
  const ctx = JSON.parse(raw);

  const session = await getJson(`${ctx.baseUrl}/v1/call/sessions/${ctx.sessionId}`, { 'x-user-id': ctx.userId });
  const events = await getJson(`${ctx.baseUrl}/v1/realtime/sessions/${ctx.sessionId}/events?diagnostics=true`, { 'x-user-id': ctx.userId });

  const eventTypes = Array.isArray(events.json?.events) ? events.json.events.map((e) => e.type) : [];
  const uniqTypes = [...new Set(eventTypes)].sort();

  const report = `# LiveKit E2E Integration Evidence\n\nGenerated: ${new Date().toISOString()}\n\n## Context\n- baseUrl: ${ctx.baseUrl}\n- userId: ${ctx.userId}\n- sessionId: ${ctx.sessionId}\n- roomName: ${ctx.transport?.roomName || ''}\n- participantIdentity: ${ctx.transport?.participantIdentity || ''}\n\n## Session API\n- GET /v1/call/sessions/:sessionId status: ${session.status}\n- session status: ${session.json?.session?.status || 'unknown'}\n\n## Event Replay\n- GET /v1/realtime/sessions/:sessionId/events status: ${events.status}\n- event count: ${events.json?.events?.length || 0}\n- unique event types:\n${uniqTypes.map((t) => `  - ${t}`).join('\n') || '  - (none)'}\n\n## Manual verification checklist\n- [ ] Room join succeeded in LiveKit UI\n- [ ] Media publish/subscription observed\n- [ ] Backend captured expected call/transcript events\n- [ ] Evidence attached to release bundle\n\n## Raw diagnostics\n\n\`\`\`json\n${JSON.stringify(events.json?.diagnostics || {}, null, 2)}\n\`\`\`\n`;

  await ensureDir(reportPath);
  await writeFile(reportPath, report);
  console.log(`Evidence report written: ${reportPath}`);
}

async function main() {
  if (mode === 'prepare') return prepare();
  if (mode === 'collect') return collect();
  throw new Error(`Unsupported mode: ${mode}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
