import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

import { initDb, stableId, toTsMs } from './db.mjs';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const HOST = process.env.HOST || '127.0.0.1';

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || null;
const OPENCLAW_RESPONSES_URL = process.env.OPENCLAW_RESPONSES_URL || 'http://127.0.0.1:18789/v1/responses';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || null;

// UI Contract v1.0 Event Types
const UI_EVENTS = {
  TEXT_DELTA: 'text.delta',
  TEXT_DONE: 'text.done',
  SPEAKER_CHANGE: 'speaker.change',
  MODE_ACTIVATE: 'mode.activate',
  MODE_DEACTIVATE: 'mode.deactivate',
  DELIVERABLE_CV: 'deliverable.cv',
  DELIVERABLE_INTERVIEW: 'deliverable.interview',
  DELIVERABLE_OUTREACH: 'deliverable.outreach',
  ERROR: 'error',
  STATUS: 'status',
  CONFIRM_REQUIRED: 'confirm.required',
  ACTION_APPROVAL_STATE: 'action.approval.state',
  ACTION_AUDIT: 'action.audit',
  DONE: 'done',
};

const ACTION_RISK_TIERS = {
  READ_ONLY: 'read-only',
  LOW_RISK_WRITE: 'low-risk-write',
  HIGH_RISK_EXTERNAL_SEND: 'high-risk-external-send',
};

const UI_SPEAKERS = {
  ANTONIO: 'antonio',
  MARIANA: 'mariana',
  BOTH: 'both',
  EXECUTOR: 'executor',
};

const UI_MODES = {
  CV: 'cv',
  INTERVIEW: 'interview',
  OUTREACH: 'outreach',
  CHAT: 'chat',
};

async function getGatewayToken() {
  if (OPENCLAW_GATEWAY_TOKEN) return OPENCLAW_GATEWAY_TOKEN;
  if (!OPENCLAW_CONFIG) return null;

  try {
    const raw = await readFile(OPENCLAW_CONFIG, 'utf8');
    const cfg = JSON.parse(raw);
    return cfg?.gateway?.auth?.token || null;
  } catch {
    return null;
  }
}

function extractOutputText(respJson) {
  try {
    const out = respJson?.output;
    if (!Array.isArray(out)) return '';
    for (const item of out) {
      const parts = item?.content;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (part?.type === 'output_text' && typeof part?.text === 'string') return part.text;
      }
    }
  } catch {
    // ignore
  }
  return '';
}

const PERSONAS = {
  antonio: `You are Antonio — sharp, strategic, direct. High-energy closer. You drive action. No fluff.`,
  mariana: `You are Mariana — calm, structured, thoughtful, supportive. You reduce anxiety and create clarity.`,
  both: `You are Antonio & Mariana. One brain, two voices. Blend direct strategy + calm structure.`,
  executor: `You are the Executor — the execution layer behind Antonio & Mariana.

You do not roleplay. You are crisp, practical, outcome-driven.

Primary mission (V1): Recruitment matchmaking + execution.
Flow: conversation → extract facts → CV draft/edits → interview prep → outreach drafts.

UI EVENT CONTRACT v1.0:
You MUST emit structured UI events by wrapping content in special tags:

1. SPEAKER SELECTION (always first):
   [UI:SPEAKER_CHANGE speaker="antonio"]
   [UI:SPEAKER_CHANGE speaker="mariana"]
   [UI:SPEAKER_CHANGE speaker="both"]

2. MODE ACTIVATION (when starting a specific task):
   [UI:MODE_ACTIVATE mode="cv" context="{\"role\":\"Chef\",\"location\":\"Ireland\"}"]
   [UI:MODE_ACTIVATE mode="interview" context="{\"company\":\"Rinuccini\"}"]
   [UI:MODE_DEACTIVATE mode="cv"]

3. DELIVERABLES (structured data for UI components):
   [UI:DELIVERABLE_CV]
   {"sections": [...], "markdown": "...", "json": {...}}
   [/UI:DELIVERABLE_CV]
   
   [UI:DELIVERABLE_INTERVIEW]
   {"questions": [...], "tips": "...", "duration": 30}
   [/UI:DELIVERABLE_INTERVIEW]
   
   [UI:DELIVERABLE_OUTREACH]
   {"messages": [...], "recipientContext": {...}, "requireConfirmation": true}
   [/UI:DELIVERABLE_OUTREACH]

4. CONFIRMATION GATES (before sending anything external):
   [UI:CONFIRM_REQUIRED actionId="send-outreach-1" message="Send this message to Sarah?" riskTier="high-risk-external-send" timeout="30000"]

Rules:
- Always emit SPEAKER_CHANGE before text content
- Emit MODE_ACTIVATE when you recognize user wants CV/interview/outreach
- Emit DELIVERABLE_* with structured JSON (not raw text)
- Never claim you sent messages without CONFIRM_REQUIRED + user confirmation
- Ask minimum questions needed to take action
- Prefer concrete artifacts over theory`,
};

