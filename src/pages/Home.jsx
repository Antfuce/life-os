import React, { useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Volume2, VolumeX } from "lucide-react";

import { useUIEventReducer, UI_EVENT_TYPES } from "../hooks/useUIEventReducer";
import { renderModule, renderInlineModule, executeModuleAction, getActionMetadata } from "../lib/moduleRegistry";
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

  const messagesEndRef = useRef(null);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [showHint, setShowHint] = React.useState(false);
  const [voiceCaption, setVoiceCaption] = React.useState("");
  const [isVoiceActive, setIsVoiceActive] = React.useState(false);
  const [whisper, setWhisper] = React.useState("");
  const [ttsEnabled, setTtsEnabled] = React.useState(false);
  const [showMemory, setShowMemory] = React.useState(false);
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

    if (!t) return;

    const personaHint = resolvePersonaHint(t);

    // Add user message
    sendMessage(t);
    setVoiceCaption("");
    processEvent({
      type: UI_EVENT_TYPES.SPEAKER_CHANGE,
      payload: { speaker: personaHint },
    });

    // Send to backend
    await streamFromBackend(t, personaHint);
  };

  // Stream from backend with UI event parsing
  const streamFromBackend = async (text, personaHint = 'both') => {
    const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || import.meta.env.VITE_BASE44_APP_BASE_URL || "";
    let latestAssistantText = '';

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
        body: JSON.stringify({
          conversationId,
          persona: personaHint,
          messages: [...messages, { role: 'user', content: text }],
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
        if (!ev) return;

        if (data?.v === '1.0' || data?.type) {
          const structuredType = data.type || ev;
          const structuredPayload = data.payload || data;

          if (structuredType === UI_EVENT_TYPES.TEXT_DELTA) {
            const merged = mergeAssistantText(structuredPayload.fullText || structuredPayload.delta || '');
            if (merged) setWhisper(merged.slice(-140));
          } else if (structuredType === UI_EVENT_TYPES.TEXT_DONE) {
            const merged = mergeAssistantText(structuredPayload.fullText || '');
            if (merged) setWhisper(merged.slice(-140));
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
          setWhisper(merged.slice(-140));
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
        if (done) break;
        buf += dec.decode(value, { stream: true });

        let sep;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          processParsedEvent(parseBlock(block));
        }
      }

      const tail = buf.trim();
      if (tail) {
        processParsedEvent(parseBlock(tail));
      }
    } catch (e) {
      console.error('Stream error:', e);
      processEvent({
        type: UI_EVENT_TYPES.ERROR,
        payload: { message: e.message, recoverable: true },
      });
    }

    if (latestAssistantText) {
      speak(latestAssistantText);
      setTimeout(() => setWhisper(""), 2500);
    }
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
    clearConversation();
    setHasStarted(false);
    setIsVoiceActive(false);
    setVoiceCaption("");
    setWhisper("");
    setShowMemory(false);
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
                <UnifiedInput onSend={handleSend} disabled={isStreaming} />
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
                <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <p className="text-red-600 text-sm">{error.message}</p>
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
              <div className="absolute top-6 left-6 flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-violet-500 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <span className="text-white text-[10px] font-bold">LO</span>
                </button>
              </div>

              {/* Controls - top right */}
              <div className="absolute top-6 right-6 flex items-center gap-1">
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
                  placeholder="Type or speak your message..."
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
