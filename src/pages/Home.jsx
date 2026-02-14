import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Volume2, VolumeX } from "lucide-react";

import MessageBubble from "../components/chat/MessageBubble";
import UnifiedInput from "../components/chat/UnifiedInput";
import PersonaSelector from "../components/chat/PersonaSelector";
import WhisperCaption from "../components/chat/WhisperCaption";
import ContextPanel from "../components/chat/ContextPanel";
import LiveCVPreview from "../components/cv/LiveCVPreview";
import InlineCVPreview from "../components/cv/InlineCVPreview";
import LiveInterviewPrep from "../components/interview/LiveInterviewPrep";
import FloatingHints from "../components/chat/FloatingHints";
import WhisperResponse from "../components/voice/WhisperResponse";
import AvatarWithWaves from "../components/voice/AvatarWithWaves";
import FloatingModule from "../components/voice/FloatingModule";

const SYSTEM_PROMPTS = {
  // The backend owns the real system prompt; this is kept for UX copy/routing only.
  antonio: `Antonio — sharp, strategic, direct.`,
  mariana: `Mariana — calm, structured, thoughtful.`,
  both: `Antonio & Mariana — blended strategy + support.`,
};

const WELCOME_MESSAGES = {
  antonio: "What's the move? Give me your situation and target — I'll map the fastest route.",
  mariana: "Welcome. Tell me what's going on — we'll slow it down and get clarity.",
  both: "Hey — we're Antonio & Mariana. Tell us what's going on, and we'll make the next move.",
};

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [persona, setPersona] = useState("both");
  const [memories, setMemories] = useState([]);
  const [showMemory, setShowMemory] = useState(false);
  const [deliverables, setDeliverables] = useState([]);
  const [whisper, setWhisper] = useState(""); // assistant streaming caption
  const [voiceCaption, setVoiceCaption] = useState(""); // user interim caption
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [activeMode, setActiveMode] = useState(null); // 'cv', 'interview', 'trip', etc.
  const [cvData, setCvData] = useState({});
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [floatingModules, setFloatingModules] = useState([]); // Array of { id, type, data, position }
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Local-only beta: start empty (DB comes next)
    setMemories([]);
    setDeliverables([]);

    // Show hint after a few seconds
    const hintTimer = setTimeout(() => setShowHint(true), 8000);
    return () => clearTimeout(hintTimer);
  }, []);

  // Spawn modules when a mode activates.
  useEffect(() => {
    if (!activeMode) return;

    if (activeMode === "cv") {
      setFloatingModules((prev) => {
        if (prev.some((m) => m.type === "cv")) return prev;
        return [
          ...prev,
          { id: `${Date.now()}-cv`, type: "cv", position: { x: 100, y: 100 }, data: {} },
        ];
      });
    }

    if (activeMode === "interview") {
      setFloatingModules((prev) => {
        if (prev.some((m) => m.type === "interview")) return prev;
        return [
          ...prev,
          { id: `${Date.now()}-interview`, type: "interview", position: { x: 120, y: 120 }, data: {} },
        ];
      });
    }
  }, [activeMode]);

  const speak = (text) => {
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
  };

  const startConversation = async (initialText) => {
    const isCVMode = initialText && /\b(cv|resume|curriculum|experience|job|career)\b/i.test(initialText);
    const id = `${Date.now()}`;

    const welcomeMsg = {
      role: "assistant",
      content: isCVMode
        ? "Let's build your CV together. First: what's your full name and current role?"
        : WELCOME_MESSAGES[persona],
      persona,
      timestamp: new Date().toISOString(),
    };

    setConversationId(id);
    setMessages([welcomeMsg]);
    setActiveMode(isCVMode ? "cv" : null);
    setHasStarted(true);

    if (initialText) {
      setTimeout(() => handleSendInner([welcomeMsg], initialText, id), 50);
    }
  };

  const handleSend = async (text) => {
    const t = (text ?? "").trim();

    // "Mic tap" on landing sends empty string today - treat that as "start voice room".
    if (!hasStarted) {
      await startConversation(t);
      if (!t) {
        setIsVoiceActive(true);
      }
      return;
    }

    if (!t) return;
    handleSendInner(messages, t, conversationId);
  };

  const handleSendInner = async (currentMessages, text, convId) => {
    const userMsg = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...currentMessages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);
    setWhisper("thinking...");
    setVoiceCaption("");

    const chatHistory = newMessages
      .map((m) => `${m.role === "user" ? "User" : persona === "both" ? "Antonio & Mariana" : persona}: ${m.content}`)
      .join("\n\n");

    const prompt = `${SYSTEM_PROMPTS[persona]}

CONVERSATION SO FAR:
${chatHistory}

Respond as ${persona === "both" ? "Antonio & Mariana together" : persona}. Be concise. If you detect career details (current role, target role, skills, salary, location), mention them naturally. If you have enough context to help, suggest creating a deliverable (CV, outreach email, cover letter, interview prep).

CRITICAL: At the start of your response, classify the conversation intent:
[INTENT:category] where category is one of: cv_building, interview_prep, job_search, networking, social, travel, general

USER CONTEXT:
Current Role: ${memories.find(m => m.key === 'current_role')?.value || 'Not specified'}
Target Role: ${memories.find(m => m.key === 'target_role')?.value || 'Not specified'}
Key Skills: ${memories.find(m => m.key === 'skills')?.value || 'Not specified'}

Then, at the end of your response, output any extracted data in this exact format (only include lines where you found new info):
[MEMORY:current_role=value]
[MEMORY:target_role=value]
[MEMORY:skills=value1, value2]
[MEMORY:salary_range=value]
[MEMORY:location_preference=value]
[MEMORY:social_interests=value]
[MEMORY:social_goals=value]
[MEMORY:desired_connections=value]
[MEMORY:preferred_communities=value]

If user is building a CV (intent: cv_building):
[CV:name=value]
[CV:email=value]
[CV:phone=value]
[CV:location=value]
[CV:summary=value]
[CV:experience={"title":"Job Title","company":"Company Name","duration":"2020-2023","description":"What you did"}]
[CV:education={"degree":"Degree","institution":"University","year":"2020"}]
[CV:skills=skill1, skill2, skill3]

If user is preparing for interview (intent: interview_prep):
Generate 3-5 tailored interview questions based on their CV and target role. Include behavioral, technical, and situational questions.
Format: [INTERVIEW:question=Your specific question here]
[INTERVIEW:tip=Specific tip for answering this question based on their background]
[INTERVIEW:followup=Potential follow-up question interviewer might ask]

For mock interview mode, also include:
[INTERVIEW:scenario=Brief scenario setup for the mock interview]`;

    const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "";
    const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // Create a placeholder assistant message and stream into it.
    // Backend will emit a speaker event to update persona; start with selected persona.
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        persona,
        timestamp: new Date().toISOString(),
      },
    ]);

    async function runNonStreamingFallback() {
      const r = await fetch(`${API_ORIGIN}/v1/chat/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: convId,
          persona,
          messages: newMessages,
          cvData,
        }),
      });

      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || 'Engine error');
      return { text: String(j.text || ''), speaker: j.speaker };
    }

    let content = '';

    try {
      const r = await fetch(`${API_ORIGIN}/v1/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: convId,
          persona,
          messages: newMessages,
          cvData,
        }),
      });

      if (!r.ok || !r.body) {
        const fb = await runNonStreamingFallback();
        content = fb.text;
        if (fb.speaker) {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, persona: String(fb.speaker) } : m)));
        }
      } else {
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

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });

          let sep;
          while ((sep = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const { ev, data } = parseBlock(block);

            if (ev === 'speaker' && data?.speaker) {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, persona: String(data.speaker) } : m))
              );
            }

            if (ev === 'delta' && data?.text) {
              content += String(data.text);
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)));
              // Voice-mode caption: show tail of the streaming assistant reply.
              setWhisper(content.slice(-140));
            }

            if (ev === 'error') {
              throw new Error(data?.error || 'Stream error');
            }

            if (ev === 'done') {
              // Finished
              break;
            }
          }

          if (buf.includes('event: done')) break;
        }
      }
    } catch (e) {
      // Fallback to non-streaming if streaming fails.
      const fb = await runNonStreamingFallback();
      content = fb.text;
      if (fb.speaker) {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, persona: String(fb.speaker) } : m)));
      }
    }

    // Finalize the message content (after parsing tags etc.) below.
    setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)));

    // Extract intent
    const intentMatch = content.match(/\[INTENT:(\w+)\]/);
    if (intentMatch) {
      const [, intent] = intentMatch;
      content = content.replace(/\[INTENT:\w+\]/g, "").trim();

      // Route to appropriate mode
      if (intent === "cv_building") {
        setActiveMode("cv");
      } else if (intent === "interview_prep") {
        setActiveMode("interview");
      } else if (activeMode && intent === "general") {
        // Close mode if conversation shifts to general
        setActiveMode(null);
      }
    }

    const memoryMatches = content.match(/\[MEMORY:(\w+)=([^\]]+)\]/g);
    const cvMatches = content.match(/\[CV:(\w+)=([^\]]+)\]/g);
    const interviewMatches = content.match(/\[INTERVIEW:(\w+)=([^\]]+)\]/g);

    if (memoryMatches) {
      content = content.replace(/\[MEMORY:\w+=[^\]]+\]/g, "").trim();

      // Update local memory state (DB wiring comes next)
      for (const match of memoryMatches) {
        const [, key, value] = match.match(/\[MEMORY:(\w+)=([^\]]+)\]/);
        const isSocial = ["social_interests", "social_goals", "desired_connections", "preferred_communities"].includes(key);

        setMemories((prev) => {
          const existing = prev.find((m) => m.key === key);
          if (existing && existing.value === value) return prev;
          const without = prev.filter((m) => m.key !== key);
          return [
            ...without,
            {
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              category: isSocial ? "social" : "career",
              key,
              value,
            },
          ];
        });
      }
    }

    if (cvMatches) {
      content = content.replace(/\[CV:\w+=[^\]]+\]/g, "").trim();
      const newCvData = { ...cvData };

      for (const match of cvMatches) {
        const [, key, value] = match.match(/\[CV:(\w+)=([^\]]+)\]/);

        if (key === "experience" || key === "education") {
          try {
            const parsed = JSON.parse(value);
            newCvData[key] = newCvData[key] ? [...newCvData[key], parsed] : [parsed];
          } catch {
            // Skip invalid JSON
          }
        } else if (key === "skills") {
          const skillsArray = value.split(",").map((s) => s.trim());
          newCvData.skills = [...new Set([...(newCvData.skills || []), ...skillsArray])];
        } else {
          newCvData[key] = value;
        }
      }

      setCvData(newCvData);
    }

    if (interviewMatches) {
      content = content.replace(/\[INTERVIEW:\w+=[^\]]+\]/g, "").trim();
      const newQuestions = [];
      let scenario = "";

      for (const match of interviewMatches) {
        const [, key, value] = match.match(/\[INTERVIEW:(\w+)=([^\]]+)\]/);

        if (key === "question") {
          newQuestions.push({ question: value, tip: "", followup: "" });
        } else if (key === "tip" && newQuestions.length > 0) {
          newQuestions[newQuestions.length - 1].tip = value;
        } else if (key === "followup" && newQuestions.length > 0) {
          newQuestions[newQuestions.length - 1].followup = value;
        } else if (key === "scenario") {
          scenario = value;
        }
      }

      if (newQuestions.length > 0) {
        setInterviewQuestions((prev) => [...prev, ...newQuestions]);
      }
    }

    // Update the streamed placeholder message with the final cleaned content.
    setMessages((prev) =>
      // Do not overwrite the speaker set by stream events (speaker persona).
      prev.map((m) => (m.id === assistantId ? { ...m, content } : m))
    );
    setIsLoading(false);
    speak(content);
    // Let WhisperResponse fade out naturally.
    setTimeout(() => setWhisper(""), 2500);

    // Persistence comes next (Postgres). For now, state lives in the session.
  };

  const handleDeliverableClick = (deliverable) => {
    // Future: open deliverable detail view
  };

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-b from-stone-50 via-neutral-50 to-stone-100">
      {/* Subtle background texture */}
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
                  <span className="text-white text-lg font-bold tracking-tight">A·M</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-light text-neutral-800 tracking-tight mb-4">
                  Antonio & Mariana
                </h1>
                <p className="text-neutral-400 text-sm tracking-[0.15em] uppercase font-medium">
                  Matchmakers for work & life
                </p>
                <p className="text-neutral-500 text-xs mt-3">
                  Running mode: <span className="font-medium">Executor</span>
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="mb-8"
              >
                <PersonaSelector active={persona} onChange={setPersona} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="w-full max-w-2xl px-4"
              >
                <UnifiedInput onSend={handleSend} disabled={isLoading} />
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
                    <AvatarHint
                      persona="both"
                      text="We can help with career moves, but also social life - making friends, finding communities, networking events. Just ask."
                      visible={true}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice Mode State */}
        <AnimatePresence mode="wait">
          {hasStarted && (
            <motion.div
              key="voice"
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

              {/* Whisper Response - fading text (assistant tail) */}
              <AnimatePresence>
                {whisper && <WhisperResponse text={whisper} visible={!!whisper} />}
              </AnimatePresence>

              {/* Central Avatar with Waves */}
              <div className="flex-1 flex items-center justify-center">
                <AvatarWithWaves persona={persona} isActive={isVoiceActive} />
              </div>

              {/* Message feed (so voice mode isn't blind) */}
              <div className="absolute bottom-28 left-0 right-0 px-6 overflow-y-auto max-h-[60vh]">
                <div className="max-w-2xl mx-auto space-y-3">
                  {(() => {
                    const feed = messages.slice(-6);
                    return feed.map((m, idx) => (
                      <MessageBubble key={m.id || idx} message={m} isLast={idx === feed.length - 1} />
                    ));
                  })()}
                  {/* Inline CV progress */}
                  {cvData.name && (
                    <InlineCVPreview
                      cvData={cvData}
                      onExpand={() => setActiveMode("cv")}
                    />
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Memory Panel */}
              <ContextPanel
                memories={memories}
                visible={showMemory}
                onClose={() => setShowMemory(false)}
              />

              {/* Header - top left */}
              <div className="absolute top-6 left-6 flex items-center gap-3">
                <button
                  onClick={() => {
                    setHasStarted(false);
                    setIsVoiceActive(false);
                    setVoiceCaption("");
                    setWhisper("");
                    setMessages([]);
                    setConversationId(null);
                    setActiveMode(null);
                    setFloatingModules([]);
                    setCvData({});
                    setInterviewQuestions([]);
                    setShowMemory(false);
                  }}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-violet-500 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <span className="text-white text-[10px] font-bold">A·M</span>
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
                  title={showMemory ? "Hide memory" : "Show memory"}
                >
                  <Brain className="w-4 h-4 text-neutral-500" />
                  {memories.length > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-500" />
                  )}
                </button>
              </div>

              {/* Floating Modules */}
              <AnimatePresence>
                {floatingModules.map((module) => (
                  <FloatingModule
                    key={module.id}
                    title={module.type === "cv" ? "Your CV" : module.type === "interview" ? "Interview Prep" : "Module"}
                    position={module.position}
                    onClose={() => setFloatingModules((prev) => prev.filter((m) => m.id !== module.id))}
                  >
                    {module.type === "cv" && <LiveCVPreview cvData={cvData} onDownload={() => {}} />}
                    {module.type === "interview" && <LiveInterviewPrep questions={interviewQuestions} onClose={() => setFloatingModules((prev) => prev.filter((m) => m.id !== module.id))} />}
                  </FloatingModule>
                ))}
              </AnimatePresence>

              {/* Unified Input - always text + optional mic */}
              <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-8 pb-6 px-4 z-20">
                <UnifiedInput
                  onSend={(t) => {
                    setVoiceCaption("");
                    handleSend(t);
                  }}
                  disabled={isLoading}
                  onInterim={(t) => setVoiceCaption(t)}
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