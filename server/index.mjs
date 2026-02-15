import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFile } from 'node:fs/promises';

import { initDb, stableId, toTsMs } from './db.mjs';
import { EVENT_VERSION, validateRealtimeEventEnvelope, mergeTranscriptEvents } from './realtime-events.mjs';

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

const SAFETY_POLICY_IDS = {
  EXTERNAL_SEND_CONFIRMATION: 'policy.external-send.confirmation',
  DEFAULT: 'policy.default.allow',
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

const fastify = Fastify({ logger: true });
await fastify.register(cors, { origin: true });

const dbCtx = await initDb(process.env.LIFE_OS_DB);

fastify.get('/health', async () => ({ 
  ok: true, 
  contract: 'v1.0',
  features: ['structured-events', 'legacy-compat', 'action-risk-tiers', 'approval-audit', 'realtime-event-validation', 'realtime-replay']
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
    executeOrchestrationAction: '/v1/orchestration/actions/execute (POST json)',
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
  [CALL_SESSION_STATUS.CREATED]: new Set([CALL_SESSION_STATUS.ACTIVE]),
  [CALL_SESSION_STATUS.ACTIVE]: new Set([CALL_SESSION_STATUS.ENDED, CALL_SESSION_STATUS.FAILED]),
  [CALL_SESSION_STATUS.ENDED]: new Set(),
  [CALL_SESSION_STATUS.FAILED]: new Set(),
};

function sendError(req, reply, statusCode, code, message, retryable = false) {
  return reply.code(statusCode).send({
    ok: false,
    code,
    message,
    retryable,
    requestId: req.id,
  });
}

function getAuthenticatedUserId(req, body = {}) {
  const headerUserId = req.headers['x-user-id'] ? String(req.headers['x-user-id']).trim() : '';
  const bodyUserId = body?.userId ? String(body.userId).trim() : '';

  if (!headerUserId) return { code: 'AUTH_REQUIRED', message: 'x-user-id header is required' };
  if (bodyUserId && bodyUserId !== headerUserId) {
    return { code: 'CROSS_USER_FORBIDDEN', message: 'userId in body must match authenticated x-user-id' };
  }

  return { userId: headerUserId };
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

function nowIso() {
  return new Date().toISOString();
}

function createPolicyDecision({ actionId, actionType, riskTier, userConfirmation, userId, metadata = {} }) {
  const normalizedActionType = String(actionType || '').toLowerCase();
  const isOutreachSendAction = normalizedActionType.includes('outreach') || normalizedActionType.includes('send');
  const isSensitive = riskTier === ACTION_RISK_TIERS.HIGH_RISK_EXTERNAL_SEND || isOutreachSendAction;

  if (isSensitive && userConfirmation !== true) {
    return {
      approved: false,
      eventType: 'safety.blocked',
      policyId: SAFETY_POLICY_IDS.EXTERNAL_SEND_CONFIRMATION,
      reason: 'explicit_user_confirmation_required',
      decision: 'blocked',
      audit: {
        actionId,
        actionType,
        riskTier,
        userId,
        metadata,
        userConfirmation: userConfirmation === true,
      },
    };
  }

  return {
    approved: true,
    eventType: 'safety.approved',
    policyId: isSensitive ? SAFETY_POLICY_IDS.EXTERNAL_SEND_CONFIRMATION : SAFETY_POLICY_IDS.DEFAULT,
    reason: isSensitive ? 'explicit_user_confirmation_received' : 'policy_pass_non_sensitive_action',
    decision: 'approved',
    audit: {
      actionId,
      actionType,
      riskTier,
      userId,
      metadata,
      userConfirmation: userConfirmation === true,
    },
  };
}

function executeOrchestrationAction({ actionType, payload }) {
  const resultRef = `result_${stableId(actionType, JSON.stringify(payload || {}), Date.now()).slice(0, 18)}`;
  return {
    ok: true,
    resultRef,
  };
}

const realtimeMetrics = {
  emitted: 0,
  emittedInvalid: 0,
  emittedDuplicate: 0,
};

function createRealtimeEvent({ sessionId, type, actor, payload, eventId, timestamp, version = EVENT_VERSION }) {
  const nowIso = new Date().toISOString();
  return {
    eventId: eventId || `evt_${stableId(sessionId, type, nowIso, Math.random()).slice(0, 20)}`,
    timestamp: timestamp || nowIso,
    sessionId,
    type,
    actor,
    payload,
    version,
  };
}

function publishRealtimeEvent(event) {
  const validation = validateRealtimeEventEnvelope(event);
  if (!validation.ok) {
    realtimeMetrics.emittedInvalid += 1;
    fastify.log.error({ event, errors: validation.errors }, 'realtime_event_validation_failed');
    throw new Error(`REALTIME_EVENT_VALIDATION_FAILED:${validation.errors.join(';')}`);
  }

  const inserted = dbCtx.insertRealtimeEvent.run(
    event.eventId,
    event.sessionId,
    event.timestamp,
    event.type,
    JSON.stringify(event.actor),
    JSON.stringify(event.payload),
    event.version,
    Date.now(),
  );

  if (!inserted?.changes) {
    realtimeMetrics.emittedDuplicate += 1;
    return { ok: true, deduped: true, event };
  }

  realtimeMetrics.emitted += 1;
  return { ok: true, deduped: false, event };
}

function normalizeRealtimeEventRow(row) {
  return {
    eventId: row.eventId,
    timestamp: row.timestamp,
    sessionId: row.sessionId,
    type: row.type,
    actor: JSON.parse(row.actorJson),
    payload: JSON.parse(row.payloadJson),
    version: row.version,
  };
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
    providerRoomId: row.providerRoomId,
    providerParticipantId: row.providerParticipantId,
    providerCallId: row.providerCallId,
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
  const auth = getAuthenticatedUserId(req, body);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);

  if (body.sessionId !== undefined && String(body.sessionId).trim() === '') {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId cannot be empty', false);
  }
  if (body.correlationId !== undefined && String(body.correlationId).trim() === '') {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'correlationId cannot be empty', false);
  }

  const createdAtMs = Date.now();
  const userId = auth.userId;
  const sessionId = body.sessionId ? String(body.sessionId) : `sess_${stableId(userId, createdAtMs, Math.random()).slice(0, 16)}`;
  const correlationId = body.correlationId ? String(body.correlationId) : `corr_${stableId(sessionId, createdAtMs).slice(0, 16)}`;
  const resumeToken = `resume_${stableId(sessionId, userId, createdAtMs).slice(0, 24)}`;
  const provider = body.provider ? String(body.provider) : 'livekit';
  const providerRoomId = body.providerRoomId ? String(body.providerRoomId) : null;
  const providerParticipantId = body.providerParticipantId ? String(body.providerParticipantId) : null;
  const providerCallId = body.providerCallId ? String(body.providerCallId) : null;
  const metadata = parseRequestMetadata(body.metadata);

  const created = dbCtx.insertCallSession.run(
    sessionId,
    userId,
    CALL_SESSION_STATUS.CREATED,
    correlationId,
    resumeToken,
    provider,
    providerRoomId,
    providerParticipantId,
    providerCallId,
    JSON.stringify(metadata),
    null,
    createdAtMs,
    createdAtMs,
    null,
    null,
    null,
  );

  if (!created?.changes) {
    return sendError(req, reply, 409, 'SESSION_EXISTS', 'Session already exists; retry without sessionId override', true);
  }

  const row = dbCtx.getCallSessionById.get(sessionId);
  if (!row) return sendError(req, reply, 500, 'SESSION_CREATE_FAILED', 'Failed to create call session', true);

  const session = normalizeCallSessionRow(row);
  publishRealtimeEvent(createRealtimeEvent({
    sessionId: session.sessionId,
    type: 'call.started',
    actor: { role: 'system', id: 'backend' },
    payload: {
      callId: session.sessionId,
      channel: 'voice',
      direction: 'outbound',
      provider: session.provider || 'livekit',
    },
  }));

  return {
    ok: true,
    session,
  };
});


fastify.get('/v1/call/sessions', async (req, reply) => {
  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  const userId = auth.userId;

  const limitRaw = req.query?.limit === undefined ? undefined : Number(req.query.limit);
  if (req.query?.limit !== undefined && !Number.isFinite(limitRaw)) {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'limit must be a number', false);
  }
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
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  const userId = auth.userId;

  const existing = dbCtx.getCallSessionById.get(sessionId);
  if (!existing) return sendError(req, reply, 404, 'SESSION_NOT_FOUND', 'Session not found', false);
  if (existing.userId !== userId) return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'Session does not belong to authenticated user', false);

  return {
    ok: true,
    session: normalizeCallSessionRow(existing),
  };
});

