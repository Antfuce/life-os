import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';

import { initDb, stableId, toTsMs } from './db.mjs';
import { EVENT_VERSION, validateRealtimeEventEnvelope, mergeTranscriptEvents } from './realtime-events.mjs';
import { createLiveKitTokenIssuer, extractLiveKitCorrelation, translateLiveKitEventToCanonical } from './livekit-bridge.mjs';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const HOST = process.env.HOST || '127.0.0.1';

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || null;
const OPENCLAW_RESPONSES_URL = process.env.OPENCLAW_RESPONSES_URL || 'http://127.0.0.1:18789/v1/responses';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || null;
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || null;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || null;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || null;
const BILLING_SIGNING_SECRET = process.env.BILLING_SIGNING_SECRET || OPENCLAW_GATEWAY_TOKEN || 'life-os-dev-billing-secret';
const BILLING_RECONCILIATION_ALERT_WEBHOOK_URL = process.env.BILLING_RECONCILIATION_ALERT_WEBHOOK_URL || null;

const liveKit = createLiveKitTokenIssuer({ apiKey: LIVEKIT_API_KEY, apiSecret: LIVEKIT_API_SECRET });

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

const DEFAULT_RECONNECT_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_TRANSCRIPT_SNAPSHOT_KEEP_LAST = 2000;
const DEFAULT_RECONCILIATION_LOOKBACK_HOURS = 1;
const DEFAULT_RECONCILIATION_LATENESS_MS = 5 * 60 * 1000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS ? Number(process.env.RATE_LIMIT_WINDOW_MS) : 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS ? Number(process.env.RATE_LIMIT_MAX_REQUESTS) : 300;
const RATE_LIMIT_EXEMPT_PATHS = new Set(['/health', '/health/ready', '/metrics']);
const SLO_BASELINE = {
  availabilityTarget: 0.995,
  p95ApiLatencyMs: 350,
  errorRateTarget: 0.01,
};

const runtimeObservability = {
  startedAtMs: Date.now(),
  requestsTotal: 0,
  errorsTotal: 0,
  rateLimitedTotal: 0,
  latencySamplesMs: [],
  routeStats: new Map(),
};

const rateLimitState = new Map();

function p95(values = []) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index];
}

