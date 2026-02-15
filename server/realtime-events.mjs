const EVENT_VERSION = '1.0';
const EVENT_FAMILIES = ['call.', 'transcript.', 'orchestration.', 'action.', 'safety.', 'billing.', 'usage.'];

const EVENT_PAYLOAD_VALIDATORS = {
  'call.started': (p) => req(p, ['callId', 'channel', 'direction', 'provider'])
    && inEnum(p.channel, ['voice', 'video'])
    && inEnum(p.direction, ['inbound', 'outbound']),
  'call.connected': (p) => req(p, ['callId', 'connectedAt']) && isIsoTs(p.connectedAt),
  'call.ended': (p) => req(p, ['callId', 'endedAt', 'durationSeconds', 'endReason'])
    && isIsoTs(p.endedAt)
    && isNonNegInt(p.durationSeconds)
    && inEnum(p.endReason, ['completed', 'user_hangup', 'timeout', 'agent_handover']),
  'call.error': (p) => req(p, ['code', 'message', 'retryable']) && typeof p.retryable === 'boolean',

  'transcript.partial': (p) => req(p, ['utteranceId', 'speaker', 'text', 'startMs', 'endMs'])
    && inEnum(p.speaker, ['user', 'agent', 'unknown'])
    && isNonNegInt(p.startMs)
    && isNonNegInt(p.endMs),
  'transcript.final': (p) => req(p, ['utteranceId', 'speaker', 'text', 'startMs', 'endMs'])
    && inEnum(p.speaker, ['user', 'agent'])
    && isNonNegInt(p.startMs)
    && isNonNegInt(p.endMs),

  'orchestration.action.requested': (p) => req(p, ['actionId', 'actionType', 'summary']),
  'action.proposed': (p) => req(p, ['actionId', 'actionType', 'summary']),
  'action.requires_confirmation': (p) => req(p, ['actionId', 'reason', 'confirmationToken']),
  'action.executed': (p) => req(p, ['actionId', 'durationMs']) && isNonNegInt(p.durationMs),
  'action.failed': (p) => req(p, ['actionId', 'code', 'message', 'retryable']) && typeof p.retryable === 'boolean',

  'safety.blocked': (p) => req(p, ['policyId', 'reason', 'decision']),
  'safety.approved': (p) => req(p, ['policyId', 'decision']),

  'billing.usage.recorded': (p) => req(p, ['meterId', 'billableSeconds']) && isNonNegInt(p.billableSeconds),
  'billing.adjustment.created': (p) => req(p, ['adjustmentId', 'meterId', 'amount', 'currency'])
    && typeof p.amount === 'number',
  'usage.tick': (p) => req(p, ['meterId', 'billableSeconds']) && isNonNegInt(p.billableSeconds),
  'usage.warning': (p) => req(p, ['meterId', 'thresholdType', 'thresholdValue', 'currentValue', 'message'])
    && inEnum(p.thresholdType, ['seconds', 'cost']),
  'usage.stopped': (p) => req(p, ['meterId', 'finalBillableSeconds', 'reason'])
    && isNonNegInt(p.finalBillableSeconds)
    && inEnum(p.reason, ['budget_exceeded', 'policy_limit', 'manual_stop']),
};

function req(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return keys.every((k) => {
    const v = obj[k];
    return !(v === undefined || v === null || (typeof v === 'string' && v.trim() === ''));
  });
}

function isIsoTs(v) {
  if (typeof v !== 'string') return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

function inEnum(v, allowed) {
  return typeof v === 'string' && allowed.includes(v);
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

export function validateRealtimeEventEnvelope(event) {
  const errors = [];
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { ok: false, errors: ['event must be an object'] };
  }

  const allowedKeys = ['eventId', 'timestamp', 'sessionId', 'type', 'actor', 'payload', 'version'];
  const driftKeys = ['ts', 'schemaVersion'];

  for (const k of driftKeys) {
    if (k in event) errors.push(`unsupported alias key: ${k}`);
  }

  for (const k of allowedKeys) {
    if (!(k in event)) errors.push(`missing required key: ${k}`);
  }

  if (typeof event.eventId !== 'string' || !event.eventId.trim()) errors.push('eventId must be non-empty string');
  if (!isIsoTs(event.timestamp)) errors.push('timestamp must be ISO-8601 string');
  if (typeof event.sessionId !== 'string' || !event.sessionId.trim()) errors.push('sessionId must be non-empty string');
  if (typeof event.type !== 'string' || !event.type.trim()) errors.push('type must be non-empty string');
  if (!event.actor || typeof event.actor !== 'object' || Array.isArray(event.actor)) {
    errors.push('actor must be object');
  } else {
    if (!inEnum(event.actor.role, ['user', 'agent', 'system', 'provider'])) errors.push('actor.role invalid');
    if (typeof event.actor.id !== 'string' || !event.actor.id.trim()) errors.push('actor.id required');
  }
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) errors.push('payload must be object');
  if (event.version !== EVENT_VERSION) errors.push(`version must be ${EVENT_VERSION}`);

  if (typeof event.type === 'string') {
    const matchesFamily = EVENT_FAMILIES.some((prefix) => event.type.startsWith(prefix));
    if (!matchesFamily) errors.push('type is not in required families');
    const validator = EVENT_PAYLOAD_VALIDATORS[event.type];
    if (!validator) {
      errors.push(`unsupported event type: ${event.type}`);
    } else if (!validator(event.payload || {})) {
      errors.push(`invalid payload for type: ${event.type}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function mergeTranscriptEvents(events) {
  const byUtterance = new Map();
  for (const evt of events) {
    if (!evt?.type?.startsWith('transcript.')) continue;
    const utteranceId = evt?.payload?.utteranceId;
    if (!utteranceId) continue;
    const prev = byUtterance.get(utteranceId);
    if (evt.type === 'transcript.final') {
      byUtterance.set(utteranceId, evt);
      continue;
    }
    if (!prev || prev.type !== 'transcript.final') {
      byUtterance.set(utteranceId, evt);
    }
  }
  return [...byUtterance.values()].sort((a, b) => {
    if (a.timestamp === b.timestamp) return a.eventId.localeCompare(b.eventId);
    return a.timestamp.localeCompare(b.timestamp);
  });
}

export { EVENT_VERSION };