fastify.post('/v1/call/sessions/:sessionId/state', async (req, reply) => {
  const body = req.body || {};
  const auth = getAuthenticatedUserId(req, body);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);

  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const nextStatus = String(body.status || '').trim();
  if (!Object.values(CALL_SESSION_STATUS).includes(nextStatus)) {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'status must be one of created|active|ended|failed', false);
  }

  const existing = dbCtx.getCallSessionById.get(sessionId);
  if (!existing) return sendError(req, reply, 404, 'SESSION_NOT_FOUND', 'Session not found', false);
  if (existing.userId !== auth.userId) return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'Session does not belong to authenticated user', false);

  if (existing.status !== nextStatus && !CALL_SESSION_TRANSITIONS[existing.status]?.has(nextStatus)) {
    return sendError(req, reply, 409, 'INVALID_TRANSITION', `Invalid transition from ${existing.status} to ${nextStatus}`, false);
  }

  const isIdempotentReplay = existing.status === nextStatus;
  const requestedProvider = body.provider ? String(body.provider) : existing.provider;
  const requestedProviderRoomId = body.providerRoomId ? String(body.providerRoomId) : existing.providerRoomId;
  const requestedProviderParticipantId = body.providerParticipantId ? String(body.providerParticipantId) : existing.providerParticipantId;
  const requestedProviderCallId = body.providerCallId ? String(body.providerCallId) : existing.providerCallId;

  if (nextStatus === CALL_SESSION_STATUS.ACTIVE) {
    if (!requestedProviderRoomId || !requestedProviderParticipantId || !requestedProviderCallId) {
      return sendError(req, reply, 400, 'INVALID_REQUEST', 'active transition requires providerRoomId, providerParticipantId, and providerCallId', false);
    }
    if (existing.status === CALL_SESSION_STATUS.ACTIVE) {
      const mismatch = (
        (body.provider && existing.provider && existing.provider !== requestedProvider)
        || (body.providerRoomId && existing.providerRoomId && existing.providerRoomId !== requestedProviderRoomId)
        || (body.providerParticipantId && existing.providerParticipantId && existing.providerParticipantId !== requestedProviderParticipantId)
        || (body.providerCallId && existing.providerCallId && existing.providerCallId !== requestedProviderCallId)
      );
      if (mismatch) {
        return sendError(req, reply, 409, 'PROVIDER_CORRELATION_MISMATCH', 'provider correlation fields are immutable once activation has occurred', false);
      }
    }
  }

  const updateProvider = existing.startedAtMs ? existing.provider : requestedProvider;
  const updateProviderRoomId = existing.startedAtMs ? existing.providerRoomId : requestedProviderRoomId;
  const updateProviderParticipantId = existing.startedAtMs ? existing.providerParticipantId : requestedProviderParticipantId;
  const updateProviderCallId = existing.startedAtMs ? existing.providerCallId : requestedProviderCallId;

  const updatedAtMs = Date.now();
  const startedAtMs = nextStatus === CALL_SESSION_STATUS.ACTIVE ? (existing.startedAtMs || updatedAtMs) : existing.startedAtMs;
  const endedAtMs = nextStatus === CALL_SESSION_STATUS.ENDED ? (existing.endedAtMs || updatedAtMs) : existing.endedAtMs;
  const failedAtMs = nextStatus === CALL_SESSION_STATUS.FAILED ? (existing.failedAtMs || updatedAtMs) : existing.failedAtMs;
  const mergedMetadata = { ...parseStoredMetadata(existing.metadataJson), ...parseRequestMetadata(body.metadata) };
  const lastError = nextStatus === CALL_SESSION_STATUS.FAILED ? String(body.error || existing.lastError || 'call session failed') : existing.lastError;

  dbCtx.updateCallSession.run(
    nextStatus,
    updateProvider,
    updateProviderRoomId,
    updateProviderParticipantId,
    updateProviderCallId,
    JSON.stringify(mergedMetadata),
    lastError,
    updatedAtMs,
    startedAtMs,
    endedAtMs,
    failedAtMs,
    sessionId,
  );

  const row = dbCtx.getCallSessionById.get(sessionId);
  const session = normalizeCallSessionRow(row);

  if (nextStatus === CALL_SESSION_STATUS.ACTIVE) {
    publishRealtimeEvent(createRealtimeEvent({
      sessionId,
      type: 'call.connected',
      actor: { role: 'provider', id: session.provider || 'livekit' },
      payload: {
        callId: sessionId,
        connectedAt: new Date(startedAtMs).toISOString(),
        providerSessionId: session.providerCallId || undefined,
      },
    }));
  }

  if (nextStatus === CALL_SESSION_STATUS.ENDED) {
    const durationSeconds = session.startedAtMs ? Math.max(0, Math.floor((session.endedAtMs - session.startedAtMs) / 1000)) : 0;
    publishRealtimeEvent(createRealtimeEvent({
      sessionId,
      type: 'call.ended',
      actor: { role: 'system', id: 'backend' },
      payload: {
        callId: sessionId,
        endedAt: new Date(endedAtMs).toISOString(),
        durationSeconds,
        endReason: 'completed',
      },
    }));
  }

  if (nextStatus === CALL_SESSION_STATUS.FAILED) {
    publishRealtimeEvent(createRealtimeEvent({
      sessionId,
      type: 'call.error',
      actor: { role: 'system', id: 'backend' },
      payload: {
        callId: sessionId,
        code: 'CALL_SESSION_FAILED',
        message: session.lastError || 'call session failed',
        retryable: false,
      },
    }));
  }

  return {
    ok: true,
    idempotentReplay: isIdempotentReplay,
    session,
  };
});