function routePathFromRequest(req) {
  const raw = req?.routerPath || req?.routeOptions?.url || req?.url || '';
  const pathOnly = String(raw).split('?')[0] || '/';
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

function updateRouteStats(route, durationMs, statusCode) {
  const existing = runtimeObservability.routeStats.get(route) || {
    requests: 0,
    errors: 0,
    totalDurationMs: 0,
    latencySamplesMs: [],
  };

  existing.requests += 1;
  if (Number(statusCode || 0) >= 500) existing.errors += 1;
  existing.totalDurationMs += durationMs;
  existing.latencySamplesMs.push(durationMs);

  if (existing.latencySamplesMs.length > 500) existing.latencySamplesMs.shift();
  runtimeObservability.routeStats.set(route, existing);
}

function currentSloSnapshot() {
  const requestsTotal = runtimeObservability.requestsTotal;
  const errorsTotal = runtimeObservability.errorsTotal;
  const errorRate = requestsTotal > 0 ? errorsTotal / requestsTotal : 0;
  const availability = requestsTotal > 0 ? Math.max(0, 1 - errorRate) : 1;
  const p95ApiLatencyMs = p95(runtimeObservability.latencySamplesMs);

  return {
    baseline: SLO_BASELINE,
    measured: {
      requestsTotal,
      errorsTotal,
      errorRate,
      availability,
      p95ApiLatencyMs,
    },
    gate: {
      pass:
        availability >= SLO_BASELINE.availabilityTarget
        && errorRate <= SLO_BASELINE.errorRateTarget
        && p95ApiLatencyMs <= SLO_BASELINE.p95ApiLatencyMs,
    },
  };
}

function buildMetricsPayload() {
  const slo = currentSloSnapshot();
  const uptimeMs = Date.now() - runtimeObservability.startedAtMs;
  const routes = [];

  for (const [route, stats] of runtimeObservability.routeStats.entries()) {
    routes.push({
      route,
      requests: stats.requests,
      errors: stats.errors,
      avgLatencyMs: stats.requests > 0 ? stats.totalDurationMs / stats.requests : 0,
      p95LatencyMs: p95(stats.latencySamplesMs),
    });
  }

  return {
    uptimeMs,
    requestsTotal: runtimeObservability.requestsTotal,
    errorsTotal: runtimeObservability.errorsTotal,
    rateLimitedTotal: runtimeObservability.rateLimitedTotal,
    slo,
    routes,
    realtime: realtimeMetrics,
  };
}

function formatPrometheusMetrics(metrics) {
  const lines = [
    '# HELP lifeos_requests_total Total HTTP requests',
    '# TYPE lifeos_requests_total counter',
    `lifeos_requests_total ${metrics.requestsTotal}`,
    '# HELP lifeos_errors_total Total HTTP errors (5xx)',
    '# TYPE lifeos_errors_total counter',
    `lifeos_errors_total ${metrics.errorsTotal}`,
    '# HELP lifeos_rate_limited_total Total rate-limited requests',
    '# TYPE lifeos_rate_limited_total counter',
    `lifeos_rate_limited_total ${metrics.rateLimitedTotal}`,
    '# HELP lifeos_slo_availability_measured Current measured availability',
    '# TYPE lifeos_slo_availability_measured gauge',
    `lifeos_slo_availability_measured ${metrics.slo.measured.availability}`,
    '# HELP lifeos_slo_error_rate_measured Current measured error rate',
    '# TYPE lifeos_slo_error_rate_measured gauge',
    `lifeos_slo_error_rate_measured ${metrics.slo.measured.errorRate}`,
    '# HELP lifeos_slo_p95_latency_ms_measured Current measured p95 latency in ms',
    '# TYPE lifeos_slo_p95_latency_ms_measured gauge',
    `lifeos_slo_p95_latency_ms_measured ${metrics.slo.measured.p95ApiLatencyMs}`,
  ];

  return `${lines.join('\n')}\n`;
}

fastify.addHook('onRequest', async (req, reply) => {
  const now = Date.now();
  const traceIdHeader = req.headers['x-trace-id'] ? String(req.headers['x-trace-id']).trim() : '';
  const traceId = traceIdHeader || `trace_${stableId(req.id, now, Math.random()).slice(0, 16)}`;
  req.traceId = traceId;
  req.requestStartMs = now;

  reply.header('x-trace-id', traceId);
  reply.header('x-content-type-options', 'nosniff');
  reply.header('x-frame-options', 'DENY');
  reply.header('referrer-policy', 'no-referrer');

  const routePath = routePathFromRequest(req);
  const isInternal = OPENCLAW_GATEWAY_TOKEN && String(req.headers['x-gateway-token'] || '') === OPENCLAW_GATEWAY_TOKEN;
  if (isInternal || RATE_LIMIT_EXEMPT_PATHS.has(routePath)) return;

  const key = `${req.ip || 'unknown'}:${routePath}`;
  const state = rateLimitState.get(key);
  if (!state || now >= state.resetAtMs) {
    rateLimitState.set(key, {
      count: 1,
      resetAtMs: now + DEFAULT_RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  state.count += 1;
  if (state.count > DEFAULT_RATE_LIMIT_MAX_REQUESTS) {
    runtimeObservability.rateLimitedTotal += 1;
    const retryAfterSec = Math.max(1, Math.ceil((state.resetAtMs - now) / 1000));
    reply.header('retry-after', String(retryAfterSec));
    return sendError(req, reply, 429, 'RATE_LIMITED', 'Too many requests; retry later', true);
  }
});

fastify.addHook('onResponse', async (req, reply) => {
  const finishedAtMs = Date.now();
  const startedAtMs = Number(req.requestStartMs || finishedAtMs);
  const durationMs = Math.max(0, finishedAtMs - startedAtMs);
  const route = routePathFromRequest(req);
  const statusCode = Number(reply.statusCode || 0);

  runtimeObservability.requestsTotal += 1;
  if (statusCode >= 500) runtimeObservability.errorsTotal += 1;
  runtimeObservability.latencySamplesMs.push(durationMs);
  if (runtimeObservability.latencySamplesMs.length > 2000) runtimeObservability.latencySamplesMs.shift();
  updateRouteStats(route, durationMs, statusCode);

  fastify.log.info({
    event: 'http.request.completed',
    traceId: req.traceId,
    method: req.method,
    route,
    statusCode,
    durationMs,
  });
});

fastify.get('/health', async () => ({
  ok: true,
  contract: 'v1.0',
  uptimeMs: Date.now() - runtimeObservability.startedAtMs,
  slo: currentSloSnapshot(),
  features: ['structured-events', 'legacy-compat', 'action-risk-tiers', 'approval-audit', 'realtime-event-validation', 'realtime-replay', 'session-resume-token', 'session-sequence-watermark', 'usage-metering', 'billing-events', 'dead-letter-routing', 'billing-reconciliation-scaffold', 'observability-baseline', 'rate-limit-baseline', 'data-governance-controls', 'tenant-operator-controls']
}));

fastify.get('/health/ready', async (req, reply) => {
  try {
    const ping = dbCtx.db.prepare('SELECT 1 AS ok').get();
    if (!ping || Number(ping.ok) !== 1) {
      return sendError(req, reply, 503, 'READINESS_FAILED', 'database readiness probe failed', true);
    }

    return {
      ok: true,
      ready: true,
      checks: {
        database: 'ok',
      },
      sloGate: currentSloSnapshot().gate,
    };
  } catch (err) {
    req.log.error({ err }, 'health_ready_probe_failed');
    return sendError(req, reply, 503, 'READINESS_FAILED', 'database readiness probe failed', true);
  }
});

fastify.get('/metrics', async (req, reply) => {
  const format = String(req.query?.format || '').toLowerCase();
  const metrics = buildMetricsPayload();

  if (format === 'prom' || format === 'prometheus') {
    reply.type('text/plain; version=0.0.4');
    return formatPrometheusMetrics(metrics);
  }

  return {
    ok: true,
    metrics,
  };
});

fastify.get('/', async () => ({
  ok: true,
  service: 'antonio-mariana-api',
  contract: 'v1.0',
  endpoints: {
    health: '/health',
    healthReady: '/health/ready',
    metrics: '/metrics?format=json|prom',
    chatTurn: '/v1/chat/turn (POST json)',
    chatStream: '/v1/chat/stream (POST SSE)',
    createCallSession: '/v1/call/sessions (POST json)',
    listCallSessions: '/v1/call/sessions (GET with x-user-id header)',
    getCallSession: '/v1/call/sessions/:sessionId (GET)',
    updateCallSession: '/v1/call/sessions/:sessionId/state (POST json)',
    issueLiveKitToken: '/v1/call/sessions/:sessionId/livekit/token (POST json)',
    ingestLiveKitEvent: '/v1/call/livekit/events (POST json)',
    reconnectCallSession: '/v1/call/sessions/:sessionId/reconnect (POST json)',
    listTranscriptSnapshots: '/v1/realtime/sessions/:sessionId/transcript-snapshots (GET)',
    compactTranscriptSnapshots: '/v1/realtime/sessions/:sessionId/transcript-snapshots/compact (POST json)',
    listUsageMeterRecords: '/v1/billing/sessions/:sessionId/usage-records (GET)',
    listBillingUsageEvents: '/v1/billing/sessions/:sessionId/events (GET)',
    listBillingDeadLetters: '/v1/billing/sessions/:sessionId/dead-letters (GET)',
    listBillingAccountDeadLetters: '/v1/billing/accounts/:accountId/dead-letters (GET)',
    summarizeBillingAccountUsage: '/v1/billing/accounts/:accountId/usage-summary (GET)',
    billingTraceability: '/v1/billing/accounts/:accountId/traceability (GET)',
    governanceDataMap: '/v1/governance/accounts/:accountId/data-map (GET)',
    governanceDeleteAccountData: '/v1/governance/accounts/:accountId/delete (POST json)',
    governanceAudit: '/v1/governance/accounts/:accountId/audit (GET)',
    listTenantConfigs: '/v1/operator/tenants (GET internal)',
    getTenantConfig: '/v1/operator/tenants/:accountId/config (GET internal)',
    upsertTenantConfig: '/v1/operator/tenants/:accountId/config (POST internal)',
    listBillingReconciliationRuns: '/v1/billing/accounts/:accountId/reconciliation/runs (GET)',
    runBillingReconciliation: '/v1/billing/reconciliation/run (POST json)',
    triggerHourlyReconciliation: '/v1/billing/reconciliation/hourly-trigger (POST internal)',
    deliverReconciliationAlerts: '/v1/billing/reconciliation/alerts/deliver (POST internal)',
    getBillingReconciliationRun: '/v1/billing/reconciliation/runs/:runId (GET)',
    createBillingAdjustment: '/v1/billing/adjustments (POST json)',
    executeOrchestrationAction: '/v1/orchestration/actions/execute (POST json)',
    actionDecision: '/v1/actions/decision (POST json)',
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
    traceId: req.traceId || null,
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

function getInternalGatewayAuth(req) {
  const token = req.headers['x-gateway-token'] ? String(req.headers['x-gateway-token']).trim() : '';
  if (!OPENCLAW_GATEWAY_TOKEN) {
    return { code: 'INTERNAL_AUTH_UNCONFIGURED', message: 'gateway token is not configured on backend' };
  }
  if (!token || token !== OPENCLAW_GATEWAY_TOKEN) {
    return { code: 'AUTH_REQUIRED', message: 'valid x-gateway-token header is required' };
  }
  return { ok: true };
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

const SUPPORTED_ORCHESTRATION_ACTIONS = new Set([
  'cv.generate',
  'cv.edit',
  'interview.generate',
  'interview.practice',
  'outreach.generate',
  'outreach.edit',
  'outreach.requestSend',
]);

function executeOrchestrationAction({ sessionId, actionId, actionType, payload }) {
  if (!SUPPORTED_ORCHESTRATION_ACTIONS.has(actionType)) {
    const err = new Error(`unsupported actionType: ${actionType}`);
    err.code = 'UNSUPPORTED_ACTION_TYPE';
    err.retryable = false;
    err.statusCode = 422;
    throw err;
  }

  const payloadFingerprint = stableId(JSON.stringify(payload || {})).slice(0, 12);
  const resultRef = `result_${stableId(sessionId, actionId, actionType, payloadFingerprint).slice(0, 18)}`;

  return {
    ok: true,
    resultRef,
    actionType,
  };
}

const realtimeMetrics = {
  emitted: 0,
  emittedInvalid: 0,
  emittedDuplicate: 0,
};

function toBase64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signHs256(payload, secret) {
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signedInput = `${headerB64}.${payloadB64}`;
  const signature = createHmac('sha256', secret).update(signedInput).digest('base64url');
  return `${signedInput}.${signature}`;
}

function createLiveKitAccess(session, userId) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_WS_URL) return null;
  if ((session.provider || 'livekit') !== 'livekit') return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const room = session.providerRoomId || `lk_room_${session.sessionId}`;
  const identity = session.providerParticipantId || `lk_part_${stableId(session.sessionId, userId).slice(0, 16)}`;

  return {
    provider: 'livekit',
    wsUrl: LIVEKIT_WS_URL,
    room,
    identity,
    token: signHs256({
      iss: LIVEKIT_API_KEY,
      sub: identity,
      nbf: nowSec - 5,
      exp: nowSec + 60 * 10,
      video: {
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      },
      metadata: JSON.stringify({ sessionId: session.sessionId, userId }),
    }, LIVEKIT_API_SECRET),
  };
}

function normalizeIncomingRealtimeEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;

  const normalized = { ...input };
  if (!normalized.ts && normalized.timestamp) normalized.ts = normalized.timestamp;
  if (!normalized.schemaVersion && normalized.version) normalized.schemaVersion = normalized.version;

  delete normalized.timestamp;
  delete normalized.version;
  delete normalized.actor;

  return normalized;
}

function createRealtimeEvent({ sessionId, type, payload, eventId, ts, schemaVersion = EVENT_VERSION }) {
  const nowIso = new Date().toISOString();
  return {
    eventId: eventId || `evt_${stableId(sessionId, type, nowIso, Math.random()).slice(0, 20)}`,
    sessionId,
    ts: ts || nowIso,
    type,
    payload,
    schemaVersion,
  };
}

function publishRealtimeEvent(event) {
  const validation = validateRealtimeEventEnvelope(event);
  if (!validation.ok) {
    realtimeMetrics.emittedInvalid += 1;
    fastify.log.error({ event, errors: validation.errors }, 'realtime_event_validation_failed');
    throw new Error(`REALTIME_EVENT_VALIDATION_FAILED:${validation.errors.join(';')}`);
  }

  const nextSequence = Number(event.sequence) > 0
    ? Math.trunc(Number(event.sequence))
    : Number(dbCtx.getRealtimeSessionMaxSequence.get(event.sessionId)?.maxSequence || 0) + 1;

  const inserted = dbCtx.insertRealtimeEvent.run(
    event.eventId,
    event.sessionId,
    nextSequence,
    event.ts,
    event.type,
    JSON.stringify({}),
    JSON.stringify(event.payload),
    event.schemaVersion,
    Date.now(),
  );

  if (!inserted?.changes) {
    realtimeMetrics.emittedDuplicate += 1;
    return { ok: true, deduped: true, event };
  }

  const persistedEvent = { ...event, sequence: nextSequence };
  if (persistedEvent.type.startsWith('transcript.')) {
    const payload = persistedEvent.payload && typeof persistedEvent.payload === 'object' ? persistedEvent.payload : {};
    const utteranceId = payload.utteranceId ? String(payload.utteranceId).trim() : '';

    if (utteranceId) {
      const snapshotId = `snap_${stableId(persistedEvent.sessionId, persistedEvent.eventId, nextSequence).slice(0, 24)}`;
      const speaker = payload.speaker ? String(payload.speaker) : null;
      const text = payload.text ? String(payload.text) : null;
      const startMs = Number.isFinite(Number(payload.startMs)) ? Math.max(0, Math.trunc(Number(payload.startMs))) : null;
      const endMs = Number.isFinite(Number(payload.endMs)) ? Math.max(0, Math.trunc(Number(payload.endMs))) : null;

      dbCtx.insertTranscriptSnapshot.run(
        snapshotId,
        persistedEvent.sessionId,
        utteranceId,
        persistedEvent.eventId,
        nextSequence,
        persistedEvent.ts,
        persistedEvent.type,
        speaker,
        text,
        startMs,
        endMs,
        JSON.stringify(payload),
        Date.now(),
      );
    }
  }

  realtimeMetrics.emitted += 1;
  return { ok: true, deduped: false, event: persistedEvent };
}

function normalizeRealtimeEventRow(row) {
  return {
    eventId: row.eventId,
    sequence: row.sequence,
    timestamp: row.timestamp,
    sessionId: row.sessionId,
    ts: row.timestamp,
    type: row.type,
    payload: JSON.parse(row.payloadJson),
    schemaVersion: row.version,
  };
}

function normalizeTranscriptSnapshotRow(row) {
  const payload = JSON.parse(row.payloadJson);
  return {
    snapshotId: row.snapshotId,
    sessionId: row.sessionId,
    utteranceId: row.utteranceId,
    eventId: row.eventId,
    sequence: row.sequence,
    timestamp: row.timestamp,
    ts: row.timestamp,
    type: row.type,
    speaker: row.speaker,
    text: row.text,
    startMs: row.startMs,
    endMs: row.endMs,
    payload,
    createdAtMs: row.createdAtMs,
  };
}

function normalizeUsageMeterRecordRow(row) {
  return {
    recordId: row.recordId,
    accountId: row.accountId,
    sessionId: row.sessionId,
    meterId: row.meterId,
    unit: row.unit,
    quantity: Number(row.quantity || 0),
    sourceEventId: row.sourceEventId,
    sourceSequence: row.sourceSequence,
    sourceTimestamp: row.sourceTimestamp,
    signature: row.signature || null,
    signatureVersion: row.signatureVersion || null,
    metadata: parseStoredMetadata(row.metadataJson),
    createdAtMs: row.createdAtMs,
  };
}

function normalizeBillingUsageEventRow(row) {
  return {
    billingEventId: row.billingEventId,
    usageRecordId: row.usageRecordId || null,
    accountId: row.accountId,
    sessionId: row.sessionId,
    eventType: row.eventType || 'billing.usage.recorded',
    meterId: row.meterId,
    unit: row.unit,
    quantity: Number(row.quantity || 0),
    payload: JSON.parse(row.payloadJson),
    createdAtMs: row.createdAtMs,
  };
}

function normalizeBillingDeadLetterRow(row) {
  return {
    deadLetterId: row.deadLetterId,
    accountId: row.accountId || null,
    sessionId: row.sessionId || null,
    eventType: row.eventType,
    eventId: row.eventId || null,
    code: row.code || null,
    message: row.message || null,
    payload: JSON.parse(row.payloadJson),
    createdAtMs: row.createdAtMs,
  };
}

function parseStoredJsonArray(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') return [];
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBillingReconciliationRunRow(row) {
  return {
    runId: row.runId,
    accountId: row.accountId,
    windowStartMs: Number(row.windowStartMs || 0),
    windowEndMs: Number(row.windowEndMs || 0),
    expectedSummary: parseStoredJsonArray(row.expectedSummaryJson),
    actualSummary: parseStoredJsonArray(row.actualSummaryJson),
    mismatchCount: Number(row.mismatchCount || 0),
    status: row.status,
    alertDispatched: Number(row.alertDispatched || 0) > 0,
    metadata: parseStoredMetadata(row.metadataJson),
    createdAtMs: Number(row.createdAtMs || 0),
  };
}

function normalizeBillingReconciliationMismatchRow(row) {
  return {
    mismatchId: row.mismatchId,
    runId: row.runId,
    accountId: row.accountId,
    meterId: row.meterId,
    unit: row.unit,
    expectedQuantity: Number(row.expectedQuantity || 0),
    actualQuantity: Number(row.actualQuantity || 0),
    deltaQuantity: Number(row.deltaQuantity || 0),
    severity: row.severity,
    payload: parseStoredMetadata(row.payloadJson),
    createdAtMs: Number(row.createdAtMs || 0),
  };
}

function normalizeBillingReconciliationAlertRow(row) {
  return {
    alertId: row.alertId,
    runId: row.runId,
    accountId: row.accountId,
    status: row.status,
    channel: row.channel,
    payload: parseStoredMetadata(row.payloadJson),
    createdAtMs: Number(row.createdAtMs || 0),
  };
}

function buildBillingUsagePayload({ usageRecordId, accountId, meterId, unit, quantity, sourceEventId, signature, signatureVersion }) {
  const payload = {
    usageRecordId,
    accountId,
    meterId,
    unit,
    quantity,
    sourceEventId,
    signature,
    signatureVersion,
  };

  if (unit === 'seconds') payload.billableSeconds = quantity;
  return payload;
}

function signMeterRecord({ accountId, sessionId, meterId, unit, quantity, sourceEventId, sourceSequence, sourceTimestamp }) {
  const canonical = [
    accountId,
    sessionId,
    meterId,
    unit,
    Number(quantity || 0),
    sourceEventId,
    sourceSequence ?? '',
    sourceTimestamp || '',
  ].join('|');
  return createHmac('sha256', BILLING_SIGNING_SECRET).update(canonical).digest('hex');
}

function emitBillingEventWithDeadLetter({ sessionId, accountId, eventType, eventId, payload, ts, forcePublishFailure = false }) {
  try {
    if (forcePublishFailure) throw new Error('forced_publish_failure_for_dead_letter_path');

    const billingEvent = createRealtimeEvent({
      sessionId,
      eventId,
      type: eventType,
      payload,
      ts,
    });

    const publishResult = publishRealtimeEvent(billingEvent);
    return {
      ok: true,
      published: true,
      deduped: publishResult.deduped,
      event: publishResult.event,
      deadLetterId: null,
    };
  } catch (err) {
    const deadLetterId = `dlq_${stableId(sessionId, eventType, eventId, Date.now()).slice(0, 24)}`;
    dbCtx.insertBillingDeadLetter.run(
      deadLetterId,
      accountId || null,
      sessionId || null,
      eventType,
      eventId || null,
      String(err?.code || 'BILLING_EVENT_PUBLISH_FAILED'),
      String(err?.message || 'billing event publish failed'),
      JSON.stringify(payload || {}),
      Date.now(),
    );

    return {
      ok: false,
      published: false,
      deduped: false,
      event: null,
      deadLetterId,
      code: String(err?.code || 'BILLING_EVENT_PUBLISH_FAILED'),
      message: String(err?.message || 'billing event publish failed'),
    };
  }
}

function recordUsageAndEmitBillingEvent({ accountId, sessionId, meterId, unit, quantity, sourceEvent, metadata = {}, forcePublishFailure = false }) {
  const normalizedAccountId = String(accountId || 'unknown').trim() || 'unknown';
  const numericQuantity = Number(quantity);
  const normalizedQuantity = Number.isFinite(numericQuantity) ? Math.max(0, Math.trunc(numericQuantity)) : 0;
  if (normalizedQuantity <= 0) {
    return { ok: true, skipped: true, reason: 'non_positive_quantity' };
  }

  const sourceEventId = sourceEvent?.eventId ? String(sourceEvent.eventId).trim() : '';
  if (!sourceEventId) {
    return { ok: false, skipped: true, reason: 'missing_source_event_id' };
  }

  const sourceSequenceRaw = sourceEvent?.sequence !== undefined ? Number(sourceEvent.sequence) : null;
  const sourceSequence = Number.isFinite(sourceSequenceRaw) ? Math.max(0, Math.trunc(sourceSequenceRaw)) : null;
  const sourceTimestamp = typeof sourceEvent?.ts === 'string'
    ? sourceEvent.ts
    : (typeof sourceEvent?.timestamp === 'string' ? sourceEvent.timestamp : null);

  const createdAtMs = Date.now();
  const recordId = `mrec_${stableId(normalizedAccountId, sessionId, meterId, unit, sourceEventId).slice(0, 24)}`;
  const signatureVersion = 'hs256.v1';
  const signature = signMeterRecord({
    accountId: normalizedAccountId,
    sessionId,
    meterId,
    unit,
    quantity: normalizedQuantity,
    sourceEventId,
    sourceSequence,
    sourceTimestamp,
  });

  const usageInsert = dbCtx.insertUsageMeterRecord.run(
    recordId,
    normalizedAccountId,
    sessionId,
    meterId,
    unit,
    normalizedQuantity,
    sourceEventId,
    sourceSequence,
    sourceTimestamp,
    signature,
    signatureVersion,
    JSON.stringify(metadata),
    createdAtMs,
  );

  const payload = buildBillingUsagePayload({
    usageRecordId: recordId,
    accountId: normalizedAccountId,
    meterId,
    unit,
    quantity: normalizedQuantity,
    sourceEventId,
    signature,
    signatureVersion,
  });

  const billingEventId = `evt_${stableId('billing.usage.recorded', recordId).slice(0, 20)}`;
  dbCtx.insertBillingUsageEvent.run(
    billingEventId,
    recordId,
    normalizedAccountId,
    sessionId,
    'billing.usage.recorded',
    meterId,
    unit,
    normalizedQuantity,
    JSON.stringify(payload),
    createdAtMs,
  );

  const emit = emitBillingEventWithDeadLetter({
    sessionId,
    accountId: normalizedAccountId,
    eventType: 'billing.usage.recorded',
    eventId: billingEventId,
    payload,
    ts: sourceTimestamp || new Date(createdAtMs).toISOString(),
    forcePublishFailure,
  });

  return {
    ok: true,
    usageDeduped: !usageInsert?.changes,
    billingDeduped: emit.deduped,
    billingPublished: emit.published,
    deadLetterId: emit.deadLetterId || null,
    usageRecordId: recordId,
    billingEventId,
  };
}

function parseReconciliationWindowInput(body = {}, nowMs = Date.now()) {
  const explicitStart = Number(body.windowStartMs);
  const explicitEnd = Number(body.windowEndMs);
  if (Number.isFinite(explicitStart) && Number.isFinite(explicitEnd)) {
    const windowStartMs = Math.max(0, Math.trunc(explicitStart));
    const windowEndMs = Math.max(0, Math.trunc(explicitEnd));
    if (windowEndMs <= windowStartMs) {
      return { ok: false, code: 'INVALID_RECONCILIATION_WINDOW', message: 'windowEndMs must be greater than windowStartMs' };
    }
    return {
      ok: true,
      windowStartMs,
      windowEndMs,
      lookbackHours: null,
      latenessMs: null,
      mode: 'explicit',
    };
  }

  const lookbackHoursRaw = Number(body.lookbackHours);
  const latenessMsRaw = Number(body.latenessMs);
  const lookbackHours = Number.isFinite(lookbackHoursRaw)
    ? Math.max(1, Math.min(168, Math.trunc(lookbackHoursRaw)))
    : DEFAULT_RECONCILIATION_LOOKBACK_HOURS;
  const latenessMs = Number.isFinite(latenessMsRaw)
    ? Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.trunc(latenessMsRaw)))
    : DEFAULT_RECONCILIATION_LATENESS_MS;

  const windowEndMs = Math.max(0, nowMs - latenessMs);
  const windowStartMs = Math.max(0, windowEndMs - (lookbackHours * 60 * 60 * 1000));
  if (windowEndMs <= windowStartMs) {
    return { ok: false, code: 'INVALID_RECONCILIATION_WINDOW', message: 'computed reconciliation window is empty' };
  }

  return {
    ok: true,
    windowStartMs,
    windowEndMs,
    lookbackHours,
    latenessMs,
    mode: 'derived',
  };
}

function summarizeRowsToMap(rows) {
  const summary = [];
  const map = new Map();

  for (const row of rows || []) {
    const meterId = String(row.meterId || '').trim();
    const unit = String(row.unit || '').trim();
    if (!meterId || !unit) continue;

    const totalQuantity = Number.isFinite(Number(row.totalQuantity)) ? Math.trunc(Number(row.totalQuantity)) : 0;
    const recordsCount = Number.isFinite(Number(row.recordsCount)) ? Math.max(0, Math.trunc(Number(row.recordsCount))) : 0;
    const key = `${meterId}::${unit}`;

    const normalized = { meterId, unit, totalQuantity, recordsCount };
    map.set(key, normalized);
    summary.push(normalized);
  }

  return { summary, map };
}

function runBillingReconciliationScaffold({ accountId, windowStartMs, windowEndMs, initiatedBy, reason, metadata = {} }) {
  const expectedRows = dbCtx.summarizeUsageByAccountWindow.all(accountId, windowStartMs, windowEndMs);
  const actualRows = dbCtx.summarizeBillingByAccountWindow.all(accountId, windowStartMs, windowEndMs);

  const expected = summarizeRowsToMap(expectedRows);
  const actual = summarizeRowsToMap(actualRows);
  const allKeys = new Set([...expected.map.keys(), ...actual.map.keys()]);

  const createdAtMs = Date.now();
  const runId = `recon_${stableId(accountId, windowStartMs, windowEndMs, createdAtMs).slice(0, 20)}`;

  const mismatches = [];
  for (const key of allKeys) {
    const expectedRow = expected.map.get(key) || null;
    const actualRow = actual.map.get(key) || null;
    const meterId = expectedRow?.meterId || actualRow?.meterId || 'unknown';
    const unit = expectedRow?.unit || actualRow?.unit || 'unknown';
    const expectedQuantity = Number(expectedRow?.totalQuantity || 0);
    const actualQuantity = Number(actualRow?.totalQuantity || 0);
    const deltaQuantity = actualQuantity - expectedQuantity;

    if (deltaQuantity === 0) continue;

    const severity = deltaQuantity > 0 ? 'over_charge' : 'under_charge';
    const mismatchId = `reconmm_${stableId(runId, meterId, unit).slice(0, 20)}`;
    const payload = {
      runId,
      meterId,
      unit,
      expectedQuantity,
      actualQuantity,
      deltaQuantity,
      severity,
      expectedRecordsCount: Number(expectedRow?.recordsCount || 0),
      actualRecordsCount: Number(actualRow?.recordsCount || 0),
    };

    dbCtx.insertBillingReconciliationMismatch.run(
      mismatchId,
      runId,
      accountId,
      meterId,
      unit,
      expectedQuantity,
      actualQuantity,
      deltaQuantity,
      severity,
      JSON.stringify(payload),
      createdAtMs,
    );

    mismatches.push({
      mismatchId,
      runId,
      accountId,
      meterId,
      unit,
      expectedQuantity,
      actualQuantity,
      deltaQuantity,
      severity,
      payload,
      createdAtMs,
    });
  }

  const mismatchCount = mismatches.length;
  const status = mismatchCount > 0 ? 'mismatch' : 'ok';

  let alert = null;
  if (mismatchCount > 0) {
    const alertId = `reconal_${stableId(runId, accountId, mismatchCount).slice(0, 20)}`;
    const payload = {
      runId,
      accountId,
      mismatchCount,
      windowStartMs,
      windowEndMs,
      reason: reason || null,
      initiatedBy,
      channel: 'hook.billing.reconciliation.v1',
    };

    dbCtx.insertBillingReconciliationAlert.run(
      alertId,
      runId,
      accountId,
      'pending',
      'hook.billing.reconciliation.v1',
      JSON.stringify(payload),
      createdAtMs,
    );

    alert = {
      alertId,
      runId,
      accountId,
      status: 'pending',
      channel: 'hook.billing.reconciliation.v1',
      payload,
      createdAtMs,
    };
  }

  const metadataPayload = {
    initiatedBy,
    reason: reason || null,
    ...metadata,
  };

  dbCtx.insertBillingReconciliationRun.run(
    runId,
    accountId,
    windowStartMs,
    windowEndMs,
    JSON.stringify(expected.summary),
    JSON.stringify(actual.summary),
    mismatchCount,
    status,
    alert ? 1 : 0,
    JSON.stringify(metadataPayload),
    createdAtMs,
  );

  writeGovernanceAuditLog({
    accountId,
    actorId: initiatedBy,
    eventType: 'billing.reconciliation.run',
    payload: {
      runId,
      windowStartMs,
      windowEndMs,
      mismatchCount,
      status,
      alertDispatched: Boolean(alert),
      metadata: metadataPayload,
    },
  });

  return {
    run: {
      runId,
      accountId,
      windowStartMs,
      windowEndMs,
      expectedSummary: expected.summary,
      actualSummary: actual.summary,
      mismatchCount,
      status,
      alertDispatched: Boolean(alert),
      metadata: {
        initiatedBy,
        reason: reason || null,
        ...metadata,
      },
      createdAtMs,
    },
    mismatches,
    alert,
  };
}

async function deliverReconciliationAlertRow(alertRow, { dryRun = false, forceFailure = false } = {}) {
  const alert = normalizeBillingReconciliationAlertRow(alertRow);
  const payload = {
    alertId: alert.alertId,
    runId: alert.runId,
    accountId: alert.accountId,
    channel: alert.channel,
    status: alert.status,
    createdAtMs: alert.createdAtMs,
    body: alert.payload,
  };

  if (dryRun) {
    dbCtx.updateBillingReconciliationAlertStatus.run('dry_run', alert.alertId);
    return {
      alertId: alert.alertId,
      status: 'dry_run',
      delivered: false,
      deadLetterId: null,
      payload,
    };
  }

  if (forceFailure) {
    throw new Error('forced_reconciliation_alert_delivery_failure');
  }

  if (!BILLING_RECONCILIATION_ALERT_WEBHOOK_URL) {
    dbCtx.updateBillingReconciliationAlertStatus.run('delivered_stub', alert.alertId);
    return {
      alertId: alert.alertId,
      status: 'delivered_stub',
      delivered: true,
      deadLetterId: null,
      payload,
    };
  }

  const resp = await fetch(BILLING_RECONCILIATION_ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const err = new Error(`alert webhook responded ${resp.status}: ${body.slice(0, 250)}`);
    err.code = 'ALERT_WEBHOOK_NON_OK';
    throw err;
  }

  dbCtx.updateBillingReconciliationAlertStatus.run('delivered', alert.alertId);
  return {
    alertId: alert.alertId,
    status: 'delivered',
    delivered: true,
    deadLetterId: null,
    payload,
  };
}

function parseStoredMetadata(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') return {};
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeGovernanceAuditLog({ accountId = null, actorId = null, eventType, payload = {} }) {
  const createdAtMs = Date.now();
  const auditId = `gov_${stableId(accountId || 'global', actorId || 'system', eventType, createdAtMs, Math.random()).slice(0, 20)}`;
  dbCtx.insertGovernanceAuditLog.run(
    auditId,
    accountId,
    actorId,
    eventType,
    JSON.stringify(payload),
    createdAtMs,
  );
  return {
    auditId,
    accountId,
    actorId,
    eventType,
    payload,
    createdAtMs,
  };
}

function buildDataGovernanceCounts(accountId) {
  return {
    callSessions: Number(dbCtx.countCallSessionsByUser.get(accountId)?.count || 0),
    realtimeEvents: Number(dbCtx.countRealtimeEventsByUser.get(accountId)?.count || 0),
    transcriptSnapshots: Number(dbCtx.countTranscriptSnapshotsByUser.get(accountId)?.count || 0),
    realtimeCheckpoints: Number(dbCtx.countRealtimeCheckpointsByUser.get(accountId)?.count || 0),
    usageMeterRecords: Number(dbCtx.countUsageMeterRecordsByAccount.get(accountId)?.count || 0),
    billingUsageEvents: Number(dbCtx.countBillingUsageEventsByAccount.get(accountId)?.count || 0),
    billingDeadLetters: Number(dbCtx.countBillingDeadLettersByAccount.get(accountId)?.count || 0),
    reconciliationRuns: Number(dbCtx.countBillingReconciliationRunsByAccount.get(accountId)?.count || 0),
    reconciliationMismatches: Number(dbCtx.countBillingReconciliationMismatchesByAccount.get(accountId)?.count || 0),
    reconciliationAlerts: Number(dbCtx.countBillingReconciliationAlertsByAccount.get(accountId)?.count || 0),
  };
}

function executeAccountDataDeletion(accountId) {
  const deletion = {
    realtimeCheckpoints: Number(dbCtx.deleteRealtimeCheckpointsByUser.run(accountId)?.changes || 0),
    transcriptSnapshots: Number(dbCtx.deleteTranscriptSnapshotsByUser.run(accountId)?.changes || 0),
    realtimeEvents: Number(dbCtx.deleteRealtimeEventsByUser.run(accountId)?.changes || 0),
    callSessions: Number(dbCtx.deleteCallSessionsByUser.run(accountId)?.changes || 0),
    usageMeterRecords: Number(dbCtx.deleteUsageMeterRecordsByAccount.run(accountId)?.changes || 0),
    billingUsageEvents: Number(dbCtx.deleteBillingUsageEventsByAccount.run(accountId)?.changes || 0),
    billingDeadLetters: Number(dbCtx.deleteBillingDeadLettersByAccount.run(accountId)?.changes || 0),
    reconciliationMismatches: Number(dbCtx.deleteBillingReconciliationMismatchesByAccount.run(accountId)?.changes || 0),
    reconciliationAlerts: Number(dbCtx.deleteBillingReconciliationAlertsByAccount.run(accountId)?.changes || 0),
    reconciliationRuns: Number(dbCtx.deleteBillingReconciliationRunsByAccount.run(accountId)?.changes || 0),
    tenantConfig: Number(dbCtx.deleteTenantConfigByAccountId.run(accountId)?.changes || 0),
  };

  return {
    ...deletion,
    totalDeleted: Object.values(deletion).reduce((sum, n) => sum + Number(n || 0), 0),
  };
}

function normalizeTenantConfigRow(row) {
  if (!row) return null;
  return {
    accountId: row.accountId,
    status: row.status,
    plan: row.plan,
    maxConcurrentCalls: Number(row.maxConcurrentCalls || 0),
    flags: parseStoredMetadata(row.flagsJson),
    metadata: parseStoredMetadata(row.metadataJson),
    createdAtMs: Number(row.createdAtMs || 0),
    updatedAtMs: Number(row.updatedAtMs || 0),
  };
}

function normalizeGovernanceAuditRow(row) {
  return {
    auditId: row.auditId,
    accountId: row.accountId || null,
    actorId: row.actorId || null,
    eventType: row.eventType,
    payload: parseStoredMetadata(row.payloadJson),
    createdAtMs: Number(row.createdAtMs || 0),
  };
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
    reconnectWindowMs: row.reconnectWindowMs,
    resumeValidUntilMs: row.resumeValidUntilMs,
    lastAckSequence: row.lastAckSequence,
    lastAckTimestamp: row.lastAckTimestamp,
    lastAckEventId: row.lastAckEventId,
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


function findCallSessionByProviderCorrelation({ providerCallId, providerRoomId, providerParticipantId }) {
  if (providerCallId) {
    const byCallId = dbCtx.getCallSessionByProviderCallId.get(providerCallId);
    if (byCallId) return byCallId;
  }
  if (providerRoomId && providerParticipantId) {
    const byRoomAndParticipant = dbCtx.getCallSessionByProviderRoomAndParticipant.get(providerRoomId, providerParticipantId);
    if (byRoomAndParticipant) return byRoomAndParticipant;
  }
  if (providerRoomId) {
    return dbCtx.getCallSessionByProviderRoomId.get(providerRoomId) || null;
  }
  return null;
}

function createLiveKitParticipantIdentity(sessionId, userId) {
  return `backend-${userId}-${stableId(sessionId, userId).slice(0, 10)}`;
}

function getLiveKitTokenTtlSeconds(input) {
  const raw = Number(input);
  if (!Number.isFinite(raw)) return 300;
  return Math.max(30, Math.min(3600, Math.trunc(raw)));
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
  const reconnectWindowMsRaw = body.reconnectWindowMs === undefined ? DEFAULT_RECONNECT_WINDOW_MS : Number(body.reconnectWindowMs);
  const reconnectWindowMs = Number.isFinite(reconnectWindowMsRaw) ? Math.max(10_000, Math.min(10 * 60 * 1000, Math.trunc(reconnectWindowMsRaw))) : DEFAULT_RECONNECT_WINDOW_MS;
  const resumeValidUntilMs = createdAtMs + reconnectWindowMs;
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
    reconnectWindowMs,
    resumeValidUntilMs,
    null,
    null,
    null,
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



fastify.post('/v1/call/sessions/:sessionId/livekit/token', async (req, reply) => {
  const body = req.body || {};
  const auth = getAuthenticatedUserId(req, body);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);

  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const existing = dbCtx.getCallSessionById.get(sessionId);
  if (!existing) return sendError(req, reply, 404, 'SESSION_NOT_FOUND', 'Session not found', false);
  if (existing.userId !== auth.userId) return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'Session does not belong to authenticated user', false);

  if (!liveKit.configured || !LIVEKIT_WS_URL) {
    return sendError(req, reply, 503, 'LIVEKIT_UNAVAILABLE', 'LiveKit credentials are not configured in backend', true);
  }

  const session = normalizeCallSessionRow(existing);
  const roomName = session.providerRoomId || `room_${session.sessionId}`;
  const participantIdentity = createLiveKitParticipantIdentity(session.sessionId, session.userId);
  const participantName = body.participantName ? String(body.participantName) : `${session.userId}`;
  const ttlSeconds = getLiveKitTokenTtlSeconds(body.ttlSeconds);
  const participantMetadata = {
    sessionId: session.sessionId,
    userId: session.userId,
    correlationId: session.correlationId,
    role: 'caller',
  };

  let token;
  try {
    token = await liveKit.mint({
      roomName,
      participantIdentity,
      participantName,
      metadata: participantMetadata,
      ttlSeconds,
    });
  } catch (err) {
    req.log.error({ err, sessionId }, 'livekit_token_mint_failed');
    return sendError(req, reply, 502, 'LIVEKIT_TOKEN_MINT_FAILED', 'Failed to mint LiveKit token', true);
  }

  const nowMs = Date.now();
  const mergedMetadata = {
    ...session.metadata,
    livekit: {
      ...(session.metadata?.livekit && typeof session.metadata.livekit === 'object' ? session.metadata.livekit : {}),
      wsUrl: LIVEKIT_WS_URL,
      roomName,
      participantIdentity,
      participantName,
      tokenIssuedAtMs: nowMs,
      tokenTtlSeconds: ttlSeconds,
    },
  };

  dbCtx.updateCallSession.run(
    session.status,
    session.resumeValidUntilMs || null,
    session.lastAckSequence || null,
    session.lastAckTimestamp || null,
    session.lastAckEventId || null,
    'livekit',
    roomName,
    session.providerParticipantId || participantIdentity,
    session.providerCallId || `${roomName}:${participantIdentity}`,
    JSON.stringify(mergedMetadata),
    session.lastError,
    nowMs,
    session.startedAtMs,
    session.endedAtMs,
    session.failedAtMs,
    session.sessionId,
  );

  const updatedRow = dbCtx.getCallSessionById.get(session.sessionId);

  return {
    ok: true,
    transport: {
      provider: 'livekit',
      wsUrl: LIVEKIT_WS_URL,
      roomName,
      participantIdentity,
      accessToken: token,
      expiresInSeconds: ttlSeconds,
      issuedAt: new Date(nowMs).toISOString(),
    },
    session: normalizeCallSessionRow(updatedRow),
  };
});

fastify.post('/v1/call/livekit/events', async (req, reply) => {
  const body = req.body || {};
  const correlation = extractLiveKitCorrelation(body);
  const requestedSessionId = body.sessionId ? String(body.sessionId) : correlation.sessionIdFromMetadata;

  const existing = requestedSessionId
    ? dbCtx.getCallSessionById.get(requestedSessionId)
    : findCallSessionByProviderCorrelation(correlation);

  if (!existing) {
    return sendError(req, reply, 404, 'SESSION_NOT_FOUND', 'No call session mapped for LiveKit event correlation', false);
  }

  const session = normalizeCallSessionRow(existing);
  const resolvedCorrelation = {
    providerRoomId: correlation.providerRoomId || session.providerRoomId,
    providerParticipantId: correlation.providerParticipantId || session.providerParticipantId,
    providerCallId: correlation.providerCallId || session.providerCallId,
  };

  const translatedEvents = translateLiveKitEventToCanonical(body, {
    sessionId: session.sessionId,
    ...resolvedCorrelation,
  });

  const published = [];
  for (const translated of translatedEvents) {
    try {
      const created = createRealtimeEvent({
        sessionId: session.sessionId,
        type: translated.type,
        actor: translated.actor,
        payload: translated.payload,
      });
      const result = publishRealtimeEvent(created);
      published.push({ type: translated.type, deduped: result.deduped, eventId: created.eventId });
    } catch (err) {
      req.log.error({ err, translated, sessionId: session.sessionId }, 'livekit_event_translation_failed');
      return sendError(req, reply, 400, 'INVALID_LIVEKIT_EVENT', `Failed translating ${translated.type}: ${String(err.message || err)}`, false);
    }
  }

  return {
    ok: true,
    sessionId: session.sessionId,
    translatedCount: translatedEvents.length,
    published,
    ignored: translatedEvents.length === 0,
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


fastify.post('/v1/call/sessions/:sessionId/reconnect', async (req, reply) => {
  const body = req.body || {};
  const auth = getAuthenticatedUserId(req, body);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);

  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const existing = dbCtx.getCallSessionById.get(sessionId);
  if (!existing) return sendError(req, reply, 404, 'SESSION_NOT_FOUND', 'Session not found', false);
  if (existing.userId !== auth.userId) return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'Session does not belong to authenticated user', false);

  const resumeToken = String(body.resumeToken || '').trim();
  if (!resumeToken) return sendError(req, reply, 400, 'INVALID_REQUEST', 'resumeToken is required', false);
  if (resumeToken !== existing.resumeToken) return sendError(req, reply, 403, 'INVALID_RESUME_TOKEN', 'resumeToken is invalid for this session', false);

  const nowMs = Date.now();
  if (existing.resumeValidUntilMs && nowMs > existing.resumeValidUntilMs) {
    return sendError(req, reply, 410, 'RECONNECT_WINDOW_EXPIRED', 'reconnect window expired for this session', false);
  }

  const requestedAckSequence = body.lastAckSequence !== undefined ? Number(body.lastAckSequence) : null;
  const ackSequence = Number.isFinite(requestedAckSequence)
    ? Math.max(0, Math.trunc(requestedAckSequence))
    : Math.max(0, Number(existing.lastAckSequence || 0));

  const limitRaw = body.limit !== undefined ? Number(body.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;
  const rows = dbCtx.listRealtimeEventsAfterSequence.all(sessionId, ackSequence, limit);
  const events = rows.map(normalizeRealtimeEventRow);
  const latestSequence = Number(dbCtx.getRealtimeSessionMaxSequence.get(sessionId)?.maxSequence || 0);

  return {
    ok: true,
    session: normalizeCallSessionRow(existing),
    replay: {
      fromSequence: ackSequence,
      latestSequence,
      events,
      transcriptState: mergeTranscriptEvents(events),
    },
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
  const requestedProvider = body.provider ? String(body.provider) : (existing.provider || 'livekit');
  const requestedProviderRoomId = body.providerRoomId
    ? String(body.providerRoomId)
    : (existing.providerRoomId || (requestedProvider === 'livekit' ? `lk_room_${sessionId}` : null));
  const requestedProviderParticipantId = body.providerParticipantId
    ? String(body.providerParticipantId)
    : (existing.providerParticipantId || `lk_part_${stableId(sessionId, auth.userId).slice(0, 16)}`);
  const requestedProviderCallId = body.providerCallId
    ? String(body.providerCallId)
    : (existing.providerCallId || `lk_call_${stableId(sessionId, Date.now(), auth.userId).slice(0, 16)}`);

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
  const reconnectWindowMs = existing.reconnectWindowMs || DEFAULT_RECONNECT_WINDOW_MS;
  const resumeValidUntilMs = nextStatus === CALL_SESSION_STATUS.ACTIVE
    ? (existing.resumeValidUntilMs || (updatedAtMs + reconnectWindowMs))
    : null;

  dbCtx.updateCallSession.run(
    nextStatus,
    resumeValidUntilMs,
    existing.lastAckSequence || null,
    existing.lastAckTimestamp || null,
    existing.lastAckEventId || null,
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
  const providerAuth = nextStatus === CALL_SESSION_STATUS.ACTIVE ? createLiveKitAccess(session, auth.userId) : null;

  if (nextStatus === CALL_SESSION_STATUS.ACTIVE) {
    publishRealtimeEvent(createRealtimeEvent({
      sessionId,
      eventId: `evt_${stableId(sessionId, 'call.connected').slice(0, 20)}`,
      type: 'call.connected',
      payload: {
        callId: sessionId,
        connectedAt: new Date(startedAtMs).toISOString(),
        providerSessionId: session.providerCallId || undefined,
      },
    }));
  }

  if (nextStatus === CALL_SESSION_STATUS.ENDED) {
    const durationSeconds = session.startedAtMs ? Math.max(0, Math.floor((session.endedAtMs - session.startedAtMs) / 1000)) : 0;
    const endedResult = publishRealtimeEvent(createRealtimeEvent({
      sessionId,
      eventId: `evt_${stableId(sessionId, 'call.ended').slice(0, 20)}`,
      type: 'call.ended',
      payload: {
        callId: sessionId,
        endedAt: new Date(endedAtMs).toISOString(),
        durationSeconds,
        endReason: 'completed',
      },
    }));

    try {
      recordUsageAndEmitBillingEvent({
        accountId: auth.userId,
        sessionId,
        meterId: 'call.duration.seconds',
        unit: 'seconds',
        quantity: durationSeconds,
        sourceEvent: endedResult.event,
        metadata: {
          source: 'call.ended',
          idempotentReplay: isIdempotentReplay,
        },
      });
    } catch (err) {
      req.log.error({ err, sessionId }, 'metering_call_duration_record_failed');
    }
  }

  if (nextStatus === CALL_SESSION_STATUS.FAILED) {
    publishRealtimeEvent(createRealtimeEvent({
      sessionId,
      eventId: `evt_${stableId(sessionId, 'call.error').slice(0, 20)}`,
      type: 'call.error',
      payload: {
        callId: sessionId,
        code: 'CALL_SESSION_FAILED',
        message: session.lastError || 'call session failed',
        retryable: false,
      },
    }));
    publishRealtimeEvent(createRealtimeEvent({
      sessionId,
      eventId: `evt_${stableId(sessionId, 'call.terminal_failure').slice(0, 20)}`,
      type: 'call.terminal_failure',
      actor: { role: 'system', id: 'backend' },
      payload: {
        callId: sessionId,
        failedAt: new Date(failedAtMs).toISOString(),
        code: 'CALL_SESSION_IRRECOVERABLE',
        message: session.lastError || 'call session failed',
      },
    }));
  }

  return {
    ok: true,
    idempotentReplay: isIdempotentReplay,
    session,
    providerAuth,
  };
});


fastify.post('/v1/realtime/events', async (req, reply) => {
  const rawBody = req.body || {};
  const allowedIncomingKeys = new Set([
    'eventId',
    'sessionId',
    'ts',
    'timestamp',
    'type',
    'payload',
    'schemaVersion',
    'version',
    'actor',
  ]);

  const unsupportedIncomingKeys = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
    ? Object.keys(rawBody).filter((key) => !allowedIncomingKeys.has(key))
    : [];

  if (unsupportedIncomingKeys.length > 0) {
    return sendError(
      req,
      reply,
      400,
      'INVALID_REALTIME_EVENT',
      `REALTIME_EVENT_VALIDATION_FAILED:unsupported envelope key(s): ${unsupportedIncomingKeys.join(',')}`,
      false,
    );
  }

  const body = normalizeIncomingRealtimeEvent(rawBody);
  const event = createRealtimeEvent({
    sessionId: body?.sessionId !== undefined ? String(body.sessionId) : '',
    type: body?.type !== undefined ? String(body.type) : '',
    payload: body?.payload,
    eventId: body?.eventId !== undefined ? String(body.eventId) : undefined,
    ts: body?.ts !== undefined ? String(body.ts) : undefined,
    schemaVersion: body?.schemaVersion || EVENT_VERSION,
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

  const existing = dbCtx.getCallSessionById.get(sessionId);

  const consumerId = req.query?.consumerId ? String(req.query.consumerId) : null;
  const afterTsInput = req.query?.afterTs ? String(req.query.afterTs) : null;
  const resumeToken = req.query?.resumeToken ? String(req.query.resumeToken) : null;
  const afterSequenceInput = req.query?.afterSequence !== undefined ? Number(req.query.afterSequence) : null;
  const afterTimestampInput = req.query?.afterTimestamp ? String(req.query.afterTimestamp) : null;

  const afterEventIdInput = req.query?.afterEventId ? String(req.query.afterEventId) : null;
  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;
  const snapshotLimitRaw = req.query?.snapshotLimit !== undefined ? Number(req.query.snapshotLimit) : DEFAULT_TRANSCRIPT_SNAPSHOT_KEEP_LAST;
  const snapshotLimit = Number.isFinite(snapshotLimitRaw)
    ? Math.max(1, Math.min(20_000, Math.trunc(snapshotLimitRaw)))
    : DEFAULT_TRANSCRIPT_SNAPSHOT_KEEP_LAST;
  const includeDiagnostics = String(req.query?.diagnostics || '').toLowerCase() === 'true' || String(req.query?.diagnostics || '') === '1';

  let watermarkTs = afterTsInput || '';

  const nowMs = Date.now();
  if (resumeToken) {
    if (!existing) return sendError(req, reply, 404, 'SESSION_NOT_FOUND', 'Session not found', false);
    if (resumeToken !== existing.resumeToken) {
      return sendError(req, reply, 403, 'INVALID_RESUME_TOKEN', 'resumeToken is invalid for this session', false);
    }
    if (existing.resumeValidUntilMs && nowMs > existing.resumeValidUntilMs) {
      return sendError(req, reply, 410, 'RECONNECT_WINDOW_EXPIRED', 'reconnect window expired for this session', false);
    }
  }

  let afterSequence = Number.isFinite(afterSequenceInput) ? Math.max(0, Math.trunc(afterSequenceInput)) : null;
  let watermarkTimestamp = afterTimestampInput || watermarkTs || '';
  let watermarkEventId = afterEventIdInput || '';

  if (afterSequence === null && consumerId) {
    const cp = dbCtx.getRealtimeCheckpoint.get(sessionId, consumerId);
    if (cp) {
      watermarkTs = cp.watermarkTimestamp;
      watermarkTimestamp = cp.watermarkTimestamp;
      watermarkEventId = cp.watermarkEventId;
    }
  }

  if (afterSequence === null && existing && existing.lastAckSequence !== null && existing.lastAckSequence !== undefined) {
    afterSequence = Math.max(afterSequence || 0, Number(existing.lastAckSequence) || 0);
  }

  const requestStartedAtMs = Date.now();

  const eventsQueryStartedAtMs = Date.now();
  let rows;
  if (afterSequence !== null) {
    rows = dbCtx.listRealtimeEventsAfterSequence.all(sessionId, afterSequence, limit);
  } else {
    rows = dbCtx.listRealtimeEventsAfterWatermark.all(
      sessionId,
      watermarkTimestamp || '',
      watermarkTimestamp || '',
      watermarkEventId || '',
      limit,
    );
  }
  const eventsQueryMs = Date.now() - eventsQueryStartedAtMs;

  const snapshotsQueryStartedAtMs = Date.now();
  const transcriptSnapshotRows = dbCtx.listTranscriptSnapshotsBySession.all(sessionId, snapshotLimit);
  const snapshotsQueryMs = Date.now() - snapshotsQueryStartedAtMs;

  const events = rows.map(normalizeRealtimeEventRow);
  const transcriptSnapshots = transcriptSnapshotRows.map(normalizeTranscriptSnapshotRow);
  const transcriptState = mergeTranscriptEvents(transcriptSnapshots);
  const latestSequence = Number(dbCtx.getRealtimeSessionMaxSequence.get(sessionId)?.maxSequence || 0);

  return {
    ok: true,
    sessionId,
    resume: {
      reconnectWindowMs: existing?.reconnectWindowMs || null,
      resumeValidUntilMs: existing?.resumeValidUntilMs || null,
      lastAckSequence: existing?.lastAckSequence || null,
      latestSequence,
    },
    watermark: { timestamp: watermarkTimestamp || null, eventId: watermarkEventId || null, sequence: afterSequence },
    events,
    transcriptState,
    transcriptSnapshotsCount: transcriptSnapshots.length,
    ...(includeDiagnostics
      ? {
          diagnostics: {
            eventsQueryMs,
            snapshotsQueryMs,
            totalQueryMs: Date.now() - requestStartedAtMs,
            snapshotLimit,
            snapshotRowsRead: transcriptSnapshotRows.length,
            eventsRowsRead: rows.length,
          },
        }
      : {}),
  };
});

fastify.get('/v1/realtime/sessions/:sessionId/transcript-snapshots', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const startedAtMs = Date.now();
  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, Math.trunc(limitRaw))) : 200;
  const afterSequenceRaw = req.query?.afterSequence !== undefined ? Number(req.query.afterSequence) : null;
  const afterSequence = Number.isFinite(afterSequenceRaw) ? Math.max(0, Math.trunc(afterSequenceRaw)) : null;
  const utteranceIdFilter = req.query?.utteranceId ? String(req.query.utteranceId).trim() : null;
  const includeStats = String(req.query?.includeStats || '').toLowerCase() === 'true' || String(req.query?.includeStats || '') === '1';

  const rows = afterSequence !== null
    ? dbCtx.listTranscriptSnapshotsBySessionAfterSequence.all(sessionId, afterSequence, limit)
    : dbCtx.listTranscriptSnapshotsBySession.all(sessionId, limit);

  const snapshots = rows
    .map(normalizeTranscriptSnapshotRow)
    .filter((row) => !utteranceIdFilter || row.utteranceId === utteranceIdFilter);

  const statsRow = includeStats ? dbCtx.getTranscriptSnapshotStatsBySession.get(sessionId) : null;

  return {
    ok: true,
    sessionId,
    count: snapshots.length,
    snapshots,
    retention: {
      keepLastDefault: DEFAULT_TRANSCRIPT_SNAPSHOT_KEEP_LAST,
    },
    ...(includeStats
      ? {
          stats: {
            count: Number(statsRow?.count || 0),
            minSequence: Number(statsRow?.minSequence || 0),
            maxSequence: Number(statsRow?.maxSequence || 0),
            minTimestamp: statsRow?.minTimestamp || null,
            maxTimestamp: statsRow?.maxTimestamp || null,
            payloadBytes: Number(statsRow?.payloadBytes || 0),
          },
          diagnostics: {
            queryMs: Date.now() - startedAtMs,
          },
        }
      : {}),
  };
});

fastify.post('/v1/realtime/sessions/:sessionId/transcript-snapshots/compact', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const body = req.body || {};
  const keepLastRaw = body.keepLast !== undefined ? Number(body.keepLast) : DEFAULT_TRANSCRIPT_SNAPSHOT_KEEP_LAST;
  const keepLast = Number.isFinite(keepLastRaw)
    ? Math.max(1, Math.min(20_000, Math.trunc(keepLastRaw)))
    : DEFAULT_TRANSCRIPT_SNAPSHOT_KEEP_LAST;

  const before = dbCtx.getTranscriptSnapshotStatsBySession.get(sessionId);
  const result = dbCtx.compactTranscriptSnapshotsBySessionKeepLast.run(sessionId, keepLast, sessionId);
  const after = dbCtx.getTranscriptSnapshotStatsBySession.get(sessionId);

  return {
    ok: true,
    sessionId,
    keepLast,
    deletedCount: Number(result?.changes || 0),
    before: {
      count: Number(before?.count || 0),
      minSequence: Number(before?.minSequence || 0),
      maxSequence: Number(before?.maxSequence || 0),
    },
    after: {
      count: Number(after?.count || 0),
      minSequence: Number(after?.minSequence || 0),
      maxSequence: Number(after?.maxSequence || 0),
    },
  };
});

fastify.get('/v1/billing/sessions/:sessionId/usage-records', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 500;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.trunc(limitRaw))) : 500;
  const meterIdFilter = req.query?.meterId ? String(req.query.meterId).trim() : null;

  const rows = meterIdFilter
    ? dbCtx.listUsageMeterRecordsBySessionAndMeter.all(sessionId, meterIdFilter, limit)
    : dbCtx.listUsageMeterRecordsBySession.all(sessionId, limit);

  const records = rows.map(normalizeUsageMeterRecordRow);
  const totalsByMeter = records.reduce((acc, row) => {
    const current = acc[row.meterId] || 0;
    acc[row.meterId] = current + Number(row.quantity || 0);
    return acc;
  }, {});

  return {
    ok: true,
    sessionId,
    count: records.length,
    records,
    totalsByMeter,
  };
});

fastify.get('/v1/billing/sessions/:sessionId/events', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 500;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.trunc(limitRaw))) : 500;
  const eventTypeFilter = req.query?.eventType ? String(req.query.eventType).trim() : null;

  const rows = dbCtx.listBillingUsageEventsBySession.all(sessionId, limit);
  const events = rows
    .map(normalizeBillingUsageEventRow)
    .filter((event) => !eventTypeFilter || event.eventType === eventTypeFilter);

  return {
    ok: true,
    sessionId,
    count: events.length,
    events,
  };
});

fastify.get('/v1/billing/sessions/:sessionId/dead-letters', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 500;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.trunc(limitRaw))) : 500;

  const rows = dbCtx.listBillingDeadLettersBySession.all(sessionId, limit);
  const deadLetters = rows.map(normalizeBillingDeadLetterRow);

  return {
    ok: true,
    sessionId,
    count: deadLetters.length,
    deadLetters,
  };
});

