import React, { useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Volume2, VolumeX } from "lucide-react";

import { useUIEventReducer, UI_EVENT_TYPES } from "../hooks/useUIEventReducer";
import { renderModule, renderInlineModule, getActionMetadata } from "../lib/moduleRegistry";
import MessageBubble from "../components/chat/MessageBubble";
import UnifiedInput from "../components/chat/UnifiedInput";
import WhisperCaption from "../components/chat/WhisperCaption";
import FloatingHints from "../components/chat/FloatingHints";
import WhisperResponse from "../components/voice/WhisperResponse";
import AvatarWithWaves from "../components/voice/AvatarWithWaves";
import FloatingModule from "../components/voice/FloatingModule";

const WELCOME_MESSAGES = {
  antonio: "Let’s go tactical. Tell me your target and constraints, and I’ll map the fastest route.",
  mariana: "Tell me what’s heavy right now — we’ll slow it down and make a clear next step.",
  both: "Tell me what you’re trying to do, and I’ll adapt as we go.",
};

const STRATEGY_KEYWORDS = [
  'cv', 'resume', 'interview', 'job', 'role', 'hiring', 'application', 'linkedin', 'cover letter',
];

const COACHING_KEYWORDS = [
  'coach', 'coaching', 'confidence', 'anxious', 'anxiety', 'stress', 'overwhelmed', 'burnout', 'motivation', 'stuck',
];

const USER_ID_STORAGE_KEY = 'lifeos.user.id';