fastify.post('/v1/realtime/events', async (req, reply) => {
  const body = req.body || {};
  const event = createRealtimeEvent({
    sessionId: String(body.sessionId || ''),
    type: String(body.type || ''),
    actor: body.actor,
    payload: body.payload,
    eventId: body.eventId ? String(body.eventId) : undefined,
    timestamp: body.timestamp ? String(body.timestamp) : undefined,
    version: body.version || EVENT_VERSION,
  });

  try {
    const result = publishRealtimeEvent(event);
    return { ok: true, deduped: result.deduped, event: result.event, metrics: realtimeMetrics };
  } catch (err) {
    return sendError(req, reply, 400, 'INVALID_REALTIME_EVENT', String(err.message || err), false);
  }
});

fastify.get('/v1/realtime/sessions/:sessionId/events', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const consumerId = req.query?.consumerId ? String(req.query.consumerId) : null;
  const afterTimestampInput = req.query?.afterTimestamp ? String(req.query.afterTimestamp) : null;
  const afterEventIdInput = req.query?.afterEventId ? String(req.query.afterEventId) : null;
  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;

  let watermarkTimestamp = afterTimestampInput || '';
  let watermarkEventId = afterEventIdInput || '';

  if (consumerId && !afterTimestampInput && !afterEventIdInput) {
    const cp = dbCtx.getRealtimeCheckpoint.get(sessionId, consumerId);
    if (cp) {
      watermarkTimestamp = cp.watermarkTimestamp;
      watermarkEventId = cp.watermarkEventId;
    }
  }

  const rows = dbCtx.listRealtimeEventsAfterWatermark.all(
    sessionId,
    watermarkTimestamp || '',
    watermarkTimestamp || '',
    watermarkEventId || '',
    limit,
  );

  const events = rows.map(normalizeRealtimeEventRow);
  const transcriptState = mergeTranscriptEvents(events);

  return {
    ok: true,
    sessionId,
    watermark: { timestamp: watermarkTimestamp || null, eventId: watermarkEventId || null },
    events,
    transcriptState,
  };
});