fastify.get('/v1/billing/accounts/:accountId/dead-letters', async (req, reply) => {
  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  if (auth.userId !== accountId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 500;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.trunc(limitRaw))) : 500;

  const rows = dbCtx.listBillingDeadLettersByAccount.all(accountId, limit);
  const deadLetters = rows.map(normalizeBillingDeadLetterRow);

  return {
    ok: true,
    accountId,
    count: deadLetters.length,
    deadLetters,
  };
});

fastify.get('/v1/billing/accounts/:accountId/usage-summary', async (req, reply) => {
  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  if (auth.userId !== accountId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 1000;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10000, Math.trunc(limitRaw))) : 1000;

  const records = dbCtx.listUsageMeterRecordsByAccount.all(accountId, limit).map(normalizeUsageMeterRecordRow);
  const summaryRows = dbCtx.summarizeUsageByAccount.all(accountId);
  const summary = summaryRows.map((row) => ({
    meterId: row.meterId,
    unit: row.unit,
    totalQuantity: Number(row.totalQuantity || 0),
    recordsCount: Number(row.recordsCount || 0),
  }));

  return {
    ok: true,
    accountId,
    recordsCount: records.length,
    summary,
    records,
  };
});

fastify.get('/v1/billing/accounts/:accountId/traceability', async (req, reply) => {
  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  if (auth.userId !== accountId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.trunc(limitRaw))) : 100;

  const usageRecords = dbCtx.listUsageMeterRecordsByAccount.all(accountId, limit).map(normalizeUsageMeterRecordRow);
  const billingEvents = dbCtx.listBillingUsageEventsByAccount.all(accountId, limit).map(normalizeBillingUsageEventRow);
  const reconciliationRuns = dbCtx.listBillingReconciliationRunsByAccount.all(accountId, limit).map(normalizeBillingReconciliationRunRow);

  const usageByRecordId = new Map();
  for (const usage of usageRecords) usageByRecordId.set(usage.recordId, usage);

  const traceLinks = billingEvents
    .filter((evt) => evt.usageRecordId)
    .map((evt) => ({
      billingEventId: evt.billingEventId,
      usageRecordId: evt.usageRecordId,
      meterId: evt.meterId,
      unit: evt.unit,
      quantity: evt.quantity,
      usageRecordFound: usageByRecordId.has(evt.usageRecordId),
    }));

  return {
    ok: true,
    accountId,
    usageRecords,
    billingEvents,
    reconciliationRuns,
    traceLinks,
  };
});

