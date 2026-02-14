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
  // User-facing personas (UI skin)
  antonio: `You are Antonio — sharp, strategic, direct. High-energy closer. You drive action. No fluff.`,
  mariana: `You are Mariana — calm, structured, thoughtful, supportive. You reduce anxiety and create clarity.`,
  both: `You are Antonio & Mariana. One brain, two voices. Blend direct strategy + calm structure.`,

  // Agent 4 (runtime brain): execution-first.
  executor: `You are the Executor — the execution layer behind Antonio & Mariana.

You do not roleplay. You are crisp, practical, outcome-driven.

Primary mission (V1): Recruitment matchmaking + execution.
Flow: conversation → extract facts → CV draft/edits → interview prep → outreach drafts.

Critical UI contract:
- The UI may show Antonio/Mariana avatars.
- You MUST choose who "speaks" for each reply and put it on the FIRST LINE:
  [SPEAKER:antonio] or [SPEAKER:mariana] (or [SPEAKER:both] when both should speak).
- After that first line, output normal human text (no brackets).

Rules:
- Ask the minimum number of questions needed to take action.
- Prefer concrete artifacts over theory.
- Never claim you sent messages or made intros unless explicitly instructed and the system confirms it.
- When missing info blocks execution, ask for it in 1-3 targeted questions.`
};

function parseSpeakerTag(text) {
  const t = String(text || '');
  const m = t.match(/^\s*\[SPEAKER:(antonio|mariana|both|executor)\]\s*\n?/i);
  if (!m) return { speaker: null, cleaned: t };
  const speaker = String(m[1]).toLowerCase();
  const cleaned = t.slice(m[0].length);
  return { speaker, cleaned };
}

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
    chatStream: '/v1/chat/stream (POST SSE)',
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
  // block = "event: x\ndata: y\n..."
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

fastify.post('/v1/chat/stream', async (req, reply) => {
  reply.hijack();

  reply.raw.statusCode = 200;
  reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('cache-control', 'no-cache, no-transform');
  reply.raw.setHeader('connection', 'keep-alive');
  reply.raw.flushHeaders?.();

  const ac = new AbortController();
  const onClose = () => ac.abort();
  // Abort upstream work only when the client disconnects mid-stream.
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

    const system = [
      PERSONAS[persona],
      '',
      `Requested UI persona: ${requestedPersona}. Choose [SPEAKER:...] accordingly.`,
      '',
      'You are a live career coach + CV builder + interview prep assistant',
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
    if (!token) {
      sseWrite(reply.raw, 'error', { ok: false, error: 'Missing OpenClaw gateway token on server' });
      sseWrite(reply.raw, 'done', { ok: false, conversationId });
      reply.raw.end();
      return;
    }

    sseWrite(reply.raw, 'ready', { ok: true, conversationId, requestedPersona });

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
        max_output_tokens: process.env.LIFE_OS_MAX_TOKENS ? Number(process.env.LIFE_OS_MAX_TOKENS) : 900,
        user: 'antonio-mariana:web',
      }),
      signal: ac.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      sseWrite(reply.raw, 'error', { ok: false, error: 'OpenClaw responses failed', detail: detail.slice(0, 1200) });
      sseWrite(reply.raw, 'done', { ok: false, conversationId });
      reply.raw.end();
      return;
    }

    const reader = upstream.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    let fullText = '';
    let prefixBuf = '';
    let speaker = null;
    let streamingStarted = false;

    const emitDelta = (t) => {
      if (!t) return;
      fullText += t;
      sseWrite(reply.raw, 'delta', { text: t });
    };

    const ensureSpeaker = (fallbackSpeaker) => {
      if (speaker) return;
      speaker = fallbackSpeaker;
      sseWrite(reply.raw, 'speaker', { speaker });
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

        if (dataRaw === '[DONE]') {
          break;
        }

        let dataJson = null;
        try { dataJson = JSON.parse(dataRaw); } catch {}

        if (event === 'response.output_text.delta') {
          const delta = (dataJson && (dataJson.delta ?? dataJson.text)) || '';
          if (typeof delta === 'string' && delta.length) {
            if (!speaker) {
              prefixBuf += delta;
              // Try to parse speaker as early as possible.
              if (prefixBuf.includes('\n') || prefixBuf.length > 80) {
                const parsed = parseSpeakerTag(prefixBuf);
                if (parsed.speaker) {
                  ensureSpeaker(parsed.speaker === 'executor' ? requestedPersona : parsed.speaker);
                  streamingStarted = true;
                  emitDelta(parsed.cleaned);
                } else if (prefixBuf.length > 120) {
                  ensureSpeaker(requestedPersona);
                  streamingStarted = true;
                  emitDelta(prefixBuf);
                }
              }
            } else {
              streamingStarted = true;
              emitDelta(delta);
            }
          }
        }

        if (event === 'response.output_text.done') {
          const final = (dataJson && dataJson.text) || '';
          if (typeof final === 'string' && final.length && !fullText && !streamingStarted) {
            const parsed = parseSpeakerTag(final);
            ensureSpeaker(parsed.speaker === 'executor' ? requestedPersona : (parsed.speaker || requestedPersona));
            emitDelta(parsed.cleaned);
          }
        }
      }

      if (buf.includes('data: [DONE]')) break;
    }

    // If we never emitted a speaker, pick the requested persona.
    if (!speaker) {
      speaker = requestedPersona;
      sseWrite(reply.raw, 'speaker', { speaker });
    }

    // Persist assistant message
    {
      const tsMs = Date.now();
      const mid = stableId(conversationId, 'assistant', tsMs, speaker, fullText);
      dbCtx.upsertConv.run(conversationId, tsMs, tsMs, speaker);
      dbCtx.insertMsg.run(mid, conversationId, tsMs, 'assistant', speaker, fullText);
    }

    sseWrite(reply.raw, 'done', { ok: true, conversationId, speaker });
    reply.raw.end();
  } catch (e) {
    sseWrite(reply.raw, 'error', { ok: false, error: String(e) });
    try { sseWrite(reply.raw, 'done', { ok: false }); } catch {}
    try { reply.raw.end(); } catch {}
  } finally {
    reply.raw.off('close', onClose);
  }
});