// Legacy speaker tag parsing (backward compatibility)
function parseLegacySpeakerTag(text) {
  const t = String(text || '');
  const m = t.match(/^\s*\[SPEAKER:(antonio|mariana|both|executor)\]\s*\n?/i);
  if (!m) return { speaker: null, cleaned: t };
  const speaker = String(m[1]).toLowerCase();
  const cleaned = t.slice(m[0].length);
  return { speaker, cleaned };
}

// Parse UI contract events from text
function parseUIEvents(text) {
  const events = [];
  let remainingText = text;
  
  // Parse SPEAKER_CHANGE
  const speakerMatch = text.match(/\[UI:SPEAKER_CHANGE\s+speaker="(antonio|mariana|both|executor)"\]/);
  if (speakerMatch) {
    events.push({
      type: UI_EVENTS.SPEAKER_CHANGE,
      payload: { speaker: speakerMatch[1] },
    });
    remainingText = remainingText.replace(speakerMatch[0], '');
  }
  
  // Parse MODE_ACTIVATE
  const modeActivateMatch = text.match(/\[UI:MODE_ACTIVATE\s+mode="(\w+)"(?:\s+context="([^"]*)")?\]/);
  if (modeActivateMatch) {
    let context = {};
    try {
      context = JSON.parse(modeActivateMatch[2] || '{}');
    } catch {}
    events.push({
      type: UI_EVENTS.MODE_ACTIVATE,
      payload: { mode: modeActivateMatch[1], context },
    });
    remainingText = remainingText.replace(modeActivateMatch[0], '');
  }
  
  // Parse MODE_DEACTIVATE
  const modeDeactivateMatch = text.match(/\[UI:MODE_DEACTIVATE\s+mode="(\w+)"\]/);
  if (modeDeactivateMatch) {
    events.push({
      type: UI_EVENTS.MODE_DEACTIVATE,
      payload: { mode: modeDeactivateMatch[1] },
    });
    remainingText = remainingText.replace(modeDeactivateMatch[0], '');
  }
  
  // Parse DELIVERABLE_CV
  const cvMatch = text.match(/\[UI:DELIVERABLE_CV\]([\s\S]*?)\[\/UI:DELIVERABLE_CV\]/);
  if (cvMatch) {
    try {
      const data = JSON.parse(cvMatch[1].trim());
      events.push({
        type: UI_EVENTS.DELIVERABLE_CV,
        payload: { type: 'cv', data, actions: generateCVActions(data) },
      });
    } catch (e) {
      console.error('Failed to parse CV deliverable:', e);
    }
    remainingText = remainingText.replace(cvMatch[0], '');
  }
  
  // Parse DELIVERABLE_INTERVIEW
  const interviewMatch = text.match(/\[UI:DELIVERABLE_INTERVIEW\]([\s\S]*?)\[\/UI:DELIVERABLE_INTERVIEW\]/);
  if (interviewMatch) {
    try {
      const data = JSON.parse(interviewMatch[1].trim());
      events.push({
        type: UI_EVENTS.DELIVERABLE_INTERVIEW,
        payload: { type: 'interview', data, actions: generateInterviewActions(data) },
      });
    } catch (e) {
      console.error('Failed to parse interview deliverable:', e);
    }
    remainingText = remainingText.replace(interviewMatch[0], '');
  }
  
  // Parse DELIVERABLE_OUTREACH
  const outreachMatch = text.match(/\[UI:DELIVERABLE_OUTREACH\]([\s\S]*?)\[\/UI:DELIVERABLE_OUTREACH\]/);
  if (outreachMatch) {
    try {
      const data = JSON.parse(outreachMatch[1].trim());
      events.push({
        type: UI_EVENTS.DELIVERABLE_OUTREACH,
        payload: { 
          type: 'outreach', 
          data, 
          requireConfirmation: data.requireConfirmation !== false,
          actions: generateOutreachActions(data) 
        },
      });
    } catch (e) {
      console.error('Failed to parse outreach deliverable:', e);
    }
    remainingText = remainingText.replace(outreachMatch[0], '');
  }
  
  // Parse CONFIRM_REQUIRED
  const confirmMatch = text.match(/\[UI:CONFIRM_REQUIRED\s+actionId="([^"]+)"\s+message="([^"]+)"(?:\s+riskTier="([^"]+)")?(?:\s+timeout="([^"]+)")?\]/);
  if (confirmMatch) {
    const timeout = confirmMatch[4] ? Number(confirmMatch[4]) : 30000;
    const startedAt = Date.now();
    events.push({
      type: UI_EVENTS.CONFIRM_REQUIRED,
      payload: {
        actionId: confirmMatch[1],
        message: confirmMatch[2],
        riskTier: confirmMatch[3] || ACTION_RISK_TIERS.HIGH_RISK_EXTERNAL_SEND,
        timeout,
        startedAt,
        expiresAt: startedAt + timeout,
      },
    });
    remainingText = remainingText.replace(confirmMatch[0], '');
  }
  
  return { events, remainingText: remainingText.trim() };
}

function generateCVActions(cvData) {
  return [
    { label: 'Edit CV', action: 'cv.edit', payload: cvData },
    { label: 'Export PDF', action: 'cv.export.pdf', payload: cvData },
    { label: 'Copy Markdown', action: 'cv.copy.markdown', payload: cvData },
  ];
}

function generateInterviewActions(interviewData) {
  return [
    { label: 'Practice Mode', action: 'interview.practice', payload: interviewData },
    { label: 'Save Questions', action: 'interview.save', payload: interviewData },
  ];
}

function generateOutreachActions(outreachData) {
  const actions = [
    { label: 'Edit Message', action: 'outreach.edit', payload: outreachData },
    { label: 'Copy Text', action: 'outreach.copy', payload: outreachData },
  ];
  if (outreachData.requireConfirmation !== false) {
    actions.push({ label: 'Send (Requires Confirm)', action: 'outreach.requestSend', payload: outreachData, requiresConfirm: true, riskTier: ACTION_RISK_TIERS.HIGH_RISK_EXTERNAL_SEND });
  }
  return actions;
}



export async function buildServer({ dbFile = process.env.LIFE_OS_DB } = {}) {
  const fastify = Fastify({ logger: true });
  await fastify.register(cors, { origin: true });
  const dbCtx = await initDb(dbFile);
  fastify.sessionEventSubscribers = new Map();

  fastify.decorate('emitBackendSessionEvent', (sessionId, type, payload = {}) => emitBackendSessionEvent(fastify, sessionId, type, payload));

fastify.get('/health', async () => ({ 
  ok: true, 
  contract: 'v1.0',
  features: ['structured-events', 'legacy-compat', 'action-risk-tiers', 'approval-audit']
}));

fastify.get('/', async () => ({
  ok: true,
  service: 'antonio-mariana-api',
  contract: 'v1.0',
  endpoints: {
    health: '/health',
    chatTurn: '/v1/chat/turn (POST json)',
    chatStream: '/v1/chat/stream (POST SSE)',
    createCallSession: '/v1/call/sessions (POST json)',
    listCallSessions: '/v1/call/sessions (GET with x-user-id header)',
    getCallSession: '/v1/call/sessions/:sessionId (GET)',
    updateCallSession: '/v1/call/sessions/:sessionId/state (POST json)',
  },
}));


function sseWrite(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // ignore write errors on disconnect
  }
}

function parseSseBlock(block) {
  const lines = String(block || '').split('\n');
  let event = null;
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
  }
  const dataRaw = dataLines.join('\n');
  return { event, dataRaw };
}