fastify.post('/v1/billing/adjustments', async (req, reply) => {
  const body = req.body || {};
  const auth = getAuthenticatedUserId(req, body);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);

  const accountId = String(body.accountId || auth.userId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);
  if (accountId !== auth.userId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const sessionId = String(body.sessionId || '').trim();
  const meterId = String(body.meterId || '').trim();
  const currency = String(body.currency || '').trim().toUpperCase();
  const amountRaw = Number(body.amount);

  if (!sessionId || !meterId || !currency || !Number.isFinite(amountRaw)) {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId, meterId, amount(number), and currency are required', false);
  }

  const amount = Number(amountRaw);
  const quantityMinor = Math.trunc(Math.round(amount * 100));
  const reason = body.reason ? String(body.reason) : null;
  const adjustmentId = body.adjustmentId
    ? String(body.adjustmentId)
    : `adj_${stableId(accountId, sessionId, meterId, amount, currency, Date.now()).slice(0, 16)}`;

  const payload = {
    adjustmentId,
    meterId,
    amount,
    currency,
    reason,
    accountId,
    sessionId,
    metadata: parseRequestMetadata(body.metadata),
  };

  const createdAtMs = Date.now();
  const billingEventId = `evt_${stableId('billing.adjustment.created', adjustmentId).slice(0, 20)}`;
  dbCtx.insertBillingUsageEvent.run(
    billingEventId,
    null,
    accountId,
    sessionId,
    'billing.adjustment.created',
    meterId,
    'currency_minor',
    quantityMinor,
    JSON.stringify(payload),
    createdAtMs,
  );

  const emit = emitBillingEventWithDeadLetter({
    sessionId,
    accountId,
    eventType: 'billing.adjustment.created',
    eventId: billingEventId,
    payload,
    ts: new Date(createdAtMs).toISOString(),
    forcePublishFailure: body.forcePublishFailure === true,
  });

  return {
    ok: true,
    accountId,
    sessionId,
    adjustmentId,
    billingEventId,
    published: emit.published,
    deduped: emit.deduped,
    deadLetterId: emit.deadLetterId,
  };
});