fastify.post('/v1/chat/turn', async (req, reply) => {
  const body = req.body || {};
  const conversationId = body.conversationId ? String(body.conversationId) : `${Date.now()}`;
  // UI provides a preferred persona, but runtime is executor.
  const requestedPersona = body.persona && PERSONAS[body.persona] && body.persona !== 'executor' ? body.persona : 'both';
  const persona = 'executor';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cvData = body.cvData && typeof body.cvData === 'object' ? body.cvData : {};

  // Persist the last user message (deduped). We store assistant after we get model output.
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') {
    const tsMs = toTsMs(last.timestamp);
    const mid = stableId(conversationId, 'user', tsMs, last.content);
    dbCtx.upsertConv.run(conversationId, tsMs, tsMs, requestedPersona);
    dbCtx.insertMsg.run(mid, conversationId, tsMs, 'user', null, String(last.content || ''));
  }

  const system = [
    PERSONAS[persona],
    '',
    `Requested UI persona: ${requestedPersona}. Choose [SPEAKER:...] accordingly.`,
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

  const rawTextOut = extractOutputText(json) || '';
  const { speaker, cleaned } = parseSpeakerTag(rawTextOut);
  const effectiveSpeaker = speaker && speaker !== 'executor' ? speaker : requestedPersona;

  // Persist assistant message (deduped).
  {
    const tsMs = Date.now();
    const mid = stableId(conversationId, 'assistant', tsMs, effectiveSpeaker, cleaned);
    dbCtx.upsertConv.run(conversationId, tsMs, tsMs, effectiveSpeaker);
    dbCtx.insertMsg.run(mid, conversationId, tsMs, 'assistant', effectiveSpeaker, cleaned);
  }

  return { ok: true, text: cleaned, speaker: effectiveSpeaker, conversationId };
});

fastify.listen({ port: PORT, host: HOST });
