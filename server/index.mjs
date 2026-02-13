import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFile } from 'node:fs/promises';

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
  antonio: `You are Antonio — sharp, strategic, direct. High-energy closer. You drive action. No fluff.`,
  mariana: `You are Mariana — calm, structured, thoughtful, supportive. You reduce anxiety and create clarity.`,
  both: `You are Antonio & Mariana. One brain, two voices. Blend direct strategy + calm structure.`,
};

const fastify = Fastify({ logger: true });
await fastify.register(cors, { origin: true });

fastify.get('/health', async () => ({ ok: true }));

fastify.post('/v1/chat/turn', async (req, reply) => {
  const body = req.body || {};
  const persona = body.persona && PERSONAS[body.persona] ? body.persona : 'both';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cvData = body.cvData && typeof body.cvData === 'object' ? body.cvData : {};

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
      model: 'openai-codex/gpt-5.2',
      instructions: system,
      input,
      max_output_tokens: 900,
      user: 'life-os:web',
    }),
  });

  const rawText = await r.text();
  let json;
  try { json = JSON.parse(rawText); } catch { json = null; }
  if (!r.ok) {
    return reply.code(500).send({ ok: false, error: 'OpenClaw responses failed', detail: json || rawText.slice(0, 1200) });
  }

  const text = extractOutputText(json) || '';
  return { ok: true, text };
});

fastify.listen({ port: PORT, host: HOST });