fastify.post('/v1/billing/reconciliation/run', async (req, reply) => {
  const body = req.body || {};
  const auth = getAuthenticatedUserId(req, body);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);

  const accountId = String(body.accountId || auth.userId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);
  if (accountId !== auth.userId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const window = parseReconciliationWindowInput(body);
  if (!window.ok) {
    return sendError(req, reply, 400, window.code || 'INVALID_REQUEST', window.message || 'invalid reconciliation window', false);
  }

  const reason = body.reason ? String(body.reason) : null;
  const reconciliation = runBillingReconciliationScaffold({
    accountId,
    windowStartMs: window.windowStartMs,
    windowEndMs: window.windowEndMs,
    initiatedBy: auth.userId,
    reason,
    metadata: {
      mode: window.mode,
      lookbackHours: window.lookbackHours,
      latenessMs: window.latenessMs,
    },
  });

  return {
    ok: true,
    accountId,
    window: {
      startMs: window.windowStartMs,
      endMs: window.windowEndMs,
      mode: window.mode,
      lookbackHours: window.lookbackHours,
      latenessMs: window.latenessMs,
    },
    run: reconciliation.run,
    mismatches: reconciliation.mismatches,
    alert: reconciliation.alert,
  };
});

fastify.post('/v1/billing/reconciliation/hourly-trigger', async (req, reply) => {
  const internal = getInternalGatewayAuth(req);
  if (internal.code) return sendError(req, reply, 401, internal.code, internal.message, false);

  const body = req.body || {};
  const limitAccountsRaw = Number(body.limitAccounts);
  const limitAccounts = Number.isFinite(limitAccountsRaw)
    ? Math.max(1, Math.min(5000, Math.trunc(limitAccountsRaw)))
    : 500;

  const window = parseReconciliationWindowInput({
    ...body,
    lookbackHours: body.lookbackHours !== undefined ? body.lookbackHours : 1,
  });
  if (!window.ok) {
    return sendError(req, reply, 400, window.code || 'INVALID_REQUEST', window.message || 'invalid reconciliation window', false);
  }

  const accountRows = dbCtx.listBillingReconciliationAccountsByWindow.all(
    window.windowStartMs,
    window.windowEndMs,
    window.windowStartMs,
    window.windowEndMs,
    limitAccounts,
  );

  const allowRerun = body.allowRerun === true;
  const processed = [];
  let createdRuns = 0;
  let skippedExistingRuns = 0;

  for (const row of accountRows) {
    const accountId = String(row.accountId || '').trim();
    if (!accountId) continue;

    const existingRun = dbCtx.findBillingReconciliationRunByAccountWindow.get(accountId, window.windowStartMs, window.windowEndMs);
    if (existingRun && !allowRerun) {
      skippedExistingRuns += 1;
      processed.push({ accountId, action: 'skipped_existing', runId: existingRun.runId });
      continue;
    }

    const reconciliation = runBillingReconciliationScaffold({
      accountId,
      windowStartMs: window.windowStartMs,
      windowEndMs: window.windowEndMs,
      initiatedBy: 'scheduler.hourly',
      reason: body.reason ? String(body.reason) : 'hourly_scheduler_trigger',
      metadata: {
        trigger: 'hourly-scheduler',
        mode: window.mode,
        lookbackHours: window.lookbackHours,
        latenessMs: window.latenessMs,
      },
    });

    createdRuns += 1;
    processed.push({
      accountId,
      action: 'created',
      runId: reconciliation.run.runId,
      status: reconciliation.run.status,
      mismatchCount: reconciliation.run.mismatchCount,
      alertDispatched: reconciliation.run.alertDispatched,
    });
  }

  return {
    ok: true,
    window: {
      startMs: window.windowStartMs,
      endMs: window.windowEndMs,
      mode: window.mode,
      lookbackHours: window.lookbackHours,
      latenessMs: window.latenessMs,
    },
    accountsConsidered: accountRows.length,
    createdRuns,
    skippedExistingRuns,
    processed,
  };
});