function getOrCreateUserId() {
  if (typeof window === 'undefined') return 'lifeos-web-anon';
  try {
    const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = `lifeos-web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(USER_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return 'lifeos-web-anon';
  }
}

function inferPersonaHint({ text = '', activeModes = {}, currentSpeaker = 'both' } = {}) {
  if (currentSpeaker === 'antonio' || currentSpeaker === 'mariana') return currentSpeaker;
  if (activeModes?.cv?.active || activeModes?.interview?.active) return 'antonio';

  const normalized = String(text || '').toLowerCase();
  if (!normalized) return 'both';

  if (STRATEGY_KEYWORDS.some((k) => normalized.includes(k))) return 'antonio';
  if (COACHING_KEYWORDS.some((k) => normalized.includes(k))) return 'mariana';
  return 'both';
}

export default function Home() {
  const {
    state,
    processEvent,
    processEvents,
    sendMessage,
    clearConversation,
    confirmAction,
    cancelAction,
    updateModulePosition,
    closeModule,
  } = useUIEventReducer();

  const {
    messages,
    currentMessage,
    isStreaming,
    currentSpeaker,
    activeModes,
    floatingModules,
    deliverables,
    status,
    error,
    pendingConfirmation,
    actionApprovals,
    conversationId,
    callRuntime,
    voiceConfig,
    turnRuntime,
  } = state;

  const messagesEndRef = useRef(null);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [showHint, setShowHint] = React.useState(false);
  const [voiceCaption, setVoiceCaption] = React.useState("");
  const [isVoiceActive, setIsVoiceActive] = React.useState(false);
  const [whisper, setWhisper] = React.useState("");
  const [ttsEnabled, setTtsEnabled] = React.useState(false);
  const [showMemory, setShowMemory] = React.useState(false);
  const [voiceMode, setVoiceMode] = React.useState('realtime'); // realtime | browser-fallback | text
  const [callSession, setCallSession] = React.useState(null); // { sessionId, resumeToken, userId }
  const realtimeSequenceRef = useRef(0);
  const realtimePollRef = useRef(null);
  const confirmationTimersRef = useRef({});

  const clearConfirmationTimer = useCallback((actionId) => {
    const timerId = confirmationTimersRef.current[actionId];
    if (timerId) {
      clearTimeout(timerId);
      delete confirmationTimersRef.current[actionId];
    }
  }, []);

  const postActionDecision = useCallback(async (payload) => {
    const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || import.meta.env.VITE_BASE44_APP_BASE_URL || "";
    try {
      await fetch(`${API_ORIGIN}/v1/actions/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error('Failed to persist action decision', e);
    }
  }, []);

  const resolvePersonaHint = useCallback((text = '') => {
    return inferPersonaHint({ text, activeModes, currentSpeaker });
  }, [activeModes, currentSpeaker]);

  const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || import.meta.env.VITE_BASE44_APP_BASE_URL || "";

  const speak = useCallback((text) => {
    if (!ttsEnabled) return;
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    const t = String(text || "").trim();
    if (!t) return;

    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.lang = "en-US";
      synth.speak(u);
    } catch {
      // noop
    }
  }, [ttsEnabled]);

  const createCallSession = useCallback(async () => {
    const userId = getOrCreateUserId();

    processEvent({
      type: UI_EVENT_TYPES.CALL_RUNTIME_STATE,
      payload: { state: 'connecting', mode: voiceMode, provider: 'livekit' },
    });

    const created = await fetch(`${API_ORIGIN}/v1/call/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ userId, provider: 'livekit', metadata: { voicePersona: currentSpeaker || 'both' } }),
    });

    if (!created.ok) {
      const detail = await created.text().catch(() => '');
      throw new Error(`call session create failed: ${created.status} ${detail}`);
    }

    const createdJson = await created.json();
    const session = createdJson?.session;
    if (!session?.sessionId) throw new Error('missing call session id');

    // Boot flow contract:
    // 1) POST /v1/call/sessions
    // 2) store session_id locally
    // 3) connect realtime endpoint via callSession-driven poll effect
    const provisional = {
      sessionId: session.sessionId,
      resumeToken: session.resumeToken,
      userId,
    };
    setCallSession(provisional);
    realtimeSequenceRef.current = 0;

    const activateResp = await fetch(`${API_ORIGIN}/v1/call/sessions/${session.sessionId}/state`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        userId,
        status: 'active',
        provider: 'livekit',
        providerRoomId: `lk_room_${session.sessionId}`,
        providerParticipantId: `lk_part_${userId}`,
        providerCallId: `lk_call_${session.sessionId}`,
      }),
    });

    if (!activateResp.ok) {
      const detail = await activateResp.text().catch(() => '');
      setCallSession(null);
      processEvent({
        type: UI_EVENT_TYPES.CALL_RUNTIME_STATE,
        payload: { state: 'failed', mode: voiceMode, provider: 'livekit' },
      });
      throw new Error(`call session activate failed: ${activateResp.status} ${detail}`);
    }

    const activatedJson = await activateResp.json();
    const activeSession = activatedJson?.session || session;

    const next = {
      sessionId: activeSession.sessionId,
      resumeToken: activeSession.resumeToken,
      userId,
    };

    setCallSession(next);
    return next;
  }, [API_ORIGIN, currentSpeaker, processEvent, voiceMode]);

  const mapCanonicalRealtimeEvent = useCallback((event) => {
    if (!event?.type) return;

    const type = String(event.type);
    const payload = event.payload || {};

    if (type === 'call.started' || type === 'call.connecting') {
      processEvent({
        type: UI_EVENT_TYPES.CALL_RUNTIME_STATE,
        payload: {
          state: 'connecting',
          provider: payload.provider || callRuntime?.provider || 'livekit',
          mode: voiceMode,
        },
      });
      processEvent({
        type: UI_EVENT_TYPES.STATUS,
        payload: {
          type: 'call',
          message: 'Connecting voice transport…',
        },
      });
      return;
    }

    if (type === 'call.connected') {
      processEvent({
        type: UI_EVENT_TYPES.CALL_RUNTIME_STATE,
        payload: {
          state: 'connected',
          provider: payload.provider || callRuntime?.provider || 'livekit',
          mode: voiceMode,
        },
      });
      processEvent({
        type: UI_EVENT_TYPES.STATUS,
        payload: {
          type: 'call',
          message: 'Voice connected',
        },
      });
      return;
    }

    if (type === 'call.reconnecting') {
      processEvent({
        type: UI_EVENT_TYPES.CALL_RUNTIME_STATE,
        payload: {
          state: 'reconnecting',
          mode: voiceMode,
        },
      });
      processEvent({
        type: UI_EVENT_TYPES.STATUS,
        payload: {
          type: 'call',
          message: 'Reconnecting…',
        },
      });
      return;
    }

    if (type === 'call.ended') {
      processEvent({
        type: UI_EVENT_TYPES.CALL_RUNTIME_STATE,
        payload: { state: 'ended', mode: voiceMode },
      });
      return;
    }

    if (type === 'call.error' || type === 'call.terminal_failure') {
      const code = payload.code || type;
      processEvent({
        type: UI_EVENT_TYPES.CALL_RUNTIME_STATE,
        payload: {
          state: 'failed',
          mode: voiceMode,
        },
      });
      processEvent({
        type: UI_EVENT_TYPES.ERROR,
        payload: {
          code,
          message: payload.message || 'Call transport error',
          recoverable: true,
          details: {
            reconnectSuggested: code !== 'MIC_PERMISSION_DENIED',
            fallbackSuggested: true,
          },
        },
      });
      return;
    }

    if (type === 'call.voice.config.updated') {
      processEvent({
        type: UI_EVENT_TYPES.VOICE_CONFIG,
        payload: {
          persona: payload.persona || 'both',
          label: payload.label || payload.voiceProfileId || 'Voice profile',
          voiceProfileId: payload.voiceProfileId || null,
          clonedVoice: payload.clonedVoice === true,
          synthesisAllowed: payload.synthesisAllowed !== false,
          policyId: payload.policyId || null,
        },
      });
      return;
    }

    if (type === 'call.turn.owner_changed') {
      processEvent({
        type: UI_EVENT_TYPES.TURN_STATE,
        payload: {
          owner: payload.owner || 'none',
          turnId: payload.turnId || null,
          state: payload.owner === 'user' ? 'listening' : 'thinking',
        },
      });
      return;
    }

    if (type === 'call.turn.timing') {
      processEvent({
        type: UI_EVENT_TYPES.TURN_STATE,
        payload: {
          owner: 'agent',
          turnId: payload.turnId || null,
          state: payload.sloBreached ? 'recovering' : 'speaking',
          timing: payload,
        },
      });
      return;
    }

    if (type === 'transcript.partial') {
      if (payload.speaker === 'user') {
        setVoiceCaption(String(payload.text || ''));
      }
      return;
    }

    if (type === 'transcript.final') {
      const text = String(payload.text || '').trim();
      if (!text) return;

      if (payload.speaker === 'agent') {
        processEvent({
          type: UI_EVENT_TYPES.TEXT_DONE,
          payload: {
            fullText: text,
            messageId: event.eventId || Date.now(),
            speaker: currentSpeaker,
          },
        });
        setWhisper(text.slice(-140));
        speak(text);
        setTimeout(() => setWhisper(''), 2500);
      }
      return;
    }

    if (type === 'orchestration.action.requested') {
      processEvent({
        type: UI_EVENT_TYPES.ACTION_AUDIT,
        payload: {
          actionId: payload.actionId,
          action: payload.actionType,
          decision: 'pending',
          result: 'requested',
          riskTier: payload.riskTier,
          callTimestamp: Date.now(),
        },
      });
      return;
    }

    if (type === 'action.proposed') {
      const actionType = String(payload.actionType || '');
      const deliverable = payload.deliverable;
      if (deliverable && actionType.includes('deliverable.cv')) {
        processEvent({ type: UI_EVENT_TYPES.DELIVERABLE_CV, payload: deliverable });
      } else if (deliverable && actionType.includes('deliverable.interview')) {
        processEvent({ type: UI_EVENT_TYPES.DELIVERABLE_INTERVIEW, payload: deliverable });
      } else if (deliverable && actionType.includes('deliverable.outreach')) {
        processEvent({ type: UI_EVENT_TYPES.DELIVERABLE_OUTREACH, payload: deliverable });
      }
      return;
    }

    if (type === 'action.requires_confirmation') {
      processEvent({
        type: UI_EVENT_TYPES.CONFIRM_REQUIRED,
        payload: {
          actionId: payload.actionId,
          message: payload.reason || 'Confirm external send. This cannot be undone.',
          details: {
            action: payload.uiEvent?.details?.action || payload.actionType,
            callTimestamp: Date.now(),
            deliverableId: payload.uiEvent?.details?.deliverableId,
          },
          riskTier: 'high-risk-external-send',
          timeout: 30_000,
          expiresAt: Date.now() + 30_000,
          onConfirm: 'outreach.send.execute',
          onCancel: 'outreach.send.cancel',
        },
      });
      return;
    }

    if (type === 'safety.blocked' && payload.reason === 'explicit_user_confirmation_required') {
      processEvent({
        type: UI_EVENT_TYPES.CONFIRM_REQUIRED,
        payload: {
          actionId: payload.actionId,
          message: 'Confirm external send. This cannot be undone.',
          details: {
            action: payload.actionType,
            callTimestamp: Date.now(),
          },
          riskTier: payload.riskTier || 'high-risk-external-send',
          timeout: 30_000,
          expiresAt: Date.now() + 30_000,
          onConfirm: 'outreach.send.execute',
          onCancel: 'outreach.send.cancel',
        },
      });
      return;
    }

    if (type === 'safety.blocked' && String(payload.actionType || '').includes('voice')) {
      processEvent({
        type: UI_EVENT_TYPES.ERROR,
        payload: {
          code: 'VOICE_POLICY_BLOCKED',
          message: 'Cloned voice blocked until explicit consent + policy approval are present.',
          recoverable: true,
        },
      });
      return;
    }

    if (type === 'safety.approved') {
      processEvent({
        type: UI_EVENT_TYPES.ACTION_APPROVAL_STATE,
        payload: {
          actionId: payload.actionId,
          state: 'approved',
          decision: 'confirmed',
          resolvedAt: Date.now(),
        },
      });
      return;
    }

    if (type === 'action.executed' || type === 'action.failed') {
      processEvent({
        type: UI_EVENT_TYPES.ACTION_APPROVAL_STATE,
        payload: {
          actionId: payload.actionId,
          state: type === 'action.executed' ? 'executed' : 'failed',
          decision: type === 'action.executed' ? 'confirmed' : 'failed',
          result: type === 'action.executed' ? 'executed' : (payload.code || 'failed'),
          resolvedAt: Date.now(),
        },
      });
      return;
    }
  }, [callRuntime?.provider, currentSpeaker, processEvent, speak, voiceMode]);

  // Poll canonical realtime events so backend stays source of truth.
  useEffect(() => {
    if (!callSession?.sessionId || !callSession?.userId) return;

    const poll = async () => {
      const afterSequence = realtimeSequenceRef.current || 0;
      const url = `${API_ORIGIN}/v1/realtime/sessions/${callSession.sessionId}/events?afterSequence=${afterSequence}&limit=200`;
      try {
        const resp = await fetch(url, {
          headers: {
            'x-user-id': callSession.userId,
          },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const events = Array.isArray(data?.events) ? data.events : [];
        for (const ev of events) {
          if (typeof ev?.sequence === 'number') {
            realtimeSequenceRef.current = Math.max(realtimeSequenceRef.current || 0, ev.sequence);
          }
          mapCanonicalRealtimeEvent(ev);
        }
      } catch {
        // noop
      }
    };

    poll();
    realtimePollRef.current = setInterval(poll, 1200);

    return () => {
      if (realtimePollRef.current) {
        clearInterval(realtimePollRef.current);
        realtimePollRef.current = null;
      }
    };
  }, [API_ORIGIN, callSession, mapCanonicalRealtimeEvent]);


  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentMessage]);

  // Show hint after delay
  useEffect(() => {
    if (!hasStarted) {
      const hintTimer = setTimeout(() => setShowHint(true), 8000);
      return () => clearTimeout(hintTimer);
    }
  }, [hasStarted]);

  // Start conversation
  const startConversation = async (initialText) => {
    const id = `${Date.now()}`;
    const initialPersona = resolvePersonaHint(initialText || '');

    const welcomeMsg = {
      role: "assistant",
      content: WELCOME_MESSAGES[initialPersona] || WELCOME_MESSAGES.both,
      persona: initialPersona,
      timestamp: new Date().toISOString(),
    };

    const activeCall = await createCallSession();

    // Add welcome message via reducer
    processEvent({
      type: UI_EVENT_TYPES.TEXT_DONE,
      payload: {
        fullText: welcomeMsg.content,
        messageId: id,
        speaker: initialPersona,
      },
    });

    // Set explicit conversation/call session authority
    processEvent({
      type: UI_EVENT_TYPES.DONE,
      payload: {
        conversationId: activeCall?.sessionId || id,
      },
    });

    setHasStarted(true);

    if (initialText) {
      setTimeout(() => handleSend(initialText), 50);
    }
  };

  // Handle send
  const handleSend = async (text) => {
    const t = (text ?? "").trim();

    if (!hasStarted) {
      try {
        await startConversation(t);
      } catch (e) {
        processEvent({
          type: UI_EVENT_TYPES.ERROR,
          payload: {
            code: 'CALL_BOOT_FAILED',
            message: String(e?.message || e),
            recoverable: true,
          },
        });
        return;
      }
      if (!t && voiceMode === 'browser-fallback') {
        setIsVoiceActive(true);
      }
      return;
    }

    if (!t) return;

    const personaHint = resolvePersonaHint(t);

    // Add user message
    sendMessage(t);
    setVoiceCaption("");
    processEvent({
      type: UI_EVENT_TYPES.SPEAKER_CHANGE,
      payload: { speaker: personaHint },
    });

    // Send to backend assistant turn path (backend emits canonical transcript/action events)
    await streamFromBackend(t, personaHint);
  };

  // Call-session authoritative turn path (no /v1/chat/stream bridge)
  const streamFromBackend = async (text, personaHint = 'both') => {
    try {
      const activeConversationId = callSession?.sessionId || conversationId || `${Date.now()}`;
      const userId = callSession?.userId || getOrCreateUserId();

      const r = await fetch(`${API_ORIGIN}/v1/call/sessions/${activeConversationId}/turn`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          userId,
          conversationId: activeConversationId,
          sessionId: activeConversationId,
          persona: personaHint,
          text,
          turnId: `turn_${Date.now()}`,
          captureAtMs: Date.now(),
          voiceMode,
          messages: [...messages, { role: 'user', content: text }],
        }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data?.message || `Turn failed (${r.status})`);
      }

      const canonicalEvents = Array.isArray(data?.events) ? data.events : [];
      for (const ev of canonicalEvents) {
        if (typeof ev?.sequence === 'number') {
          realtimeSequenceRef.current = Math.max(realtimeSequenceRef.current || 0, ev.sequence);
        }
        mapCanonicalRealtimeEvent(ev);
      }
    } catch (e) {
      console.error('Turn error:', e);
      processEvent({
        type: UI_EVENT_TYPES.ERROR,
        payload: { message: e.message, recoverable: true },
      });
    }
  };

  const updateVoiceProfile = async (persona, opts = {}) => {
    if (!callSession?.sessionId || !callSession?.userId) return;

    const response = await fetch(`${API_ORIGIN}/v1/call/sessions/${callSession.sessionId}/voice`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': callSession.userId,
      },
      body: JSON.stringify({
        userId: callSession.userId,
        persona,
        userConsent: opts.userConsent === true,
        policyApprovalId: opts.policyApprovalId || null,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (body?.events) {
      Object.values(body.events).forEach((ev) => mapCanonicalRealtimeEvent(ev));
    }
    if (!response.ok) {
      throw new Error(body?.message || `Voice profile update failed (${response.status})`);
    }

    if (body?.voiceConfig) {
      processEvent({ type: UI_EVENT_TYPES.VOICE_CONFIG, payload: body.voiceConfig });
      processEvent({ type: UI_EVENT_TYPES.SPEAKER_CHANGE, payload: { speaker: body.voiceConfig.persona || persona } });
    }
  };

  const retryVoiceTransport = async () => {
    if (!callSession?.sessionId || !callSession?.userId) return;
    processEvent({ type: UI_EVENT_TYPES.CALL_RUNTIME_STATE, payload: { state: 'reconnecting', mode: voiceMode } });
    const res = await fetch(`${API_ORIGIN}/v1/call/sessions/${callSession.sessionId}/reconnect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': callSession.userId,
      },
      body: JSON.stringify({
        userId: callSession.userId,
        resumeToken: callSession.resumeToken,
        lastAckSequence: realtimeSequenceRef.current || 0,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || 'Reconnect failed');
    }
    const replayEvents = Array.isArray(data?.replay?.events) ? data.replay.events : [];
    replayEvents.forEach(mapCanonicalRealtimeEvent);
    if (data?.voiceConfig) {
      processEvent({ type: UI_EVENT_TYPES.VOICE_CONFIG, payload: data.voiceConfig });
    }
    processEvent({ type: UI_EVENT_TYPES.CALL_RUNTIME_STATE, payload: { state: 'connected', mode: voiceMode } });
  };

  const switchToBrowserFallback = () => {
    setVoiceMode('browser-fallback');
    processEvent({ type: UI_EVENT_TYPES.CALL_RUNTIME_STATE, payload: { mode: 'browser-fallback', state: callRuntime?.state || 'connected' } });
    processEvent({
      type: UI_EVENT_TYPES.STATUS,
      payload: { type: 'voice', message: 'Browser speech fallback active (non-realtime transport)' },
    });
  };

  // Handle module action (backend-authoritative lifecycle)
  const handleModuleAction = async (actionName, deliverable, userConfirmation = false, forcedActionId = null) => {
    const actionMeta = getActionMetadata(actionName);
    const callTs = Date.now();
    const actionId = forcedActionId || `${actionName}-${callTs}`;

    if (!callSession?.sessionId || !callSession?.userId) {
      processEvent({
        type: UI_EVENT_TYPES.ERROR,
        payload: { message: 'Call session not ready for action execution', recoverable: true },
      });
      return;
    }

    try {
      const resp = await fetch(`${API_ORIGIN}/v1/orchestration/actions/execute`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': callSession.userId,
        },
        body: JSON.stringify({
          userId: callSession.userId,
          sessionId: callSession.sessionId,
          conversationId: callSession.sessionId,
          actionId,
          actionType: actionName,
          summary: `${actionName} requested from UI module`,
          riskTier: actionMeta.riskTier,
          userConfirmation,
          payload: {
            deliverableId: deliverable?.id,
            deliverableType: deliverable?.type,
            data: deliverable?.data,
          },
          metadata: {
            source: 'ui.module.action',
            callTimestamp: callTs,
          },
        }),
      });

      const body = await resp.json().catch(() => ({}));

      if (Array.isArray(body?.events)) {
        body.events.forEach((ev) => mapCanonicalRealtimeEvent(ev));
      } else if (body?.events && typeof body.events === 'object') {
        Object.values(body.events).forEach((ev) => mapCanonicalRealtimeEvent(ev));
      }

      if (!resp.ok) {
        if (!body?.blocked) {
          processEvent({
            type: UI_EVENT_TYPES.ERROR,
            payload: {
              code: body?.code || 'ACTION_EXECUTION_FAILED',
              message: body?.message || `Action failed (${resp.status})`,
              recoverable: true,
            },
          });
        }
        return;
      }

      processEvent({
        type: UI_EVENT_TYPES.ACTION_APPROVAL_STATE,
        payload: {
          actionId,
          state: body?.ack?.status === 'executed' ? 'executed' : 'approved',
          decision: body?.decision?.decision || 'approved',
          result: body?.ack?.outcomeRef || 'executed',
          resolvedAt: Date.now(),
        },
      });
    } catch (e) {
      processEvent({
        type: UI_EVENT_TYPES.ERROR,
        payload: {
          code: 'ACTION_EXECUTION_NETWORK_ERROR',
          message: String(e?.message || e),
          recoverable: true,
        },
      });
    }
  };


  // Reset conversation
  const handleReset = () => {
    if (callSession?.sessionId && callSession?.userId) {
      fetch(`${API_ORIGIN}/v1/call/sessions/${callSession.sessionId}/state`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': callSession.userId,
        },
        body: JSON.stringify({ userId: callSession.userId, status: 'ended' }),
      }).catch(() => {});
    }

    clearConversation();
    setCallSession(null);
    realtimeSequenceRef.current = 0;
    setHasStarted(false);
    setIsVoiceActive(false);
    setVoiceCaption("");
    setWhisper("");
    setShowMemory(false);
    setVoiceMode('realtime');
    processEvent({ type: UI_EVENT_TYPES.CALL_RUNTIME_STATE, payload: { state: 'idle', mode: 'realtime', provider: null } });
  };

  const getLatestDeliverable = (type) => {
    for (let i = deliverables.length - 1; i >= 0; i -= 1) {
      if (deliverables[i]?.type === type) return deliverables[i];
    }
    return null;
  };

  // Get latest deliverables
  const latestCVDeliverable = getLatestDeliverable('cv');
  const latestInterviewDeliverable = getLatestDeliverable('interview');
  const latestOutreachDeliverable = getLatestDeliverable('outreach');

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-b from-stone-50 via-neutral-50 to-stone-100">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, black 1px, transparent 0)`,
        backgroundSize: "32px 32px"
      }} />

      <div className="relative h-full flex flex-col">
        {/* Floating Hints */}
        <FloatingHints visible={!hasStarted} />

        {/* Landing state */}
        <AnimatePresence mode="wait">
          {!hasStarted && (
            <motion.div
              key="landing"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex-1 flex flex-col items-center justify-center px-6"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                className="text-center mb-10"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 via-rose-500 to-violet-500 mx-auto mb-8 flex items-center justify-center shadow-xl">
                  <span className="text-white text-lg font-bold tracking-tight">LO</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-light text-neutral-800 tracking-tight mb-4">
                  Life OS
                </h1>
                <p className="text-neutral-400 text-sm tracking-[0.15em] uppercase font-medium">
                  Adaptive guidance for work & life
                </p>
                <p className="text-neutral-500 text-xs mt-3">
                  Voice adapts dynamically by context during the conversation.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="w-full max-w-2xl px-4"
              >
                <UnifiedInput onSend={handleSend} disabled={isStreaming} enableSpeech={voiceMode === 'browser-fallback'} />
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1 }}
                className="mt-6 text-[12px] tracking-[0.15em] uppercase text-neutral-400"
              >
                your next chapter starts with a conversation
              </motion.p>

              <AnimatePresence>
                {showHint && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.6 }}
                    className="mt-12 max-w-md mx-auto"
                  >
                    <div className="text-neutral-500 text-sm text-center">
                      Try: "Build my CV" or "Prepare me for an interview at Rinuccini"
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Conversation State */}
        <AnimatePresence mode="wait">
          {hasStarted && (
            <motion.div
              key="conversation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="flex-1 flex flex-col items-center justify-center relative h-full overflow-hidden"
            >
              {/* Runtime state ribbon */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/80 border border-neutral-200 text-[11px] text-neutral-700 shadow-sm z-20">
                {`Call: ${callRuntime?.state || 'idle'} · Mode: ${voiceMode} · Voice: ${voiceConfig?.label || 'Balanced Core'} · Turn: ${turnRuntime?.state || 'idle'}`}
              </div>

              {/* Voice captions */}
              <div className="absolute top-24 left-0 right-0 px-6">
                <div className="max-w-2xl mx-auto">
                  <WhisperCaption text={voiceCaption} visible={!!voiceCaption} />
                </div>
              </div>

              {/* Whisper Response */}
              <AnimatePresence>
                {whisper && <WhisperResponse text={whisper} visible={!!whisper} />}
              </AnimatePresence>

              {/* Central Avatar */}
              <div className="flex-1 flex items-center justify-center">
                <AvatarWithWaves persona={currentSpeaker} isActive={isVoiceActive} />
              </div>

              {/* Message feed */}
              <div className="absolute bottom-28 left-0 right-0 px-6 overflow-y-auto max-h-[60vh]">
                <div className="max-w-2xl mx-auto space-y-3">
                  {messages.slice(-6).map((m, idx) => (
                    <MessageBubble 
                      key={m.id || idx} 
                      message={m} 
                      isLast={idx === Math.min(messages.length, 6) - 1} 
                    />
                  ))}
                  
                  {/* Current streaming message */}
                  {isStreaming && currentMessage && (
                    <MessageBubble
                      message={{
                        role: 'assistant',
                        content: currentMessage,
                        persona: currentSpeaker,
                        timestamp: new Date().toISOString(),
                      }}
                      isLast={true}
                      isStreaming={true}
                    />
                  )}
                  
                  {/* Inline CV Preview */}
                  {latestCVDeliverable && renderInlineModule('cv', { 
                    deliverable: latestCVDeliverable,
                    onAction: handleModuleAction,
                  })}
                  
                  {/* Inline Interview Preview */}
                  {latestInterviewDeliverable && renderInlineModule('interview', {
                    deliverable: latestInterviewDeliverable,
                    onAction: handleModuleAction,
                  })}

                  {/* Inline Outreach Preview */}
                  {latestOutreachDeliverable && renderInlineModule('outreach', {
                    deliverable: latestOutreachDeliverable,
                    onAction: handleModuleAction,
                  })}
                  
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Error display */}
              {error && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-lg w-[90%]">
                  <p className="text-red-600 text-sm">{error.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        try { await retryVoiceTransport(); } catch (e) {
                          processEvent({ type: UI_EVENT_TYPES.ERROR, payload: { message: String(e?.message || e), recoverable: true } });
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-white border border-red-200 text-red-700"
                    >
                      Retry voice
                    </button>
                    <button
                      onClick={switchToBrowserFallback}
                      className="text-xs px-2 py-1 rounded bg-white border border-red-200 text-red-700"
                    >
                      Switch to browser fallback
                    </button>
                    <button
                      onClick={async () => {
                        setVoiceMode('text');
                        processEvent({ type: UI_EVENT_TYPES.CALL_RUNTIME_STATE, payload: { mode: 'text', state: callRuntime?.state || 'connected' } });
                      }}
                      className="text-xs px-2 py-1 rounded bg-white border border-red-200 text-red-700"
                    >
                      Text mode
                    </button>
                  </div>
                </div>
              )}


              {/* Approval state summary */}
              {Object.values(actionApprovals || {}).length > 0 && (
                <div className="absolute top-20 right-6 bg-white/90 border border-neutral-200 rounded-lg px-3 py-2 text-xs shadow-sm max-w-xs">
                  <p className="font-medium text-neutral-700 mb-1">Action approvals</p>
                  <div className="space-y-1">
                    {Object.values(actionApprovals).slice(-3).map((a) => (
                      <p key={a.actionId} className="text-neutral-600">{a.actionId}: <span className="font-medium">{a.state}</span></p>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirmation dialog */}
              {pendingConfirmation && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 z-50">
                  <h3 className="text-lg font-medium mb-2">Confirm Action</h3>
                  <p className="text-neutral-600 mb-4">{pendingConfirmation.message}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        const actionId = pendingConfirmation.actionId;
                        const action = pendingConfirmation.details?.action;
                        const deliverableId = pendingConfirmation.details?.deliverableId;
                        clearConfirmationTimer(actionId);
                        confirmAction(actionId);
                        await handleModuleAction(action, { id: deliverableId, type: 'outreach' }, true, actionId);
                      }}
                      className="flex-1 bg-slate-900 text-white py-2 rounded-lg"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={async () => {
                        const actionId = pendingConfirmation.actionId;
                        const action = pendingConfirmation.details?.action;
                        clearConfirmationTimer(actionId);
                        cancelAction(actionId);
                        processEvent({
                          type: UI_EVENT_TYPES.ACTION_APPROVAL_STATE,
                          payload: {
                            actionId,
                            state: 'failed',
                            decision: 'cancelled',
                            result: 'cancelled-by-user',
                            resolvedAt: Date.now(),
                          },
                        });
                        await postActionDecision({
                          actionId,
                          action,
                          callTimestamp: pendingConfirmation.details?.callTimestamp,
                          decision: 'cancelled',
                          result: 'cancelled-by-user',
                          riskTier: pendingConfirmation.riskTier || 'high-risk-external-send',
                        });
                      }}
                      className="flex-1 bg-neutral-100 text-neutral-700 py-2 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Header - top left */}
              <div className="absolute top-6 left-6 flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-violet-500 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <span className="text-white text-[10px] font-bold">LO</span>
                </button>
              </div>

              {/* Controls - top right */}
              <div className="absolute top-6 right-6 flex items-center gap-1 flex-wrap max-w-[420px] justify-end">
                {['antonio', 'mariana', 'both'].map((p) => (
                  <button
                    key={p}
                    onClick={async () => {
                      try {
                        const needsConsent = p !== 'both';
                        await updateVoiceProfile(p, {
                          userConsent: needsConsent,
                          policyApprovalId: needsConsent ? `manual-approval-${Date.now()}` : null,
                        });
                      } catch (e) {
                        processEvent({ type: UI_EVENT_TYPES.ERROR, payload: { message: String(e?.message || e), recoverable: true } });
                      }
                    }}
                    className={`text-[11px] px-2 py-1 rounded-full border ${voiceConfig?.persona === p ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white/80 text-neutral-700 border-neutral-200'}`}
                    title={`Switch voice to ${p}`}
                  >
                    {p}
                  </button>
                ))}

                <button
                  onClick={() => switchToBrowserFallback()}
                  className={`text-[11px] px-2 py-1 rounded-full border ${voiceMode === 'browser-fallback' ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white/80 border-neutral-200 text-neutral-700'}`}
                  title="Enable browser speech fallback"
                >
                  Browser fallback
                </button>

                {/* TTS toggle */}
                <button
                  onClick={() => {
                    setTtsEnabled((prev) => {
                      const next = !prev;
                      if (!next) window.speechSynthesis?.cancel?.();
                      return next;
                    });
                  }}
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/40 transition-colors"
                  title={ttsEnabled ? "Voice playback: on" : "Voice playback: off"}
                >
                  {ttsEnabled ? (
                    <Volume2 className="w-4 h-4 text-neutral-500" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-neutral-400" />
                  )}
                </button>

                {/* Memory toggle */}
                <button
                  onClick={() => setShowMemory(!showMemory)}
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/40 transition-colors"
                >
                  <Brain className="w-4 h-4 text-neutral-500" />
                </button>
              </div>

              {/* Floating Modules from backend events */}
              <AnimatePresence>
                {floatingModules.map((module) => (
                  <FloatingModule
                    key={module.id}
                    title={module.type === "cv" ? "Your CV" : module.type === "interview" ? "Interview Prep" : module.type === "outreach" ? "Outreach" : "Module"}
                    position={module.position}
                    onClose={() => closeModule(module.id)}
                    onMove={(pos) => updateModulePosition(module.id, pos)}
                  >
                    {renderModule(module.type, {
                      data: module.data,
                      deliverable: deliverables.find(d => d.type === module.type),
                      onAction: handleModuleAction,
                    })}
                  </FloatingModule>
                ))}
              </AnimatePresence>

              {/* Input */}
              <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-8 pb-6 px-4 z-20">
                <UnifiedInput
                  onSend={handleSend}
                  disabled={isStreaming}
                  onInterim={setVoiceCaption}
                  onListeningChange={setIsVoiceActive}
                  placeholder={voiceMode === 'browser-fallback' ? 'Type or speak your message…' : 'Type your message…'}
                  enableSpeech={voiceMode === 'browser-fallback'}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
