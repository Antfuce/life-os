import React, { useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

import { useUIEventReducer, UI_EVENT_TYPES } from "../hooks/useUIEventReducer";
import { renderModule, renderInlineModule, executeModuleAction, getActionMetadata } from "../lib/moduleRegistry";
import MessageBubble from "../components/chat/MessageBubble";
import UnifiedInput from "../components/chat/UnifiedInput";
import WhisperCaption from "../components/chat/WhisperCaption";
import FloatingHints from "../components/chat/FloatingHints";
import WhisperResponse from "../components/voice/WhisperResponse";
import AvatarWithWaves from "../components/voice/AvatarWithWaves";
import FloatingModule from "../components/voice/FloatingModule";
import { isActionApprovalDebugVisible } from "../lib/featureFlags";

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

const WHISPER_HIDE_DELAY_MS = 2500;
const WHISPER_UPDATE_THROTTLE_MS = 120;

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
  } = state;

  const messageFeedRef = useRef(null);
  const streamControlRef = useRef({ requestId: 0, controller: null });
  const whisperHideTimerRef = useRef(null);
  const lastWhisperUpdateAtRef = useRef(0);
  const lastRenderedMessageCountRef = useRef(0);
  const lastTurnRef = useRef(null);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [showHint, setShowHint] = React.useState(false);
  const [voiceCaption, setVoiceCaption] = React.useState("");
  const [isVoiceActive, setIsVoiceActive] = React.useState(false);
  const [whisper, setWhisper] = React.useState("");
  const [ttsEnabled, setTtsEnabled] = React.useState(false);
  const [errorNoticeDismissed, setErrorNoticeDismissed] = React.useState(false);
  const confirmationTimersRef = useRef({});

  const clearConfirmationTimer = useCallback((actionId) => {
    const timerId = confirmationTimersRef.current[actionId];
    if (timerId) {
      clearTimeout(timerId);
      delete confirmationTimersRef.current[actionId];
    }
  }, []);

  const clearWhisperHideTimer = useCallback(() => {
    if (whisperHideTimerRef.current) {
      clearTimeout(whisperHideTimerRef.current);
      whisperHideTimerRef.current = null;
    }
  }, []);

  const updateWhisperPreview = useCallback((text, { force = false } = {}) => {
    const next = String(text || '').trim();
    if (!next) return;

    const now = Date.now();
    if (!force && now - lastWhisperUpdateAtRef.current < WHISPER_UPDATE_THROTTLE_MS) {
      return;
    }

    lastWhisperUpdateAtRef.current = now;
    setWhisper(next.slice(-140));
  }, []);

  useEffect(() => {
    return () => {
      Object.values(confirmationTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      confirmationTimersRef.current = {};
      clearWhisperHideTimer();
      streamControlRef.current.controller?.abort?.();
      streamControlRef.current.controller = null;
    };
  }, [clearWhisperHideTimer]);

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

  useEffect(() => {
    if (error) {
      setErrorNoticeDismissed(false);
    }
  }, [error]);

  // Keep feed pinned near bottom without jitter during streaming
  useEffect(() => {
    const feed = messageFeedRef.current;
    if (!feed) return;

    const rafId = window.requestAnimationFrame(() => {
      const visibleCount = messages.length + (isStreaming && currentMessage ? 1 : 0);
      const hasNewMessage = visibleCount > lastRenderedMessageCountRef.current;
      const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
      const isNearBottom = distanceFromBottom < 140;

      if (isStreaming) {
        feed.scrollTo({ top: feed.scrollHeight, behavior: 'auto' });
      } else if (hasNewMessage && isNearBottom) {
        feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      }

      lastRenderedMessageCountRef.current = visibleCount;
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [messages, currentMessage, isStreaming]);

  // Show hint after delay
  useEffect(() => {
    if (!hasStarted) {
      const hintTimer = setTimeout(() => setShowHint(true), 8000);
      return () => clearTimeout(hintTimer);
    }
  }, [hasStarted]);

  // TTS
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

    // Add welcome message via reducer
    processEvent({
      type: UI_EVENT_TYPES.TEXT_DONE,
      payload: {
        fullText: welcomeMsg.content,
        messageId: id,
        speaker: initialPersona,
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
      await startConversation(t);
      if (!t) {
        setIsVoiceActive(true);
      }
      return;
    }

    if (!t || isStreaming) return;

    clearWhisperHideTimer();
    const personaHint = resolvePersonaHint(t);
    const requestMessages = [...messages, { role: 'user', content: t }];
    lastTurnRef.current = {
      text: t,
      personaHint,
      requestMessages,
      createdAt: Date.now(),
    };

    // Add user message
    sendMessage(t);
    setVoiceCaption("");
    processEvent({
      type: UI_EVENT_TYPES.SPEAKER_CHANGE,
      payload: { speaker: personaHint },
    });

    // Send to backend
    await streamFromBackend(t, personaHint, requestMessages);
  };

  // Stream from backend with UI event parsing
  const streamFromBackend = async (text, personaHint = 'both', requestMessagesOverride = null) => {
    const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || import.meta.env.VITE_BASE44_APP_BASE_URL || "";
    let latestAssistantText = '';

    const previousController = streamControlRef.current.controller;
    previousController?.abort?.();

    const controller = new AbortController();
    const requestId = streamControlRef.current.requestId + 1;
    streamControlRef.current = { requestId, controller };

    const isCurrentStream = () => streamControlRef.current.requestId === requestId;

    const normalizeChunk = (value) => String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const mergeAssistantText = (incoming) => {
      const next = String(incoming || '');
      if (!next) return latestAssistantText;
      if (!latestAssistantText) {
        latestAssistantText = next;
        return latestAssistantText;
      }
      if (next.startsWith(latestAssistantText)) {
        latestAssistantText = next;
        return latestAssistantText;
      }
      latestAssistantText = `${latestAssistantText}${next}`;
      return latestAssistantText;
    };

    try {
      const r = await fetch(`${API_ORIGIN}/v1/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId,
          persona: personaHint,
          messages: requestMessagesOverride || [...messages, { role: 'user', content: text }],
        }),
      });

      if (!r.ok || !r.body) {
        throw new Error('Stream failed');
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      const parseBlock = (block) => {
        const lines = String(block || '').split('\n');
        let ev = null;
        const dataLines = [];
        for (const line of lines) {
          if (line.startsWith('event:')) ev = line.slice('event:'.length).trim();
          if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
        }
        const dataRaw = dataLines.join('\n');
        let data = null;
        try { data = JSON.parse(dataRaw); } catch {}
        return { ev, data };
      };

      const processParsedEvent = ({ ev, data }) => {
        if (!ev || !isCurrentStream()) return;

        if (data?.v === '1.0' || data?.type) {
          const structuredType = data.type || ev;
          const structuredPayload = data.payload || data;

          if (structuredType === UI_EVENT_TYPES.TEXT_DELTA) {
            const merged = mergeAssistantText(structuredPayload.fullText || structuredPayload.delta || '');
            if (merged) updateWhisperPreview(merged);
          } else if (structuredType === UI_EVENT_TYPES.TEXT_DONE) {
            const merged = mergeAssistantText(structuredPayload.fullText || '');
            if (merged) updateWhisperPreview(merged, { force: true });
          }

          processEvent({
            type: structuredType,
            payload: structuredPayload,
          });
          return;
        }

        if (ev === 'delta' && data?.text) {
          const merged = mergeAssistantText(data.text);
          processEvent({
            type: UI_EVENT_TYPES.TEXT_DELTA,
            payload: { delta: data.text },
          });
          updateWhisperPreview(merged);
          return;
        }

        if (ev === 'speaker' && data?.speaker) {
          processEvent({
            type: UI_EVENT_TYPES.SPEAKER_CHANGE,
            payload: { speaker: data.speaker },
          });
          return;
        }

        if (ev === 'done') {
          processEvent({
            type: UI_EVENT_TYPES.DONE,
            payload: data || {},
          });
          return;
        }

        if (ev === 'error') {
          processEvent({
            type: UI_EVENT_TYPES.ERROR,
            payload: { message: data?.error || 'Unknown error' },
          });
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done || !isCurrentStream()) break;

        buf += normalizeChunk(dec.decode(value, { stream: true }));

        let sep;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          processParsedEvent(parseBlock(block));
        }
      }

      if (isCurrentStream()) {
        buf += normalizeChunk(dec.decode());
        const tail = buf.trim();
        if (tail) {
          processParsedEvent(parseBlock(tail));
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;

      console.error('Stream error:', e);
      processEvent({
        type: UI_EVENT_TYPES.ERROR,
        payload: { message: e.message, recoverable: true },
      });
    } finally {
      if (isCurrentStream()) {
        streamControlRef.current.controller = null;
      }
    }

    if (isCurrentStream() && latestAssistantText) {
      speak(latestAssistantText);
      clearWhisperHideTimer();
      whisperHideTimerRef.current = setTimeout(() => setWhisper(""), WHISPER_HIDE_DELAY_MS);
    }
  };

  const handleRetryLastTurn = async () => {
    if (isStreaming) return;
    const lastTurn = lastTurnRef.current;
    if (!lastTurn?.text) return;

    setVoiceCaption('');
    setErrorNoticeDismissed(false);
    await streamFromBackend(lastTurn.text, lastTurn.personaHint || 'both', lastTurn.requestMessages);
  };

  // Handle module action
  const handleModuleAction = (actionName, deliverable) => {
    const actionMeta = getActionMetadata(actionName);
    const callTs = Date.now();

    if (actionMeta.requiresConfirmation) {
      const actionId = `${actionName}-${callTs}`;
      const timeoutMs = 30_000;
      const expiresAt = callTs + timeoutMs;

      processEvent({
        type: UI_EVENT_TYPES.CONFIRM_REQUIRED,
        payload: {
          actionId,
          message: 'Confirm external send. This cannot be undone.',
          details: {
            action: actionName,
            callTimestamp: callTs,
            deliverableId: deliverable?.id,
          },
          riskTier: actionMeta.riskTier,
          timeout: timeoutMs,
          expiresAt,
          onConfirm: 'outreach.send.execute',
          onCancel: 'outreach.send.cancel',
        },
      });

      processEvent({
        type: UI_EVENT_TYPES.ACTION_AUDIT,
        payload: {
          actionId,
          callTimestamp: callTs,
          action: actionName,
          decision: 'pending',
          result: 'awaiting-user-confirmation',
          riskTier: actionMeta.riskTier,
        },
      });

      clearConfirmationTimer(actionId);
      confirmationTimersRef.current[actionId] = setTimeout(() => {
        processEvent({
          type: UI_EVENT_TYPES.ACTION_APPROVAL_STATE,
          payload: {
            actionId,
            state: 'failed',
            decision: 'timed_out',
            result: 'cancelled-on-timeout',
            resolvedAt: Date.now(),
          },
        });
        processEvent({
          type: UI_EVENT_TYPES.ACTION_AUDIT,
          payload: {
            actionId,
            callTimestamp: callTs,
            action: actionName,
            decision: 'timed_out',
            result: 'cancelled-on-timeout',
            riskTier: actionMeta.riskTier,
          },
        });
        postActionDecision({
          actionId,
          action: actionName,
          callTimestamp: callTs,
          riskTier: actionMeta.riskTier,
          decision: 'timed_out',
          result: 'cancelled-on-timeout',
        });
      }, timeoutMs);
      return;
    }

    executeModuleAction(actionName, deliverable, processEvent);
  };


  // Reset conversation
  const handleReset = () => {
    streamControlRef.current.controller?.abort?.();
    streamControlRef.current.controller = null;
    clearWhisperHideTimer();
    lastTurnRef.current = null;
    clearConversation();
    setHasStarted(false);
    setIsVoiceActive(false);
    setVoiceCaption("");
    setWhisper("");
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

  const connectionStatusLabel = error
    ? 'Needs attention'
    : isStreaming
      ? 'Responding'
      : (status?.message ? 'Working' : 'Ready');

  const connectionStatusClass = error
    ? 'text-rose-600 border-rose-200 bg-rose-50/85'
    : isStreaming
      ? 'text-violet-600 border-violet-200 bg-violet-50/85'
      : 'text-emerald-600 border-emerald-200 bg-emerald-50/85';

  return (
    <div className="relative min-h-[100dvh] h-screen overflow-hidden bg-gradient-to-b from-stone-50 via-neutral-50 to-stone-100">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, black 1px, transparent 0)`,
        backgroundSize: "32px 32px"
      }} />

      <div className="relative min-h-[100dvh] h-full flex flex-col">
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
              className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6"
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
                  Productive guidance for career and life execution
                </p>
                <p className="text-neutral-500 text-xs mt-3">
                  Ask in plain language. Get concrete next steps, drafts, and decisions.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="w-full max-w-2xl px-4"
              >
                <UnifiedInput
                  onSend={handleSend}
                  disabled={isStreaming}
                  placeholder="Ask for CV, interview prep, outreach, or a concrete plan..."
                />
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1 }}
                className="mt-6 text-[11px] tracking-[0.15em] uppercase text-neutral-400"
              >
                built for real execution, not ideas only
              </motion.p>

              <p className="mt-2 text-[12px] text-neutral-500 text-center">
                External sends always require your explicit confirmation.
              </p>

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
                      Try: “Build my CV for this role” or “Give me a 7-day interview prep plan”.
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
              className="flex-1 flex flex-col items-center justify-center relative h-full overflow-hidden px-1"
            >
              {/* Voice captions */}
              <div className="absolute top-20 sm:top-24 left-0 right-0 px-4 sm:px-6">
                <div className="max-w-2xl mx-auto">
                  <WhisperCaption text={voiceCaption} visible={!!voiceCaption} />
                </div>
              </div>

              {/* Whisper Response */}
              <AnimatePresence>
                {whisper && <WhisperResponse text={whisper} visible={!!whisper} />}
              </AnimatePresence>

              {/* Status notice */}
              {status?.message && !error && (
                <div className="absolute top-14 sm:top-16 left-1/2 -translate-x-1/2 rounded-full border border-violet-200 bg-white/85 px-3 py-1 text-[11px] text-violet-700 shadow-sm z-10 max-w-[calc(100vw-2rem)] truncate">
                  {status.message}{typeof status.progress === 'number' ? ` · ${status.progress}%` : ''}
                </div>
              )}

              {/* Central Avatar */}
              <div className="flex-1 flex items-center justify-center">
                <AvatarWithWaves persona={currentSpeaker} isActive={isVoiceActive} />
              </div>

              {/* Message feed */}
              <div ref={messageFeedRef} className="absolute bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] sm:bottom-28 left-0 right-0 px-4 sm:px-6 overflow-y-auto max-h-[58vh] sm:max-h-[60vh]">
                <div className="max-w-2xl mx-auto space-y-3">
                  {messages.map((m, idx) => (
                    <MessageBubble
                      key={m.id || idx}
                      message={m}
                      isLast={idx === messages.length - 1}
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

                  {isStreaming && !currentMessage && (
                    <MessageBubble
                      message={{
                        role: 'assistant',
                        content: 'Thinking through the best next step…',
                        persona: currentSpeaker,
                        timestamp: new Date().toISOString(),
                      }}
                      isStreaming={true}
                    />
                  )}

                  {messages.length <= 1 && !isStreaming && (
                    <div className="rounded-2xl border border-white/70 bg-white/75 p-4 text-sm text-neutral-600 shadow-sm">
                      Start with one specific goal and a constraint. Example: “I need a CV for a backend role by Monday.”
                    </div>
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
                </div>
              </div>

              {/* Error display */}
              {error && !errorNoticeDismissed && (
                <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 bg-red-50/95 border border-red-200 rounded-xl px-4 py-3 shadow-sm w-[min(92vw,30rem)] z-20">
                  <p className="text-red-700 text-sm font-medium">Couldn’t complete that response.</p>
                  <p className="text-red-600 text-xs mt-1">{error.message || 'Please try again.'}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleRetryLastTurn}
                      disabled={isStreaming || !lastTurnRef.current?.text}
                      className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs disabled:opacity-50"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => setErrorNoticeDismissed(true)}
                      className="px-3 py-1.5 rounded-md bg-white text-neutral-600 border border-red-100 text-xs"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}


              {/* Approval state summary (debug only) */}
              {isActionApprovalDebugVisible && Object.values(actionApprovals || {}).length > 0 && (
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
                        clearConfirmationTimer(actionId);
                        confirmAction(actionId);
                        processEvent({
                          type: UI_EVENT_TYPES.ACTION_APPROVAL_STATE,
                          payload: {
                            actionId,
                            state: 'approved',
                            decision: 'confirmed',
                            resolvedAt: Date.now(),
                          },
                        });
                        processEvent({
                          type: UI_EVENT_TYPES.ACTION_APPROVAL_STATE,
                          payload: {
                            actionId,
                            state: 'executed',
                            decision: 'confirmed',
                            result: 'executed',
                            resolvedAt: Date.now(),
                          },
                        });
                        processEvent({
                          type: UI_EVENT_TYPES.ACTION_AUDIT,
                          payload: {
                            actionId,
                            callTimestamp: pendingConfirmation.details?.callTimestamp,
                            action,
                            decision: 'confirmed',
                            result: 'executed',
                            riskTier: pendingConfirmation.riskTier || 'high-risk-external-send',
                          },
                        });
                        await postActionDecision({
                          actionId,
                          action,
                          callTimestamp: pendingConfirmation.details?.callTimestamp,
                          decision: 'confirmed',
                          result: 'executed',
                          riskTier: pendingConfirmation.riskTier || 'high-risk-external-send',
                        });
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
                        processEvent({
                          type: UI_EVENT_TYPES.ACTION_AUDIT,
                          payload: {
                            actionId,
                            callTimestamp: pendingConfirmation.details?.callTimestamp,
                            action,
                            decision: 'cancelled',
                            result: 'cancelled-by-user',
                            riskTier: pendingConfirmation.riskTier || 'high-risk-external-send',
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
              <div className="absolute top-4 sm:top-6 left-4 sm:left-6 flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-violet-500 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <span className="text-white text-[10px] font-bold">LO</span>
                </button>
              </div>

              {/* Controls - top right */}
              <div className="absolute top-4 sm:top-6 right-4 sm:right-6 flex items-center gap-2">
                <div className={`px-2.5 py-1 rounded-full border text-[11px] shadow-sm ${connectionStatusClass}`}>
                  {connectionStatusLabel}
                </div>

                {/* TTS toggle */}
                <button
                  onClick={() => {
                    setTtsEnabled((prev) => {
                      const next = !prev;
                      if (!next) window.speechSynthesis?.cancel?.();
                      return next;
                    });
                  }}
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center bg-white/60 hover:bg-white/80 border border-white/70 transition-colors"
                  title={ttsEnabled ? "Voice playback: on" : "Voice playback: off"}
                >
                  {ttsEnabled ? (
                    <Volume2 className="w-4 h-4 text-neutral-600" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-neutral-400" />
                  )}
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
              <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-6 sm:pt-8 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] px-3 sm:px-4 z-20">
                <UnifiedInput
                  onSend={handleSend}
                  disabled={isStreaming}
                  onInterim={setVoiceCaption}
                  onListeningChange={setIsVoiceActive}
                  placeholder="Describe your goal and constraint…"
                />
                <p className="mt-2 text-center text-[11px] text-neutral-400">
                  No auto-send actions. External sends always require confirmation.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