fastify.post('/v1/billing/reconciliation/alerts/deliver', async (req, reply) => {
  const internal = getInternalGatewayAuth(req);
  if (internal.code) return sendError(req, reply, 401, internal.code, internal.message, false);

  const body = req.body || {};
  const limitRaw = Number(body.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(5000, Math.trunc(limitRaw)))
    : 100;

  const dryRun = body.dryRun === true;
  const forceFailureIds = Array.isArray(body.forceFailureAlertIds)
    ? new Set(body.forceFailureAlertIds.map((id) => String(id)))
    : new Set();

  const pendingRows = dbCtx.listBillingReconciliationPendingAlerts.all(limit);
  const delivered = [];
  const failed = [];

  for (const row of pendingRows) {
    const alertId = String(row.alertId || '').trim();
    try {
      const result = await deliverReconciliationAlertRow(row, {
        dryRun,
        forceFailure: forceFailureIds.has(alertId),
      });
      delivered.push(result);
    } catch (err) {
      dbCtx.updateBillingReconciliationAlertStatus.run('failed', alertId);
      const deadLetterId = `dlq_${stableId('reconciliation.alert.delivery', alertId, Date.now()).slice(0, 24)}`;
      const payload = normalizeBillingReconciliationAlertRow(row);
      dbCtx.insertBillingDeadLetter.run(
        deadLetterId,
        payload.accountId || null,
        null,
        'billing.reconciliation.alert.delivery_failed',
        alertId || null,
        String(err?.code || 'ALERT_DELIVERY_FAILED'),
        String(err?.message || 'reconciliation alert delivery failed'),
        JSON.stringify(payload),
        Date.now(),
      );

      failed.push({
        alertId,
        code: String(err?.code || 'ALERT_DELIVERY_FAILED'),
        message: String(err?.message || 'reconciliation alert delivery failed'),
        deadLetterId,
      });
    }
  }

  return {
    ok: true,
    pendingCount: pendingRows.length,
    deliveredCount: delivered.length,
    failedCount: failed.length,
    dryRun,
    delivered,
    failed,
  };
});

