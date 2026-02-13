import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import TypingIndicator from "../components/chat/TypingIndicator";
import { useConversationService } from "../components/chat/useConversationService";
import { detectIntent, selectPersona, selectMode } from "../components/chat/intentDetector";
import { validateAndFixResponse } from "../components/chat/responseValidator";

import WhisperCaption from "../components/chat/WhisperCaption";
import ContextPanel from "../components/chat/ContextPanel";
import ContextUsageDebug from "../components/chat/ContextUsageDebug";
import DeliverableCard from "../components/deliverables/DeliverableCard";
import AvatarHint from "../components/chat/AvatarHint";
import LiveCVPreview from "../components/cv/LiveCVPreview";
import LiveInterviewPrep from "../components/interview/LiveInterviewPrep";
import CareerPathVisualization from "../components/career/CareerPathVisualization";
import FloatingHints from "../components/chat/FloatingHints";





export default function Home() {
  // UI state
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [whisper, setWhisper] = useState("");
  const [showMemory, setShowMemory] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const messagesEndRef = useRef(null);

  // Conversation state
  const [persona, setPersona] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [contextUsedList, setContextUsedList] = useState([]);

  // Content state
  const [activeMode, setActiveMode] = useState(null);
  const [cvData, setCvData] = useState({});
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [careerPathData, setCareerPathData] = useState([]);

  // Data state
  const [memories, setMemories] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [candidateId, setCandidateId] = useState(null);
  const [userName, setUserName] = useState(null);

  // Settings state
  const [voiceMode, setVoiceMode] = useState(true);
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [agentConversationId, setAgentConversationId] = useState(null);

  // Service hook
  const conversationService = useConversationService();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const initializeApp = async () => {
      const user = await base44.auth.me();
      if (user) {
        const firstName = user.full_name.split(' ')[0];
        setUserName(firstName);
      }
      loadMemories();
      loadDeliverables();
      await initializeCandidate();
    };
    
    initializeApp();
    
    // Show hint after a few seconds
    const hintTimer = setTimeout(() => setShowHint(true), 8000);
    return () => clearTimeout(hintTimer);
  }, []);

  // Load candidate data when candidateId changes
  useEffect(() => {
    if (candidateId) {
      loadCandidateData();
    }
  }, [candidateId]);

  useEffect(() => {
    if (!agentConversationId) return;

    const unsubscribe = base44.agents.subscribeToConversation(agentConversationId, (data) => {
      setMessages(data.messages || []);
      
      // Extract CV data from latest assistant message
      const latestMsg = data.messages?.[data.messages.length - 1];
      if (latestMsg?.role === "assistant") {
        loadCandidateData();
      }
    });

    return unsubscribe;
  }, [agentConversationId]);

  const loadMemories = async () => {
    const mems = await base44.entities.UserMemory.list("-created_date", 20);
    setMemories(mems);
  };

  const loadDeliverables = async () => {
    const dels = await base44.entities.Deliverable.list("-created_date", 10);
    setDeliverables(dels);
  };

  const initializeCandidate = async () => {
    const user = await base44.auth.me();
    if (!user) return;

    const candidates = await base44.entities.Candidate.filter({ created_by: user.email });
    if (candidates.length > 0) {
      setCandidateId(candidates[0].id);
      setCvData(candidates[0].cv_data || {});
    } else {
      const newCandidate = await base44.entities.Candidate.create({
        cv_data: { personal: {}, experience: [], education: [], skills: {} },
        cv_version: 1,
      });
      setCandidateId(newCandidate.id);
    }
  };

  const loadCandidateData = async () => {
    if (!candidateId) return;
    const candidates = await base44.entities.Candidate.filter({ id: candidateId });
    if (candidates[0]) {
      setCvData(candidates[0].cv_data || {});
    }
  };

  const sanitizeCvData = (cvData) => {
    // Start with required fields (must always be present)
    const sanitized = {
      personal: {},
      summary: "",
      experience: [],
      education: [],
      skills: []
    };
    
    if (cvData.personal && typeof cvData.personal === 'object') {
      Object.entries(cvData.personal).forEach(([key, val]) => {
        if (typeof val === 'string' && val.trim()) sanitized.personal[key] = val;
      });
    }
    
    if (typeof cvData.summary === 'string' && cvData.summary.trim()) {
      sanitized.summary = cvData.summary;
    }
    
    if (Array.isArray(cvData.experience)) {
      sanitized.experience = cvData.experience.filter(exp => 
        exp && 
        typeof exp.title === 'string' && exp.title.trim() &&
        typeof exp.company === 'string' && exp.company.trim() &&
        typeof exp.start_date === 'string' && exp.start_date.trim()
      );
    }
    
    if (Array.isArray(cvData.education)) {
      sanitized.education = cvData.education.filter(edu =>
        edu &&
        typeof edu.degree === 'string' && edu.degree.trim() &&
        typeof edu.institution === 'string' && edu.institution.trim() &&
        typeof edu.graduation_date === 'string' && edu.graduation_date.trim()
      );
    }
    
    if (Array.isArray(cvData.skills)) {
      sanitized.skills = cvData.skills.filter(skill => typeof skill === 'string' && skill.trim());
    }
    
    if (Array.isArray(cvData.certifications)) {
      sanitized.certifications = cvData.certifications.filter(cert => typeof cert === 'string' && cert.trim());
    }
    
    if (Array.isArray(cvData.languages)) {
      sanitized.languages = cvData.languages.filter(lang => 
        lang && typeof lang.language === 'string' && lang.language.trim()
      );
    }
    
    return sanitized;
  };

  const saveCandidateData = async (updatedCvData) => {
    if (!candidateId) return;
    const sanitized = sanitizeCvData(updatedCvData);
    await base44.entities.Candidate.update(candidateId, {
      cv_data: sanitized,
      last_updated: new Date().toISOString(),
    });
  };

  const startConversation = async (initialText) => {
    // Start with null persona — let LLM decide based on context
    setPersona(null);

    // Create regular conversation — all routing happens in LLM response logic
    const conv = await base44.entities.Conversation.create({
      title: "New conversation",
      persona: null,
      status: "active",
      messages: [],
    });

    setConversationId(conv.id);
    setMessages([]);
    setHasStarted(true);

    if (initialText) {
      setTimeout(() => handleSendInner([], initialText, conv.id), 100);
    }
  };

  const handleSend = async (text) => {
    if (!hasStarted) {
      await startConversation(text);
      return;
    }

    // Route to agent if in CV mode
    if (activeMode === "cv" && agentConversationId) {
      const conversation = await base44.agents.getConversation(agentConversationId);
      await handleAgentSend(conversation, text);
    } else {
      handleSendInner(messages, text, conversationId);
    }
  };

  const handleAgentSend = async (conversation, text) => {
    setIsLoading(true);
    setWhisper("building your cv...");
    
    await base44.agents.addMessage(conversation, {
      role: "user",
      content: text,
    });

    setIsLoading(false);
    setWhisper("");
  };

  // Calculate context confidence for key facts to avoid re-asking
  const assessContextConfidence = (memories) => {
    const criticalKeys = ["name", "age", "current_role", "company", "years_experience"];
    const confidence = {};
    
    criticalKeys.forEach(key => {
      const mem = memories.find(m => m.key.toLowerCase().includes(key.toLowerCase()));
      if (mem && mem.value && mem.value.length > 5) {
        confidence[key] = { value: mem.value, confidence: 95 };
      }
    });
    
    return confidence;
  };





  const generateConversationSummary = async (messages, convId) => {
    if (messages.length < 4) return; // Only summarize after meaningful exchange
    
    const conversationText = messages
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const summaryPrompt = `Analyze this conversation and create a concise summary.

CONVERSATION:
${conversationText}

Generate a summary that captures:
1. Main topic discussed
2. Key decisions or agreements made
3. Any pending actions or next steps
4. Important context to remember for next time

Keep it SHORT and factual (2-3 sentences max).`;

    const summarySchema = {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Concise summary of conversation (2-3 sentences)"
        },
        key_decisions: {
          type: "array",
          items: { type: "string" },
          description: "List of key decisions or action items"
        }
      },
      required: ["summary"]
    };

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: summaryPrompt,
        response_json_schema: summarySchema
      });

      await base44.entities.Conversation.update(convId, {
        summary: result.summary,
        key_decisions: result.key_decisions || []
      });
    } catch (error) {
      console.error("Failed to generate summary:", error);
    }
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

    // DETERMINISTIC: Detect intent from keywords (NOT from LLM)
    const intent = detectIntent(text);
    const selectedPersona = selectPersona(intent);
    const newMode = selectMode(intent);

    // Get data from service
    const relevantMemories = await conversationService.getRelevantMemories(text);
    const userHistory = await conversationService.getUserHistoryContext();

    // Build chat context
    const recentMessages = newMessages.slice(-10);
    const chatHistory = recentMessages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const memoryContext = relevantMemories.length > 0
      ? relevantMemories
          .map(m => `${m.key}: ${m.value}`)
          .join("\n")
      : "No prior context available";

    const userHistoryContext = userHistory 
      ? `\n\nUSER HISTORY:\n${userHistory.history}`
      : "";

    // Build simplified prompt
    const systemPromptToUse = conversationService.buildSystemPrompt(
      userName,
      memoryContext,
      userHistoryContext,
      cvData,
      chatHistory
    );

    const responseSchema = conversationService.buildResponseSchema();

    const res = await base44.integrations.Core.InvokeLLM({ 
      prompt: systemPromptToUse,
      response_json_schema: responseSchema
    });

    // VALIDATE AND FIX LLM response
    const response = validateAndFixResponse(res);
    const content = response.chat_message;

    // Update UI state with DETERMINISTIC intent/persona (not from LLM)
    setActiveMode(newMode);
    setPersona(selectedPersona);

    // Save memories
    if (response.memories && response.memories.length > 0) {
      for (const mem of response.memories) {
        const existing = memories.find((m) => m.key === mem.key);
        if (!existing || existing.value !== mem.value) {
          await base44.entities.UserMemory.create({
            category: mem.category,
            key: mem.key,
            value: mem.value,
            source_conversation_id: convId,
          });
        }
      }
      loadMemories();
    }

    // Update CV data
    if (response.cv_data) {
      const updatedCvData = { ...cvData, ...response.cv_data };
      setCvData(updatedCvData);
      await saveCandidateData(updatedCvData);
    }

    // Add interview questions / career path
    if (response.interview_questions?.length > 0) {
      setInterviewQuestions(response.interview_questions);
    }
    if (response.career_path?.length > 0) {
      setCareerPathData(response.career_path);
    }

    const assistantMsg = {
      role: "assistant",
      content,
      persona: selectedPersona,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...newMessages, assistantMsg];
    setMessages(updatedMessages);
    setIsLoading(false);
    setWhisper("");

    if (convId) {
      await base44.entities.Conversation.update(convId, {
        messages: updatedMessages,
        persona: selectedPersona,
      });

      if (updatedMessages.length % 6 === 0) {
        generateConversationSummary(updatedMessages, convId);
      }
    }
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
              </motion.div>



              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="w-full max-w-lg"
              >
                <ChatInput onSend={handleSend} voiceMode={voiceMode} pauseListening={isSpeaking} />
              </motion.div>
              
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                onClick={() => setVoiceMode(!voiceMode)}
                className="mt-4 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {voiceMode ? "Switch to typing" : "Switch to voice mode"}
              </motion.button>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.8 }}
                className="mt-8"
              >
                <WhisperCaption text="your next chapter starts with a conversation" visible={true} />
              </motion.div>

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
                      text="We can help with career moves, but also social life — making friends, finding communities, networking events. Just ask."
                      visible={true}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat state */}
        <AnimatePresence mode="wait">
          {hasStarted && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex-1 flex flex-col h-full"
            >
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between bg-white/30 backdrop-blur-xl border-b border-white/20">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setHasStarted(false);
                    setMessages([]);
                    setConversationId(null);
                    setAgentConversationId(null);
                    setActiveMode(null);
                    setCvData({});
                    setInterviewQuestions([]);
                  }}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-violet-500 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <span className="text-white text-[10px] font-bold">A·M</span>
                </button>
                <div className="text-xs text-neutral-600 font-medium px-3 py-1.5 rounded-lg bg-white/50">
                  {persona === "both" ? "Antonio & Mariana" : persona ? persona.charAt(0).toUpperCase() + persona.slice(1) : "Antonio & Mariana"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setAiVoiceEnabled(!aiVoiceEnabled)}
                  className={cn(
                    "relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                    aiVoiceEnabled
                      ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                      : "hover:bg-white/40 text-neutral-400"
                  )}
                  title={aiVoiceEnabled ? "AI is speaking (click to mute)" : "AI is muted (click to enable)"}
                >
                  {aiVoiceEnabled ? "🔊" : "🔇"}
                </button>
                <button
                  onClick={() => setShowMemory(!showMemory)}
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/40 transition-colors"
                >
                  <Brain className="w-4 h-4 text-neutral-500" />
                  {memories.length > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-500" />
                  )}
                </button>
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-colors text-xs font-bold",
                    showDebug 
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200" 
                      : "hover:bg-white/40 text-neutral-400"
                  )}
                  title="Toggle context usage debug view"
                >
                  ⚡
                </button>
              </div>
            </div>

            {/* Messages + CV Preview Split */}
            <div className="flex-1 relative flex overflow-hidden">
              <ContextPanel
                memories={memories}
                visible={showMemory}
                onClose={() => setShowMemory(false)}
              />

              {/* Chat Column */}
              <div className={cn("overflow-y-auto px-6 py-8 space-y-6 transition-all", activeMode ? "w-1/2" : "max-w-3xl mx-auto w-full")}>
                {messages.map((msg, i) => {
                  const isLastMsg = i === messages.length - 1;
                  return (
                    <div key={i}>
                      <MessageBubble 
                        message={msg} 
                        isLast={isLastMsg}
                        onSpeakingChange={setIsSpeaking}
                        aiVoiceEnabled={aiVoiceEnabled}
                      />
                      {isLastMsg && msg.role === "assistant" && (
                        <ContextUsageDebug 
                          contextUsed={contextUsedList} 
                          visible={showDebug}
                        />
                      )}
                    </div>
                  );
                })}

                {isLoading && <TypingIndicator persona={persona} />}

                {/* Deliverables surface contextually */}
                {deliverables.length > 0 && messages.length > 3 && !activeMode && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pt-4"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-300 mb-3">
                      Your deliverables
                    </p>
                    <div className="grid gap-2">
                      {deliverables.slice(0, 3).map((d) => (
                        <DeliverableCard key={d.id} deliverable={d} onClick={handleDeliverableClick} />
                      ))}
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Dynamic Side Panel - Fixed */}
              <AnimatePresence mode="wait">
                {activeMode === "cv" && (
                  <motion.div
                    key="cv"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    className="w-1/2 border-l border-neutral-200 flex-shrink-0"
                  >
                    <LiveCVPreview cvData={cvData} onDownload={() => {}} />
                  </motion.div>
                )}
                {activeMode === "interview" && (
                  <motion.div
                    key="interview"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    className="w-1/2 border-l border-neutral-200 flex-shrink-0"
                  >
                    <LiveInterviewPrep 
                      questions={interviewQuestions} 
                      onClose={() => setActiveMode(null)} 
                    />
                  </motion.div>
                )}
                {activeMode === "career_path" && (
                  <motion.div
                    key="career_path"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    className="w-1/2 border-l border-neutral-200 flex-shrink-0"
                  >
                    <CareerPathVisualization 
                      pathData={careerPathData} 
                      onClose={() => setActiveMode(null)} 
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Whisper + Input */}
            <div className="flex-shrink-0 px-6 pb-6 pt-2">
              <WhisperCaption text={whisper} visible={!!whisper} />
              <div className="max-w-3xl mx-auto mt-2">
                <ChatInput onSend={handleSend} disabled={isLoading || isSpeaking} voiceMode={voiceMode} pauseListening={isSpeaking} />
              </div>
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}