import crypto from 'node:crypto';

const LIVEKIT_DEFAULT_TOKEN_TTL_SECONDS = 60 * 5;

function clean(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwtHs256(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

function asIsoOrNow(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function inferSpeaker(role) {
  const normalized = clean(role).toLowerCase();
  if (normalized.includes('agent') || normalized.includes('assistant')) return 'agent';
  if (normalized.includes('user') || normalized.includes('human') || normalized.includes('participant')) return 'user';
  return 'unknown';
}

function coerceMs(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

export function createLiveKitTokenIssuer({ apiKey, apiSecret }) {
  const key = clean(apiKey);
  const secret = clean(apiSecret);
  const configured = Boolean(key && secret);

  async function mint({ roomName, participantIdentity, participantName, metadata = {}, ttlSeconds = LIVEKIT_DEFAULT_TOKEN_TTL_SECONDS }) {
    if (!configured) throw new Error('LIVEKIT_NOT_CONFIGURED');

    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttl = Math.max(30, Math.min(3600, Math.trunc(ttlSeconds || LIVEKIT_DEFAULT_TOKEN_TTL_SECONDS)));
    const payload = {
      iss: key,
      sub: participantIdentity,
      name: participantName || participantIdentity,
      nbf: nowSeconds - 5,
      exp: nowSeconds + ttl,
      metadata: JSON.stringify(metadata),
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    };

    return signJwtHs256(payload, secret);
  }

  return { configured, mint };
}

export function translateLiveKitEventToCanonical(rawEvent, { sessionId, providerRoomId, providerParticipantId, providerCallId }) {
  const eventType = clean(rawEvent?.event || rawEvent?.type || rawEvent?.name).toLowerCase();
  if (!eventType) return [];

  const actor = { role: 'provider', id: 'livekit' };
  const callId = sessionId;

  if (eventType === 'participant_joined' || eventType === 'participant_connected') {
    return [{
      type: 'call.connected',
      actor,
      payload: {
        callId,
        connectedAt: asIsoOrNow(rawEvent?.timestamp || rawEvent?.createdAt),
        providerSessionId: providerCallId,
      },
    }];
  }

  if (eventType === 'participant_left' || eventType === 'participant_disconnected' || eventType === 'room_finished') {
    const endedAt = asIsoOrNow(rawEvent?.timestamp || rawEvent?.createdAt);
    return [{
      type: 'call.ended',
      actor,
      payload: {
        callId,
        endedAt,
        durationSeconds: Math.max(0, Math.trunc(Number(rawEvent?.durationSeconds || 0) || 0)),
        endReason: 'user_hangup',
      },
    }];
  }

  if (eventType === 'track_publish_failed' || eventType === 'egress_failed' || eventType === 'ingress_error') {
    return [{
      type: 'call.error',
      actor,
      payload: {
        callId,
        code: clean(rawEvent?.code || rawEvent?.errorCode || 'LIVEKIT_TRANSPORT_ERROR'),
        message: clean(rawEvent?.message || rawEvent?.error || 'media transport failure'),
        retryable: true,
      },
    }];
  }

  if (eventType === 'transcription_received' || eventType === 'transcript_received') {
    const utteranceId = clean(rawEvent?.utteranceId || rawEvent?.segmentId || rawEvent?.id || `${providerParticipantId || 'participant'}-${Date.now()}`);
    const text = clean(rawEvent?.text || rawEvent?.transcript);
    if (!text) return [];
    const final = Boolean(rawEvent?.final || rawEvent?.isFinal);

    return [{
      type: final ? 'transcript.final' : 'transcript.partial',
      actor,
      payload: {
        utteranceId,
        speaker: inferSpeaker(rawEvent?.speaker || rawEvent?.role),
        text,
        startMs: coerceMs(rawEvent?.startMs, 0),
        endMs: coerceMs(rawEvent?.endMs, coerceMs(rawEvent?.startMs, 0)),
      },
    }];
  }

  if (eventType === 'data_received' || eventType === 'participant_metadata_changed') {
    const actionId = clean(rawEvent?.actionId || rawEvent?.id || `${providerParticipantId || 'participant'}-${Date.now()}`);
    const actionType = clean(rawEvent?.actionType || rawEvent?.topic || 'provider.signal');
    const summary = clean(rawEvent?.summary || rawEvent?.message || 'LiveKit data transport signal');

    return [{
      type: 'orchestration.action.requested',
      actor,
      payload: {
        actionId,
        actionType,
        summary,
      },
    }];
  }

  return [];
}

export function extractLiveKitCorrelation(rawEvent = {}) {
  const roomName = clean(rawEvent?.room?.name || rawEvent?.roomName || rawEvent?.room);
  const participantIdentity = clean(
    rawEvent?.participant?.identity
    || rawEvent?.participantIdentity
    || rawEvent?.participant?.sid
    || rawEvent?.participantSid
  );
  const providerCallId = clean(rawEvent?.callId || rawEvent?.room?.sid || rawEvent?.roomSid || `${roomName}:${participantIdentity}`);
  const sessionIdFromMetadata = clean(
    rawEvent?.sessionId
    || rawEvent?.room?.metadata?.sessionId
    || rawEvent?.participant?.metadata?.sessionId
  );

  return {
    providerRoomId: roomName,
    providerParticipantId: participantIdentity,
    providerCallId,
    sessionIdFromMetadata,
  };
}