fastify.get('/v1/billing/accounts/:accountId/reconciliation/runs', async (req, reply) => {
  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  if (auth.userId !== accountId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, Math.trunc(limitRaw))) : 100;

  const runs = dbCtx.listBillingReconciliationRunsByAccount
    .all(accountId, limit)
    .map(normalizeBillingReconciliationRunRow);

  const alerts = dbCtx.listBillingReconciliationAlertsByAccount
    .all(accountId, limit)
    .map(normalizeBillingReconciliationAlertRow);

  return {
    ok: true,
    accountId,
    count: runs.length,
    runs,
    alerts,
  };
});

fastify.get('/v1/billing/reconciliation/runs/:runId', async (req, reply) => {
  const runId = String(req.params?.runId || '').trim();
  if (!runId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'runId is required', false);

  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);

  const runRow = dbCtx.getBillingReconciliationRunById.get(runId);
  if (!runRow) return sendError(req, reply, 404, 'RECONCILIATION_RUN_NOT_FOUND', 'Reconciliation run not found', false);
  if (runRow.accountId !== auth.userId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'Run does not belong to authenticated account', false);
  }

  const mismatchLimitRaw = req.query?.mismatchLimit !== undefined ? Number(req.query.mismatchLimit) : 1000;
  const mismatchLimit = Number.isFinite(mismatchLimitRaw)
    ? Math.max(1, Math.min(10_000, Math.trunc(mismatchLimitRaw)))
    : 1000;

  const run = normalizeBillingReconciliationRunRow(runRow);
  const mismatches = dbCtx.listBillingReconciliationMismatchesByRun
    .all(runId, mismatchLimit)
    .map(normalizeBillingReconciliationMismatchRow);
  const alerts = dbCtx.listBillingReconciliationAlertsByRun
    .all(runId, mismatchLimit)
    .map(normalizeBillingReconciliationAlertRow);

  return {
    ok: true,
    run,
    mismatchCount: mismatches.length,
    mismatches,
    alerts,
  };
});