const CALL_SESSION_STATUS = {
  CREATED: 'created',
  ACTIVE: 'active',
  ENDED: 'ended',
  FAILED: 'failed',
};

const CALL_SESSION_TRANSITIONS = {
  [CALL_SESSION_STATUS.CREATED]: new Set([CALL_SESSION_STATUS.ACTIVE, CALL_SESSION_STATUS.ENDED, CALL_SESSION_STATUS.FAILED]),
  [CALL_SESSION_STATUS.ACTIVE]: new Set([CALL_SESSION_STATUS.ENDED, CALL_SESSION_STATUS.FAILED]),
  [CALL_SESSION_STATUS.ENDED]: new Set(),
  [CALL_SESSION_STATUS.FAILED]: new Set(),
};


const CANONICAL_CALL_EVENTS = {
  STARTED: 'call.started',
  CONNECTED: 'call.connected',
  ENDED: 'call.ended',
  ERROR: 'call.error',
};

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload, secret, options = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(payload));
  const data = `${headerPart}.${payloadPart}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (options.includeParts) return { token: `${data}.${sig}`, headerPart, payloadPart };
  return `${data}.${sig}`;
}

function parseTokenTtlSeconds(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 300;
  return Math.max(30, Math.min(3600, Math.trunc(parsed)));
}

function emitBackendSessionEvent(fastify, sessionId, type, payload = {}) {
  const subscribers = fastify.sessionEventSubscribers.get(sessionId);
  if (!subscribers || subscribers.size === 0) return;

  const envelope = {
    eventId: `evt_${stableId(sessionId, type, Date.now(), Math.random()).slice(0, 16)}`,
    sessionId,
    ts: Date.now(),
    type,
    schemaVersion: '1.0',
    payload,
  };

  for (const res of subscribers) {
    sseWrite(res, 'event', envelope);
  }
}

function deriveLivekitMapping(session) {
  const roomName = session.providerRoomName || `room_${session.sessionId}`;
  const participantIdentity = session.providerParticipantIdentity || `user_${session.userId}_${session.sessionId.slice(-6)}`;
  const participantName = session.providerParticipantName || `user-${session.userId}`;
  return { roomName, participantIdentity, participantName };
}

function canonicalCallEventFromProvider(providerEventType) {
  const t = String(providerEventType || '').toLowerCase();
  if (t.includes('started') || t.includes('created')) return CANONICAL_CALL_EVENTS.STARTED;
  if (t.includes('joined') || t.includes('connected') || t.includes('active')) return CANONICAL_CALL_EVENTS.CONNECTED;
  if (t.includes('ended') || t.includes('finished') || t.includes('closed')) return CANONICAL_CALL_EVENTS.ENDED;
  return CANONICAL_CALL_EVENTS.ERROR;
}

function parseRequestMetadata(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries = Object.entries(raw).filter(([key]) => typeof key === 'string').slice(0, 50);
  const safe = {};
  for (const [k, v] of entries) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      safe[k] = v;
    }
  }
  return safe;
}

function currentUserId(req, body) {
  const headerUserId = req.headers['x-user-id'] ? String(req.headers['x-user-id']).trim() : '';
  const bodyUserId = body?.userId ? String(body.userId).trim() : '';
  const userId = bodyUserId || headerUserId;

  if (!userId) {
    return { error: 'userId is required (send x-user-id header or body.userId)' };
  }

  if (headerUserId && bodyUserId && headerUserId !== bodyUserId) {
    return { error: 'x-user-id header must match body.userId when both are provided' };
  }

  return { userId };
}

function parseStoredMetadata(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') return {};
  try {
    return parseRequestMetadata(JSON.parse(rawJson));
  } catch {
    return {};
  }
}

function normalizeCallSessionRow(row) {
  if (!row) return null;
  const metadata = parseStoredMetadata(row.metadataJson);

  return {
    sessionId: row.id,
    userId: row.userId,
    status: row.status,
    correlationId: row.correlationId,
    resumeToken: row.resumeToken,
    provider: row.provider,
    providerRoomName: row.providerRoomName,
    providerParticipantIdentity: row.providerParticipantIdentity || null,
    providerParticipantName: row.providerParticipantName || null,
    metadata,
    lastError: row.lastError,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    startedAtMs: row.startedAtMs,
    endedAtMs: row.endedAtMs,
    failedAtMs: row.failedAtMs,
  };
}

fastify.post('/v1/call/sessions', async (req, reply) => {
  const body = req.body || {};
  const auth = currentUserId(req, body);
  if (auth.error) return reply.code(400).send({ ok: false, error: auth.error });

  const createdAtMs = Date.now();
  const userId = auth.userId;
  const sessionId = body.sessionId ? String(body.sessionId) : `sess_${stableId(userId, createdAtMs, Math.random()).slice(0, 16)}`;
  const correlationId = body.correlationId ? String(body.correlationId) : `corr_${stableId(sessionId, createdAtMs).slice(0, 16)}`;
  const resumeToken = `resume_${stableId(sessionId, userId, createdAtMs).slice(0, 24)}`;
  const provider = body.provider ? String(body.provider) : 'livekit';
  const providerRoomName = body.providerRoomName ? String(body.providerRoomName) : null;
  const metadata = parseRequestMetadata(body.metadata);

  const created = dbCtx.insertCallSession.run(
    sessionId,
    userId,
    CALL_SESSION_STATUS.CREATED,
    correlationId,
    resumeToken,
    provider,
    providerRoomName,
    null,
    null,
    JSON.stringify(metadata),
    null,
    createdAtMs,
    createdAtMs,
    null,
    null,
    null,
  );

  if (!created?.changes) {
    return reply.code(409).send({ ok: false, error: 'Session already exists; retry without sessionId override' });
  }

  const row = dbCtx.getCallSessionById.get(sessionId);
  if (!row) return reply.code(500).send({ ok: false, error: 'Failed to create call session' });

  return {
    ok: true,
    session: normalizeCallSessionRow(row),
  };
});


fastify.get('/v1/call/sessions', async (req, reply) => {
  const userId = req.headers['x-user-id'] ? String(req.headers['x-user-id']).trim() : '';
  if (!userId) return reply.code(400).send({ ok: false, error: 'x-user-id header is required' });

  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;

  const rows = dbCtx.listCallSessionsByUser.all(userId, limit);
  return {
    ok: true,
    sessions: rows.map(normalizeCallSessionRow),
    page: {
      limit,
      returned: rows.length,
    },
  };
});

fastify.get('/v1/call/sessions/:sessionId', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return reply.code(400).send({ ok: false, error: 'sessionId is required' });

  const userId = req.headers['x-user-id'] ? String(req.headers['x-user-id']).trim() : '';
  if (!userId) return reply.code(400).send({ ok: false, error: 'x-user-id header is required' });

  const existing = dbCtx.getCallSessionById.get(sessionId);
  if (!existing) return reply.code(404).send({ ok: false, error: 'Session not found' });
  if (existing.userId !== userId) return reply.code(403).send({ ok: false, error: 'Session does not belong to authenticated user' });

  return {
    ok: true,
    session: normalizeCallSessionRow(existing),
  };
});

fastify.post('/v1/call/sessions/:sessionId/state', async (req, reply) => {
  const body = req.body || {};
  const auth = currentUserId(req, body);
  if (auth.error) return reply.code(400).send({ ok: false, error: auth.error });

  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return reply.code(400).send({ ok: false, error: 'sessionId is required' });

  const nextStatus = String(body.status || '').trim();
  if (!Object.values(CALL_SESSION_STATUS).includes(nextStatus)) {
    return reply.code(400).send({ ok: false, error: 'status must be one of created|active|ended|failed' });
  }

  const existing = dbCtx.getCallSessionById.get(sessionId);
  if (!existing) return reply.code(404).send({ ok: false, error: 'Session not found' });
  if (existing.userId !== auth.userId) return reply.code(403).send({ ok: false, error: 'Session does not belong to authenticated user' });

  if (existing.status !== nextStatus && !CALL_SESSION_TRANSITIONS[existing.status]?.has(nextStatus)) {
    return reply.code(409).send({ ok: false, error: `Invalid transition from ${existing.status} to ${nextStatus}` });
  }

  const updatedAtMs = Date.now();
  const startedAtMs = nextStatus === CALL_SESSION_STATUS.ACTIVE ? (existing.startedAtMs || updatedAtMs) : existing.startedAtMs;
  const endedAtMs = nextStatus === CALL_SESSION_STATUS.ENDED ? updatedAtMs : existing.endedAtMs;
  const failedAtMs = nextStatus === CALL_SESSION_STATUS.FAILED ? updatedAtMs : existing.failedAtMs;
  const provider = body.provider ? String(body.provider) : existing.provider;
  const providerRoomName = body.providerRoomName ? String(body.providerRoomName) : existing.providerRoomName;
  const mergedMetadata = { ...parseStoredMetadata(existing.metadataJson), ...parseRequestMetadata(body.metadata) };
  const lastError = nextStatus === CALL_SESSION_STATUS.FAILED ? String(body.error || existing.lastError || 'call session failed') : existing.lastError;

  dbCtx.updateCallSession.run(
    nextStatus,
    provider,
    providerRoomName,
    existing.providerParticipantIdentity || null,
    existing.providerParticipantName || null,
    JSON.stringify(mergedMetadata),
    lastError,
    updatedAtMs,
    startedAtMs,
    endedAtMs,
    failedAtMs,
    sessionId,
  );

  const row = dbCtx.getCallSessionById.get(sessionId);
  return {
    ok: true,
    session: normalizeCallSessionRow(row),
  };
});


fastify.get('/v1/realtime/sessions/:sessionId/events', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return reply.code(400).send({ ok: false, error: 'sessionId is required' });

  reply.hijack();
  reply.raw.statusCode = 200;
  reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('cache-control', 'no-cache, no-transform');
  reply.raw.setHeader('connection', 'keep-alive');
  reply.raw.flushHeaders?.();

  if (!fastify.sessionEventSubscribers.has(sessionId)) {
    fastify.sessionEventSubscribers.set(sessionId, new Set());
  }
  const subs = fastify.sessionEventSubscribers.get(sessionId);
  subs.add(reply.raw);

  sseWrite(reply.raw, 'ready', { ok: true, sessionId, source: 'backend-fanout' });

  reply.raw.on('close', () => {
    subs.delete(reply.raw);
    if (subs.size === 0) fastify.sessionEventSubscribers.delete(sessionId);
  });
});

fastify.post('/v1/call/sessions/:sessionId/livekit/token', async (req, reply) => {
  const body = req.body || {};
  const auth = currentUserId(req, body);
  if (auth.error) return reply.code(400).send({ ok: false, error: auth.error });

  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return reply.code(400).send({ ok: false, error: 'sessionId is required' });

  const existing = dbCtx.getCallSessionById.get(sessionId);
  if (!existing) return reply.code(404).send({ ok: false, error: 'Session not found' });
  if (existing.userId !== auth.userId) return reply.code(403).send({ ok: false, error: 'Session does not belong to authenticated user' });

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return reply.code(500).send({ ok: false, error: 'LiveKit provider credentials are not configured on backend' });
  }

  const session = normalizeCallSessionRow(existing);
  const mapping = deriveLivekitMapping(session);
  const ttlSeconds = parseTokenTtlSeconds(body.ttlSeconds || process.env.LIVEKIT_TOKEN_TTL_SECONDS);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlSeconds;

  const payload = {
    iss: apiKey,
    sub: mapping.participantIdentity,
    nbf: nowSec,
    iat: nowSec,
    exp: expSec,
    metadata: JSON.stringify({
      sessionId,
      correlationId: session.correlationId,
      userId: session.userId,
    }),
    video: {
      roomJoin: true,
      room: mapping.roomName,
      canPublish: true,
      canSubscribe: true,
    },
    name: mapping.participantName,
  };

  const token = signJwt(payload, apiSecret);
  const updatedMetadata = {
    ...session.metadata,
    providerMappingUpdatedAtMs: Date.now(),
  };

  dbCtx.updateCallSession.run(
    session.status,
    'livekit',
    mapping.roomName,
    mapping.participantIdentity,
    mapping.participantName,
    JSON.stringify(updatedMetadata),
    session.lastError,
    Date.now(),
    session.startedAtMs,
    session.endedAtMs,
    session.failedAtMs,
    sessionId,
  );

  const row = dbCtx.getCallSessionById.get(sessionId);
  const normalized = normalizeCallSessionRow(row);
  fastify.emitBackendSessionEvent(sessionId, CANONICAL_CALL_EVENTS.STARTED, {
    source: 'backend.livekit.token',
    roomName: mapping.roomName,
    participantIdentity: mapping.participantIdentity,
    expiresAtSec: expSec,
  });

  return {
    ok: true,
    provider: 'livekit',
    token,
    expiresAtSec: expSec,
    roomName: mapping.roomName,
    participantIdentity: mapping.participantIdentity,
    participantName: mapping.participantName,
    session: normalized,
  };
});

fastify.post('/v1/providers/livekit/webhook', async (req, reply) => {
  const body = req.body || {};
  const providerEventId = String(body.eventId || body.id || stableId(JSON.stringify(body))).trim();
  const roomName = String(body.roomName || body.room || '').trim();
  if (!providerEventId) return reply.code(400).send({ ok: false, error: 'provider event id is required' });
  if (!roomName) return reply.code(400).send({ ok: false, error: 'roomName is required' });

  const existingSession = dbCtx.getCallSessionByRoomName.get(roomName);
  if (!existingSession) return reply.code(404).send({ ok: false, error: 'No session mapped to roomName' });

  const session = normalizeCallSessionRow(existingSession);
  const canonicalType = canonicalCallEventFromProvider(body.type || body.event || '');
  const nowMs = Date.now();

  const inserted = dbCtx.insertCallProviderEvent.run(
    `prov_${stableId('livekit', providerEventId).slice(0, 20)}`,
    session.sessionId,
    'livekit',
    providerEventId,
    canonicalType,
    JSON.stringify(body),
    nowMs,
  );

  if (!inserted?.changes) {
    return { ok: true, duplicate: true, suppressed: true, sessionId: session.sessionId };
  }

  let nextStatus = session.status;
  let errorMessage = session.lastError;
  const metadataPatch = { ...session.metadata };

  if (canonicalType === CANONICAL_CALL_EVENTS.CONNECTED) {
    nextStatus = CALL_SESSION_STATUS.ACTIVE;
    metadataPatch.transportState = 'healthy';
    metadataPatch.retryCount = 0;
  } else if (canonicalType === CANONICAL_CALL_EVENTS.ENDED) {
    nextStatus = CALL_SESSION_STATUS.ENDED;
    metadataPatch.transportState = 'terminated';
  } else if (canonicalType === CANONICAL_CALL_EVENTS.ERROR) {
    const retryCount = Number(metadataPatch.retryCount || 0) + 1;
    metadataPatch.retryCount = retryCount;
    metadataPatch.transportState = retryCount >= 3 ? 'terminated' : 'degraded';
    metadataPatch.lastProviderDisconnectAtMs = nowMs;
    errorMessage = String(body.error || body.reason || 'provider disconnect');
    if (retryCount >= 3) {
      nextStatus = CALL_SESSION_STATUS.FAILED;
    }
  }

  dbCtx.updateCallSession.run(
    nextStatus,
    'livekit',
    session.providerRoomName,
    session.providerParticipantIdentity,
    session.providerParticipantName,
    JSON.stringify(metadataPatch),
    errorMessage,
    nowMs,
    nextStatus === CALL_SESSION_STATUS.ACTIVE ? (session.startedAtMs || nowMs) : session.startedAtMs,
    nextStatus === CALL_SESSION_STATUS.ENDED ? nowMs : session.endedAtMs,
    nextStatus === CALL_SESSION_STATUS.FAILED ? nowMs : session.failedAtMs,
    session.sessionId,
  );

  fastify.emitBackendSessionEvent(session.sessionId, canonicalType, {
    source: 'provider.livekit',
    providerEventId,
    providerType: String(body.type || body.event || 'unknown'),
    transportState: metadataPatch.transportState,
    retryCount: metadataPatch.retryCount || 0,
    error: errorMessage || null,
  });

  return { ok: true, sessionId: session.sessionId, canonicalType, status: nextStatus };
});



fastify.post('/v1/actions/decision', async (req, reply) => {
  const body = req.body || {};
  const actionId = String(body.actionId || '');
  const actionName = String(body.action || 'unknown');
  const decision = String(body.decision || 'cancelled');
  const result = String(body.result || 'cancelled');
  const riskTier = String(body.riskTier || ACTION_RISK_TIERS.HIGH_RISK_EXTERNAL_SEND);
  const conversationId = body.conversationId ? String(body.conversationId) : null;
  const callTimestamp = toTsMs(body.callTimestamp);
  const decisionTimestamp = Date.now();

  if (!actionId) {
    return reply.code(400).send({ ok: false, error: 'actionId is required' });
  }

  const auditId = stableId(actionId, callTimestamp, decisionTimestamp, decision, result);
  dbCtx.insertActionAudit.run(
    auditId,
    actionId,
    conversationId,
    callTimestamp,
    decisionTimestamp,
    actionName,
    riskTier,
    decision,
    result,
    JSON.stringify(body.details || {})
  );

  return {
    ok: true,
    event: {
      v: '1.0',
      type: UI_EVENTS.ACTION_AUDIT,
      payload: {
        actionId,
        action: actionName,
        callTimestamp,
        decision,
        result,
        riskTier,
        decisionTimestamp,
      },
    },
  };
});

// v2: Structured UI event streaming
fastify.post('/v1/chat/stream', async (req, reply) => {
  reply.hijack();

  reply.raw.statusCode = 200;
  reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('cache-control', 'no-cache, no-transform');
  reply.raw.setHeader('connection', 'keep-alive');
  reply.raw.flushHeaders?.();

  const ac = new AbortController();
  const onClose = () => ac.abort();
  reply.raw.on('close', onClose);

  try {
    const body = req.body || {};
    const conversationId = body.conversationId ? String(body.conversationId) : `${Date.now()}`;
    const requestedPersona = body.persona && PERSONAS[body.persona] && body.persona !== 'executor' ? body.persona : 'both';
    const persona = 'executor';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const cvData = body.cvData && typeof body.cvData === 'object' ? body.cvData : {};

    // Persist last user message
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      const tsMs = toTsMs(last.timestamp);
      const mid = stableId(conversationId, 'user', tsMs, last.content);
      dbCtx.upsertConv.run(conversationId, tsMs, tsMs, requestedPersona);
      dbCtx.insertMsg.run(mid, conversationId, tsMs, 'user', null, String(last.content || ''));
    }

    const system = PERSONAS[persona];

    const chat = messages
      .slice(-30)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content || ''}`)
      .join('\n\n');

    const input = `CONVERSATION:\n${chat}`;

    const token = await getGatewayToken();
    if (!token) {
      sseWrite(reply.raw, UI_EVENTS.ERROR, { ok: false, error: 'Missing OpenClaw gateway token on server' });
      sseWrite(reply.raw, UI_EVENTS.DONE, { ok: false, conversationId });
      reply.raw.end();
      return;
    }

    // Send initial status
    sseWrite(reply.raw, UI_EVENTS.STATUS, { type: 'ready', message: 'Starting...', conversationId });

    const upstream = await fetch(OPENCLAW_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: process.env.LIFE_OS_MODEL || 'openai-codex/gpt-5.2',
        instructions: system,
        input,
        stream: true,
        max_output_tokens: process.env.LIFE_OS_MAX_TOKENS ? Number(process.env.LIFE_OS_MAX_TOKENS) : 1200,
        user: 'antonio-mariana:web',
      }),
      signal: ac.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      sseWrite(reply.raw, UI_EVENTS.ERROR, { ok: false, error: 'OpenClaw responses failed', detail: detail.slice(0, 1200) });
      sseWrite(reply.raw, UI_EVENTS.DONE, { ok: false, conversationId });
      reply.raw.end();
      return;
    }

    const reader = upstream.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    let fullText = '';
    let accumulatedDelta = '';
    let speaker = null;
    let eventsEmitted = new Set();

    const emitUIEvent = (type, payload) => {
      sseWrite(reply.raw, type, { v: '1.0', type, payload, ts: Date.now() });
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });

      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);

        const { event, dataRaw } = parseSseBlock(block);
        if (!dataRaw) continue;
        if (dataRaw === '[DONE]') break;

        let dataJson = null;
        try { dataJson = JSON.parse(dataRaw); } catch {}

        if (event === 'response.output_text.delta') {
          const delta = (dataJson && (dataJson.delta ?? dataJson.text)) || '';
          if (typeof delta === 'string' && delta.length) {
            accumulatedDelta += delta;
            fullText += delta;
            
            // Try to parse UI events from accumulated text
            const { events, remainingText } = parseUIEvents(accumulatedDelta);
            
            for (const uiEvent of events) {
              // Avoid duplicate events
              const eventKey = `${uiEvent.type}-${JSON.stringify(uiEvent.payload)}`;
              if (!eventsEmitted.has(eventKey)) {
                eventsEmitted.add(eventKey);
                
                // Handle speaker change
                if (uiEvent.type === UI_EVENTS.SPEAKER_CHANGE) {
                  speaker = uiEvent.payload.speaker;
                  emitUIEvent(UI_EVENTS.SPEAKER_CHANGE, uiEvent.payload);
                }
                // Handle mode activation
                else if (uiEvent.type === UI_EVENTS.MODE_ACTIVATE || uiEvent.type === UI_EVENTS.MODE_DEACTIVATE) {
                  emitUIEvent(uiEvent.type, uiEvent.payload);
                }
                // Handle deliverables
                else if (uiEvent.type.startsWith('deliverable.')) {
                  emitUIEvent(uiEvent.type, uiEvent.payload);
                }
                // Handle confirmation gates
                else if (uiEvent.type === UI_EVENTS.CONFIRM_REQUIRED) {
                  emitUIEvent(UI_EVENTS.CONFIRM_REQUIRED, uiEvent.payload);
                }
              }
            }
            
            // Emit text delta with remaining text (minus parsed events)
            if (remainingText) {
              emitUIEvent(UI_EVENTS.TEXT_DELTA, { 
                delta: remainingText.slice(-delta.length), 
                fullText: remainingText,
                messageId: conversationId 
              });
            }
          }
        }
      }

      if (buf.includes('data: [DONE]')) break;
    }

    // Final parsing of any remaining events
    const { events: finalEvents, remainingText: finalText } = parseUIEvents(fullText);
    for (const uiEvent of finalEvents) {
      const eventKey = `${uiEvent.type}-${JSON.stringify(uiEvent.payload)}`;
      if (!eventsEmitted.has(eventKey)) {
        eventsEmitted.add(eventKey);
        emitUIEvent(uiEvent.type, uiEvent.payload);
      }
    }

    // Fallback speaker detection (legacy compatibility)
    if (!speaker) {
      const legacyParsed = parseLegacySpeakerTag(finalText || fullText);
      speaker = legacyParsed.speaker || requestedPersona;
      if (legacyParsed.speaker) {
        emitUIEvent(UI_EVENTS.SPEAKER_CHANGE, { speaker, messageId: conversationId });
      }
    }

    // Persist assistant message
    {
      const tsMs = Date.now();
      const textToStore = finalText || fullText;
      const mid = stableId(conversationId, 'assistant', tsMs, speaker, textToStore);
      dbCtx.upsertConv.run(conversationId, tsMs, tsMs, speaker);
      dbCtx.insertMsg.run(mid, conversationId, tsMs, 'assistant', speaker, textToStore);
    }

    // Send final events
    emitUIEvent(UI_EVENTS.TEXT_DONE, { 
      fullText: finalText || fullText, 
      messageId: conversationId, 
      speaker 
    });
    
    sseWrite(reply.raw, UI_EVENTS.DONE, { 
      ok: true, 
      conversationId, 
      speaker,
      contract: 'v1.0'
    });
    
    reply.raw.end();
  } catch (e) {
    sseWrite(reply.raw, UI_EVENTS.ERROR, { ok: false, error: String(e) });
    try { sseWrite(reply.raw, UI_EVENTS.DONE, { ok: false }); } catch {}
    try { reply.raw.end(); } catch {}
  } finally {
    reply.raw.off('close', onClose);
  }
});

