import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFile } from 'node:fs/promises';

import { initDb, stableId, toTsMs } from './db.mjs';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const HOST = process.env.HOST || '127.0.0.1';

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || '/root/.openclaw/openclaw.json';
const OPENCLAW_RESPONSES_URL = process.env.OPENCLAW_RESPONSES_URL || 'http://127.0.0.1:18789/v1/responses';

async function getGatewayToken() {
  const raw = await readFile(OPENCLAW_CONFIG, 'utf8');
  const cfg = JSON.parse(raw);
  return cfg?.gateway?.auth?.token || null;
}

function extractOutputText(respJson) {
  // OpenResponses output: [{type:"message", content:[{type:"output_text", text:"..."}]}]
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
  // User-facing personas (Phase 2+)
  antonio: `You are Antonio — sharp, strategic, direct. High-energy closer. You drive action. No fluff.`,
  mariana: `You are Mariana — calm, structured, thoughtful, supportive. You reduce anxiety and create clarity.`,
  both: `You are Antonio & Mariana. One brain, two voices. Blend direct strategy + calm structure.`,

  // Agent 4 (default for now): execution-first, neutral voice.
  executor: `You are the Executor — an execution layer for Antonio & Mariana. You do not roleplay. You are crisp, practical, and outcome-driven.

Primary mission (V1): Recruitment matchmaking + execution.
Flow: conversation → extract facts → CV draft/edits → interview prep → outreach drafts.

Rules:
- Ask the minimum number of questions needed to take action.
- Prefer producing concrete artifacts (bullets, drafts, templates) over theory.
- Never claim you sent messages or made intros unless explicitly instructed and the system confirms it.
- When missing info blocks execution, ask for it in 1-3 targeted questions.`
};

const fastify = Fastify({ logger: true });
await fastify.register(cors, { origin: true });

// Local persistence (Phase: persistence v0)
const dbCtx = await initDb(process.env.LIFE_OS_DB);

fastify.get('/health', async () => ({ ok: true }));

// Convenience: visiting the tunnel URL in a browser should show something meaningful.
fastify.get('/', async () => ({
  ok: true,
  service: 'antonio-mariana-api',
  endpoints: {
    health: '/health',
    chatTurn: '/v1/chat/turn (POST json)',
  },
}));

fastify.post('/v1/chat/turn', async (req, reply) => {
  const body = req.body || {};
  const conversationId = body.conversationId ? String(body.conversationId) : `${Date.now()}`;
  const persona = body.persona && PERSONAS[body.persona] ? body.persona : 'executor';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cvData = body.cvData && typeof body.cvData === 'object' ? body.cvData : {};

  // Persist the last user message (deduped). We store assistant after we get model output.
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') {
    const tsMs = toTsMs(last.timestamp);
    const mid = stableId(conversationId, 'user', tsMs, last.content);
    dbCtx.upsertConv.run(conversationId, tsMs, tsMs, persona);
    dbCtx.insertMsg.run(mid, conversationId, tsMs, 'user', null, String(last.content || ''));
  }

  const system = [
    PERSONAS[persona],
    '',
    'You are a live career coach + CV builder + interview prep assistant.',
    'You must output: (1) a normal human reply, (2) OPTIONAL structured tags for CV and interview.',
    '',
    'Rules for tags:',
    '- Only include tags when you learned something concrete.',
    '- Tags must be on separate lines at the end.',
    '',
    'Tag formats:',
    '[INTENT:cv_building|interview_prep|career_coach|general]',
    '[MEMORY:current_role=value]',
    '[MEMORY:target_role=value]',
    '[MEMORY:skills=value1, value2]',
    '[MEMORY:salary_range=value]',
    '[MEMORY:location_preference=value]',
    '[CV:name=...] [CV:email=...] [CV:phone=...] [CV:location=...] [CV:summary=...]',
    '[CV:skills=skill1, skill2]',
    '[CV:experience={"title":"","company":"","duration":"","description":""}] (repeatable)',
    '[CV:education={"degree":"","institution":"","year":""}] (repeatable)',
    '[INTERVIEW:question=...] (repeatable)',
    '[INTERVIEW:tip=...] (repeatable, should follow a question)',
    '[INTERVIEW:followup=...] (repeatable, should follow a question)',
    '',
    'Current CV (JSON):',
    JSON.stringify(cvData).slice(0, 8000),
  ].join('\n');

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
      max_output_tokens: process.env.LIFE_OS_MAX_TOKENS ? Number(process.env.LIFE_OS_MAX_TOKENS) : 900,
      user: 'antonio-mariana:web',
    }),
  });

  const rawText = await r.text();
  let json;
  try { json = JSON.parse(rawText); } catch { json = null; }
  if (!r.ok) {
    return reply.code(500).send({ ok: false, error: 'OpenClaw responses failed', detail: json || rawText.slice(0, 1200) });
  }

  const text = extractOutputText(json) || '';

  // Persist assistant message (deduped).
  {
    const tsMs = Date.now();
    const mid = stableId(conversationId, 'assistant', tsMs, persona, text);
    dbCtx.upsertConv.run(conversationId, tsMs, tsMs, persona);
    dbCtx.insertMsg.run(mid, conversationId, tsMs, 'assistant', persona, text);
  }

  return { ok: true, text, conversationId };
});

fastify.listen({ port: PORT, host: HOST });
