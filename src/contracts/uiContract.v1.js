/**
 * UI Contract v1.0
 * Backend -> Frontend event schema
 * Backend owns intent; UI only renders
 */

export const UI_CONTRACT_VERSION = '1.0';

export const UI_EVENT_TYPES = {
  // Content streaming
  TEXT_DELTA: 'text.delta',
  TEXT_DONE: 'text.done',
  
  // Speaker control
  SPEAKER_CHANGE: 'speaker.change',
  
  // Mode/module lifecycle (backend controls what's shown)
  MODE_ACTIVATE: 'mode.activate',
  MODE_DEACTIVATE: 'mode.deactivate',
  
  // Deliverables (structured data for UI components)
  DELIVERABLE_CV: 'deliverable.cv',
  DELIVERABLE_INTERVIEW: 'deliverable.interview',
  DELIVERABLE_OUTREACH: 'deliverable.outreach',
  
  // Voice session
  VOICE_START: 'voice.start',
  VOICE_END: 'voice.end',
  VOICE_INTERIM: 'voice.interim',
  
  // System/confirmation
  ERROR: 'error',
  STATUS: 'status',
  CONFIRM_REQUIRED: 'confirm.required',
  ACTION_APPROVAL_STATE: 'action.approval.state',
  ACTION_AUDIT: 'action.audit',
};

export const ACTION_RISK_TIERS = {
  READ_ONLY: 'read-only',
  LOW_RISK_WRITE: 'low-risk-write',
  HIGH_RISK_EXTERNAL_SEND: 'high-risk-external-send',
};

export const UI_SPEAKERS = {
  ANTONIO: 'antonio',
  MARIANA: 'mariana',
  BOTH: 'both',
  EXECUTOR: 'executor',
};

export const UI_MODES = {
  CV: 'cv',
  INTERVIEW: 'interview',
  OUTREACH: 'outreach',
  TRIP: 'trip',
  CHAT: 'chat',
};

/**
 * Event payload schemas (for validation/documentation)
 */
export const UI_EVENT_SCHEMAS = {
  [UI_EVENT_TYPES.TEXT_DELTA]: {
    delta: 'string', // incremental text
    fullText: 'string', // accumulated text so far
    messageId: 'string',
  },
  
  [UI_EVENT_TYPES.TEXT_DONE]: {
    fullText: 'string',
    messageId: 'string',
    speaker: 'string', // final speaker
  },
  
  [UI_EVENT_TYPES.SPEAKER_CHANGE]: {
    speaker: 'string', // antonio|mariana|both|executor
    messageId: 'string',
    reason: 'string?', // optional context
  },
  
  [UI_EVENT_TYPES.MODE_ACTIVATE]: {
    mode: 'string', // cv|interview|outreach|trip|chat
    context: 'object?', // mode-specific context
    position: 'object?', // {x, y} for floating modules
  },
  
  [UI_EVENT_TYPES.MODE_DEACTIVATE]: {
    mode: 'string',
    reason: 'string?',
  },
  
  [UI_EVENT_TYPES.DELIVERABLE_CV]: {
    type: 'cv',
    data: {
      sections: 'array',
      markdown: 'string',
      json: 'object',
      rawText: 'string',
    },
    actions: 'array', // [{ label, action, payload }]
    version: 'string',
  },
  
  [UI_EVENT_TYPES.DELIVERABLE_INTERVIEW]: {
    type: 'interview',
    data: {
      questions: 'array', // [{ id, question, type, followUp }]
      tips: 'string',
      duration: 'number',
      role: 'string',
      company: 'string?',
    },
    actions: 'array',
  },
  
  [UI_EVENT_TYPES.DELIVERABLE_OUTREACH]: {
    type: 'outreach',
    data: {
      messages: 'array', // [{ id, channel, subject, body, tone }]
      recipientContext: 'object',
      personalizationSlots: 'array',
    },
    actions: 'array',
    requireConfirmation: 'boolean',
  },
  
  [UI_EVENT_TYPES.VOICE_START]: {
    sessionId: 'string',
    mode: 'string?',
  },
  
  [UI_EVENT_TYPES.VOICE_END]: {
    sessionId: 'string',
    transcript: 'string',
    duration: 'number',
  },
  
  [UI_EVENT_TYPES.VOICE_INTERIM]: {
    transcript: 'string',
    confidence: 'number?',
  },
  
  [UI_EVENT_TYPES.ERROR]: {
    code: 'string',
    message: 'string',
    recoverable: 'boolean',
    details: 'object?',
  },
  
  [UI_EVENT_TYPES.STATUS]: {
    type: 'string', // loading|ready|thinking|error
    message: 'string',
    progress: 'number?',
  },
  
  [UI_EVENT_TYPES.CONFIRM_REQUIRED]: {
    actionId: 'string',
    message: 'string',
    details: 'object',
    riskTier: 'string', // ACTION_RISK_TIERS
    onConfirm: 'string', // action name
    onCancel: 'string',
    timeout: 'number?', // ms
    expiresAt: 'number?',
  },

  [UI_EVENT_TYPES.ACTION_APPROVAL_STATE]: {
    actionId: 'string',
    state: 'string', // pending_approval|approved|executed|failed
    decision: 'string?', // confirmed|cancelled|timed_out
    result: 'string?',
    resolvedAt: 'number?',
  },

  [UI_EVENT_TYPES.ACTION_AUDIT]: {
    actionId: 'string',
    callTimestamp: 'number',
    action: 'string',
    riskTier: 'string',
    decision: 'string',
    result: 'string',
  },
};

/**
 * Helper to create validated events
 */
export function createUIEvent(type, payload) {
  if (!UI_EVENT_TYPES[type]) {
    throw new Error(`Unknown event type: ${type}`);
  }
  
  return {
    v: UI_CONTRACT_VERSION,
    type,
    payload,
    ts: Date.now(),
  };
}

/**
 * Legacy compatibility: Check if text contains speaker tag
 * @deprecated Use SPEAKER_CHANGE events instead
 */
export function parseLegacySpeakerTag(text) {
  const t = String(text || '');
  const m = t.match(/^\s*\[SPEAKER:(antonio|mariana|both|executor)\]\s*\n?/i);
  if (!m) return { speaker: null, cleaned: t };
  const speaker = String(m[1]).toLowerCase();
  const cleaned = t.slice(m[0].length);
  return { speaker, cleaned };
}

/**
 * Check if content looks like a structured deliverable
 * Used for backward compatibility during transition
 */
export function detectDeliverableType(text) {
  const t = String(text || '').toLowerCase();
  
  // CV indicators
  if (t.includes('[CV]') || t.includes('[DELIVERABLE:CV]') || 
      (t.includes('experience') && t.includes('education') && t.includes('skills'))) {
    return 'cv';
  }
  
  // Interview indicators
  if (t.includes('[INTERVIEW]') || t.includes('[DELIVERABLE:INTERVIEW]') ||
      (t.includes('question') && t.includes('role') && t.includes('company'))) {
    return 'interview';
  }
  
  // Outreach indicators
  if (t.includes('[OUTREACH]') || t.includes('[DELIVERABLE:OUTREACH]') ||
      (t.includes('subject line') && t.includes('email') && t.includes('message'))) {
    return 'outreach';
  }
  
  return null;
}

export default {
  version: UI_CONTRACT_VERSION,
  events: UI_EVENT_TYPES,
  speakers: UI_SPEAKERS,
  modes: UI_MODES,
  schemas: UI_EVENT_SCHEMAS,
  createEvent: createUIEvent,
  parseLegacySpeakerTag,
  detectDeliverableType,
};