// v2: Non-streaming with structured response
fastify.post('/v1/chat/turn', async (req, reply) => {
  const body = req.body || {};
  const conversationId = body.conversationId ? String(body.conversationId) : `${Date.now()}`;
  const requestedPersona = body.persona && PERSONAS[body.persona] && body.persona !== 'executor' ? body.persona : 'both';
  const persona = 'executor';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cvData = body.cvData && typeof body.cvData === 'object' ? body.cvData : {};

  // Persist the last user message
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') {
    const tsMs = toTsMs(last.timestamp);
    const mid = stableId(conversationId, 'user', tsMs, last.content);
    dbCtx.upsertConv.run(conversationId, tsMs, tsMs, requestedPersona);
    dbCtx.insertMsg.run(mid, conversationId, tsMs, 'user', null, String(last.content || ''));
  }

  const system = PERSONAS[persona];

  const chat = messages
    .slice(-30)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content || ''}`)
    .join('\n\n');

  const input = `CONVERSATION:\n${chat}`;

  const token = await getGatewayToken();
  if (!token) return reply.code(500).send({ ok: false, error: 'Missing OpenClaw gateway token on server' });

  const r = await fetch(OPENCLAW_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: process.env.LIFE_OS_MODEL || 'openai-codex/gpt-5.2',
      instructions: system,
      input,
      max_output_tokens: process.env.LIFE_OS_MAX_TOKENS ? Number(process.env.LIFE_OS_MAX_TOKENS) : 1200,
      user: 'antonio-mariana:web',
    }),
  });

  const rawText = await r.text();
  let json;
  try { json = JSON.parse(rawText); } catch { json = null; }
  if (!r.ok) {
    return reply.code(500).send({ ok: false, error: 'OpenClaw responses failed', detail: json || rawText.slice(0, 1200) });
  }

  const rawTextOut = extractOutputText(json) || '';
  
  // Parse UI contract events
  const { events, remainingText } = parseUIEvents(rawTextOut);
  
  // Fallback to legacy speaker tag
  let speaker = null;
  let cleanedText = remainingText;
  
  const legacyParsed = parseLegacySpeakerTag(rawTextOut);
  if (legacyParsed.speaker) {
    speaker = legacyParsed.speaker;
    cleanedText = legacyParsed.cleaned;
  }
  
  const effectiveSpeaker = speaker && speaker !== 'executor' ? speaker : requestedPersona;

  // Persist assistant message
  {
    const tsMs = Date.now();
    const mid = stableId(conversationId, 'assistant', tsMs, effectiveSpeaker, cleanedText);
    dbCtx.upsertConv.run(conversationId, tsMs, tsMs, effectiveSpeaker);
    dbCtx.insertMsg.run(mid, conversationId, tsMs, 'assistant', effectiveSpeaker, cleanedText);
  }

  // Build structured response
  const response = {
    ok: true,
    conversationId,
    contract: 'v1.0',
    speaker: effectiveSpeaker,
    text: cleanedText,
    events: events.length > 0 ? events : undefined,
    // Legacy compatibility
    legacy: {
      speaker: effectiveSpeaker,
      text: cleanedText,
    }
  };

  return response;
});

  return fastify;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fastify = await buildServer();
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`Life OS API v2.0 (UI Contract v1.0) running on http://${HOST}:${PORT}`);
}