fastify.post('/v1/realtime/sessions/:sessionId/checkpoint', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const body = req.body || {};
  const consumerId = String(body.consumerId || '').trim();
  const watermarkTimestamp = String(body.watermarkTimestamp || '').trim();
  const watermarkEventId = String(body.watermarkEventId || '').trim();
  if (!consumerId || !watermarkTimestamp || !watermarkEventId) {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'consumerId, watermarkTimestamp, and watermarkEventId are required', false);
  }

  dbCtx.upsertRealtimeCheckpoint.run(sessionId, consumerId, watermarkTimestamp, watermarkEventId, Date.now());
  const checkpoint = dbCtx.getRealtimeCheckpoint.get(sessionId, consumerId);
  return { ok: true, checkpoint };
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

fastify.post('/v1/orchestration/actions/execute', async (req, reply) => {
  const body = req.body || {};
  const auth = getAuthenticatedUserId(req, body);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);

  const sessionId = String(body.sessionId || '').trim();
  const actionId = String(body.actionId || '').trim();
  const actionType = String(body.actionType || '').trim();
  const summary = String(body.summary || actionType || 'Execute orchestration action').trim();
  const riskTier = String(body.riskTier || ACTION_RISK_TIERS.LOW_RISK_WRITE);
  const userConfirmation = body.userConfirmation === true;
  const metadata = parseRequestMetadata(body.metadata);
  const actor = { role: 'system', id: auth.userId };

  if (!sessionId || !actionId || !actionType) {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId, actionId, and actionType are required', false);
  }

  const requestedEvent = createRealtimeEvent({
    sessionId,
    type: 'orchestration.action.requested',
    actor,
    payload: {
      actionId,
      actionType,
      summary,
      riskTier,
      metadata,
    },
    timestamp: nowIso(),
  });
  publishRealtimeEvent(requestedEvent);

  const decision = createPolicyDecision({
    actionId,
    actionType,
    riskTier,
    userConfirmation,
    userId: auth.userId,
    metadata,
  });

  const decisionTimestampMs = Date.now();
  const safetyEvent = createRealtimeEvent({
    sessionId,
    type: decision.eventType,
    actor,
    payload: {
      policyId: decision.policyId,
      reason: decision.reason,
      decision: decision.decision,
      actionId,
      actionType,
      riskTier,
      auditMetadata: {
        userId: auth.userId,
        decisionTimestampMs,
        metadata,
      },
    },
    timestamp: nowIso(),
  });
  publishRealtimeEvent(safetyEvent);

  const auditId = stableId(sessionId, actionId, decisionTimestampMs, decision.decision, decision.reason);
  dbCtx.insertActionAudit.run(
    auditId,
    actionId,
    body.conversationId ? String(body.conversationId) : null,
    toTsMs(body.callTimestamp),
    decisionTimestampMs,
    actionType,
    riskTier,
    decision.decision,
    decision.approved ? 'approved' : 'blocked',
    JSON.stringify({
      sessionId,
      policyId: decision.policyId,
      reason: decision.reason,
      userId: auth.userId,
      userConfirmation,
      metadata,
    }),
  );

  if (!decision.approved) {
    return reply.code(403).send({
      ok: false,
      blocked: true,
      code: 'SAFETY_BLOCKED',
      message: 'Action blocked by policy gate before execution',
      decision: {
        policyId: decision.policyId,
        reason: decision.reason,
        actionId,
      },
      events: {
        requested: requestedEvent,
        safety: safetyEvent,
      },
    });
  }

  const startedAtMs = Date.now();
  const execution = executeOrchestrationAction({ actionType, payload: body.payload });
  const durationMs = Math.max(0, Date.now() - startedAtMs);

  const executedEvent = createRealtimeEvent({
    sessionId,
    type: 'action.executed',
    actor,
    payload: {
      actionId,
      durationMs,
      resultRef: execution.resultRef,
    },
    timestamp: nowIso(),
  });
  publishRealtimeEvent(executedEvent);

  return {
    ok: true,
    blocked: false,
    actionId,
    actionType,
    result: execution,
    decision: {
      policyId: decision.policyId,
      decision: decision.decision,
      reason: decision.reason,
    },
    events: {
      requested: requestedEvent,
      safety: safetyEvent,
      executed: executedEvent,
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

fastify.listen({ port: PORT, host: HOST });
console.log(`Life OS API v2.0 (UI Contract v1.0) running on http://${HOST}:${PORT}`);