fastify.get('/v1/governance/accounts/:accountId/data-map', async (req, reply) => {
  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  if (auth.userId !== accountId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const retentionDays = {
    callSessions: 30,
    realtimeEvents: 30,
    transcriptSnapshots: 14,
    usageMeterRecords: 365,
    billingUsageEvents: 365,
    reconciliationArtifacts: 365,
    governanceAuditLogs: 365,
  };

  const dataMap = {
    ingress: ['realtime call events', 'orchestration actions', 'billing adjustments', 'reconciliation triggers'],
    storage: [
      'call_session',
      'realtime_event',
      'transcript_snapshot',
      'usage_meter_record',
      'billing_usage_event',
      'billing_dead_letter',
      'billing_reconciliation_run',
      'billing_reconciliation_mismatch',
      'billing_reconciliation_alert',
      'tenant_config',
      'governance_audit_log',
    ],
    egress: ['reconciliation alert webhook (optional)', 'billing traceability exports'],
    retentionDays,
  };

  return {
    ok: true,
    accountId,
    dataMap,
    currentCounts: buildDataGovernanceCounts(accountId),
  };
});

fastify.get('/v1/governance/accounts/:accountId/audit', async (req, reply) => {
  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const auth = getAuthenticatedUserId(req);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  if (auth.userId !== accountId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.trunc(limitRaw))) : 200;
  const rows = dbCtx.listGovernanceAuditByAccount.all(accountId, limit);

  return {
    ok: true,
    accountId,
    count: rows.length,
    entries: rows.map(normalizeGovernanceAuditRow),
  };
});

fastify.post('/v1/governance/accounts/:accountId/delete', async (req, reply) => {
  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const body = req.body || {};
  const auth = getAuthenticatedUserId(req, body);
  if (auth.code) return sendError(req, reply, 401, auth.code, auth.message, false);
  if (auth.userId !== accountId) {
    return sendError(req, reply, 403, 'CROSS_USER_FORBIDDEN', 'accountId must match authenticated x-user-id', false);
  }

  const mode = String(body.mode || 'dry-run').toLowerCase();
  const dryRun = mode !== 'execute';

  const before = buildDataGovernanceCounts(accountId);
  if (dryRun) {
    const audit = writeGovernanceAuditLog({
      accountId,
      actorId: auth.userId,
      eventType: 'governance.delete.dry_run',
      payload: { mode, before },
    });

    return {
      ok: true,
      accountId,
      dryRun: true,
      before,
      deleted: null,
      audit,
      note: 'Set mode=execute and confirm=true to perform deletion',
    };
  }

  if (body.confirm !== true) {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'mode=execute requires confirm=true', false);
  }

  const deleted = executeAccountDataDeletion(accountId);
  const after = buildDataGovernanceCounts(accountId);
  const audit = writeGovernanceAuditLog({
    accountId,
    actorId: auth.userId,
    eventType: 'governance.delete.execute',
    payload: { before, deleted, after },
  });

  return {
    ok: true,
    accountId,
    dryRun: false,
    before,
    deleted,
    after,
    audit,
  };
});

fastify.get('/v1/operator/tenants', async (req, reply) => {
  const internal = getInternalGatewayAuth(req);
  if (internal.code) return sendError(req, reply, 401, internal.code, internal.message, false);

  const limitRaw = req.query?.limit !== undefined ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.trunc(limitRaw))) : 200;

  const tenants = dbCtx.listTenantConfigs.all(limit).map(normalizeTenantConfigRow);
  return {
    ok: true,
    count: tenants.length,
    tenants,
  };
});

fastify.get('/v1/operator/tenants/:accountId/config', async (req, reply) => {
  const internal = getInternalGatewayAuth(req);
  if (internal.code) return sendError(req, reply, 401, internal.code, internal.message, false);

  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const row = dbCtx.getTenantConfigByAccountId.get(accountId);
  return {
    ok: true,
    tenant: normalizeTenantConfigRow(row),
  };
});

fastify.post('/v1/operator/tenants/:accountId/config', async (req, reply) => {
  const internal = getInternalGatewayAuth(req);
  if (internal.code) return sendError(req, reply, 401, internal.code, internal.message, false);

  const accountId = String(req.params?.accountId || '').trim();
  if (!accountId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'accountId is required', false);

  const body = req.body || {};
  const nowMs = Date.now();
  const existing = dbCtx.getTenantConfigByAccountId.get(accountId);

  const status = body.status ? String(body.status) : (existing?.status || 'active');
  const plan = body.plan ? String(body.plan) : (existing?.plan || 'mvp');
  const maxConcurrentCallsRaw = Number(body.maxConcurrentCalls);
  const maxConcurrentCalls = Number.isFinite(maxConcurrentCallsRaw)
    ? Math.max(1, Math.min(1000, Math.trunc(maxConcurrentCallsRaw)))
    : Number(existing?.maxConcurrentCalls || 3);

  const flags = {
    ...(existing ? parseStoredMetadata(existing.flagsJson) : {}),
    ...parseRequestMetadata(body.flags),
  };

  const metadata = {
    ...(existing ? parseStoredMetadata(existing.metadataJson) : {}),
    ...parseRequestMetadata(body.metadata),
  };

  dbCtx.upsertTenantConfig.run(
    accountId,
    status,
    plan,
    maxConcurrentCalls,
    JSON.stringify(flags),
    JSON.stringify(metadata),
    Number(existing?.createdAtMs || nowMs),
    nowMs,
  );

  const tenant = normalizeTenantConfigRow(dbCtx.getTenantConfigByAccountId.get(accountId));
  writeGovernanceAuditLog({
    accountId,
    actorId: 'operator.internal',
    eventType: 'tenant.config.upsert',
    payload: { status: tenant.status, plan: tenant.plan, maxConcurrentCalls: tenant.maxConcurrentCalls },
  });

  return {
    ok: true,
    tenant,
  };
});

fastify.post('/v1/realtime/sessions/:sessionId/checkpoint', async (req, reply) => {
  const sessionId = String(req.params?.sessionId || '').trim();
  if (!sessionId) return sendError(req, reply, 400, 'INVALID_REQUEST', 'sessionId is required', false);

  const body = req.body || {};
  const consumerId = String(body.consumerId || '').trim();
  const watermarkTs = String(body.watermarkTs || body.watermarkTimestamp || '').trim();
  const watermarkEventId = String(body.watermarkEventId || '').trim();
  const watermarkSequenceRaw = body.watermarkSequence !== undefined ? Number(body.watermarkSequence) : null;
  const watermarkSequence = Number.isFinite(watermarkSequenceRaw) ? Math.max(0, Math.trunc(watermarkSequenceRaw)) : null;
  if (!consumerId || !watermarkTs || !watermarkEventId) {
    return sendError(req, reply, 400, 'INVALID_REQUEST', 'consumerId, watermarkTs/watermarkTimestamp, and watermarkEventId are required', false);
  }

  const updatedAtMs = Date.now();
  dbCtx.upsertRealtimeCheckpoint.run(sessionId, consumerId, watermarkTs, watermarkEventId, updatedAtMs);
  if (watermarkSequence !== null && dbCtx.getCallSessionById.get(sessionId)) {
    dbCtx.updateCallSessionAck.run(watermarkSequence, watermarkTs, watermarkEventId, updatedAtMs, sessionId);
  }
  const checkpoint = dbCtx.getRealtimeCheckpoint.get(sessionId, consumerId);
  const session = normalizeCallSessionRow(dbCtx.getCallSessionById.get(sessionId));
  return {
    ok: true,
    checkpoint: checkpoint
      ? {
          sessionId: checkpoint.sessionId,
          consumerId: checkpoint.consumerId,
          watermarkTs: checkpoint.watermarkTimestamp,
          watermarkTimestamp: checkpoint.watermarkTimestamp,
          watermarkEventId: checkpoint.watermarkEventId,
          updatedAtMs: checkpoint.updatedAtMs,
        }
      : null,
    sessionAck: { sequence: session?.lastAckSequence || null, timestamp: session?.lastAckTimestamp || null, eventId: session?.lastAckEventId || null },
  };
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

  try {
    const execution = executeOrchestrationAction({
      sessionId,
      actionId,
      actionType,
      payload: body.payload,
    });
    const durationMs = Math.max(0, Date.now() - startedAtMs);

    const executedEvent = createRealtimeEvent({
      sessionId,
      eventId: `evt_${stableId(sessionId, actionId, 'executed').slice(0, 20)}`,
      type: 'action.executed',
      actor,
      payload: {
        actionId,
        durationMs,
        resultRef: execution.resultRef,
      },
      ts: nowIso(),
    });
    const executedResult = publishRealtimeEvent(executedEvent);

    let metering = null;
    try {
      metering = recordUsageAndEmitBillingEvent({
        accountId: auth.userId,
        sessionId,
        meterId: 'orchestration.action.executed.count',
        unit: 'count',
        quantity: 1,
        sourceEvent: executedResult.event,
        metadata: {
          actionId,
          actionType,
          riskTier,
        },
      });
    } catch (err) {
      req.log.error({ err, sessionId, actionId }, 'metering_action_execution_record_failed');
    }

    return {
      ok: true,
      blocked: false,
      actionId,
      actionType,
      result: execution,
      metering,
      ack: {
        status: 'executed',
        outcomeRef: execution.resultRef,
      },
      decision: {
        policyId: decision.policyId,
        decision: decision.decision,
        reason: decision.reason,
      },
      events: {
        requested: requestedEvent,
        safety: safetyEvent,
        executed: executedResult.event,
      },
    };
  } catch (err) {
    const failedAtMs = Date.now();
    const failureCode = String(err?.code || 'ACTION_EXECUTION_FAILED');
    const failureMessage = String(err?.message || 'action execution failed');
    const retryable = err?.retryable === true;
    const statusCodeRaw = Number(err?.statusCode);
    const statusCode = Number.isFinite(statusCodeRaw) ? Math.max(400, Math.min(599, Math.trunc(statusCodeRaw))) : 500;

    const failedEvent = createRealtimeEvent({
      sessionId,
      eventId: `evt_${stableId(sessionId, actionId, 'failed', failureCode).slice(0, 20)}`,
      type: 'action.failed',
      actor,
      payload: {
        actionId,
        code: failureCode,
        message: failureMessage,
        retryable,
      },
      ts: new Date(failedAtMs).toISOString(),
    });
    publishRealtimeEvent(failedEvent);

    return reply.code(statusCode).send({
      ok: false,
      blocked: false,
      code: failureCode,
      message: failureMessage,
      retryable,
      actionId,
      actionType,
      ack: {
        status: 'failed',
        outcomeRef: failedEvent.eventId,
      },
      decision: {
        policyId: decision.policyId,
        decision: decision.decision,
        reason: decision.reason,
      },
      events: {
        requested: requestedEvent,
        safety: safetyEvent,
        failed: failedEvent,
      },
    });
  }
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
