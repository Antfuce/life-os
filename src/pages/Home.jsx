import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import TypingIndicator from "../components/chat/TypingIndicator";
import PersonaSelector from "../components/chat/PersonaSelector";
import WhisperCaption from "../components/chat/WhisperCaption";
import ContextPanel from "../components/chat/ContextPanel";
import DeliverableCard from "../components/deliverables/DeliverableCard";
import AvatarHint from "../components/chat/AvatarHint";
import LiveCVPreview from "../components/cv/LiveCVPreview";
import LiveInterviewPrep from "../components/interview/LiveInterviewPrep";
import CareerPathVisualization from "../components/career/CareerPathVisualization";
import FloatingHints from "../components/chat/FloatingHints";

const SYSTEM_PROMPTS = {
  antonio: `You are Antonio — a sharp, strategic, direct career advisor and life matchmaker. You speak with high energy and confidence. CRITICAL: Keep chat messages EXTREMELY SHORT — max 2-3 lines, conversational, like texting a friend. Never dump long explanations in chat. Instead, generate structured data (CV, interview questions, career paths, learning resources) that will appear as visual cards on the side. You help users with career moves AND social connections. Always extract and remember key details: career (current role, target role, skills, salary, location) AND social (interests, hobbies, desired connections, social goals). If the user's first message is general or vague, use the stored user memory to personalize your greeting and start a relevant conversation based on what you know about them.`,
  mariana: `You are Mariana — a calm, structured, thoughtful career guide and life strategist. You speak with warmth and support. CRITICAL: Keep chat messages EXTREMELY SHORT — max 2-3 lines, conversational, like texting a friend. Never dump long explanations in chat. Instead, generate structured data (CV, interview questions, career paths, learning resources) that will appear as visual cards on the side. You help users explore their deeper motivations in BOTH career and social life. Always extract and remember key details about career AND social preferences. If the user's first message is general or vague, use the stored user memory to personalize your greeting and start a relevant conversation based on what you know about them.`,
  both: `You are Antonio & Mariana — dual advisors for career AND life. Antonio is sharp, strategic, and action-oriented. Mariana is calm, thoughtful, and supportive. CRITICAL: Keep chat messages EXTREMELY SHORT — max 2-3 lines total, conversational, natural, like texting. Never explain everything in chat. Instead, generate structured data (career paths, interview prep, CV, learning resources) using the special format tags that will display as visual cards on the side. Blend both energies — be direct yet empathetic. Help users with career transitions AND social connections. Always extract and remember key details about BOTH career and social life. If the user's first message is general or vague, use the stored user memory to personalize your greeting and start a relevant conversation based on what you know about them.`,
};

const WELCOME_MESSAGES = {
  antonio: "What's the move? Career, connections, whatever — tell me where you are and where you want to be. I'll map the fastest route there.",
  mariana: "Welcome. Take a breath. Tell me what's been on your mind — career, relationships, life. I'm here to listen and help you find clarity.",
  both: "Hey — we're Antonio & Mariana. Think of us as your matchmakers for work and life. Tell us what's going on, and we'll figure out the best move together.",
};

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [persona, setPersona] = useState(null); // Dynamically set by intent
  const [memories, setMemories] = useState([]);
  const [showMemory, setShowMemory] = useState(false);
  const [deliverables, setDeliverables] = useState([]);
  const [whisper, setWhisper] = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [activeMode, setActiveMode] = useState(null); // 'cv', 'interview', 'career_path', etc.
  const [cvData, setCvData] = useState({});
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [careerPathData, setCareerPathData] = useState([]);
  const [agentConversationId, setAgentConversationId] = useState(null);
  const [candidateId, setCandidateId] = useState(null);
  const [voiceMode, setVoiceMode] = useState(true); // Voice-first by default
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userName, setUserName] = useState(null); // User's full name for personalization
  const messagesEndRef = useRef(null);

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
      initializeCandidate();
    };
    
    initializeApp();
    
    // Show hint after a few seconds
    const hintTimer = setTimeout(() => setShowHint(true), 8000);
    return () => clearTimeout(hintTimer);
  }, []);

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
    const candidate = await base44.entities.Candidate.filter({ id: candidateId });
    if (candidate[0]) {
      setCvData(candidate[0].cv_data || {});
    }
  };

  const startConversation = async (initialText) => {
    // Check if this is CV building mode based on initial text
    const isCVMode = initialText && /\b(cv|resume|curriculum|experience|job|career)\b/i.test(initialText);

    if (isCVMode) {
      // Use agent for CV building
      const agentConv = await base44.agents.createConversation({
        agent_name: "antonio_mariana_cv",
        metadata: { name: "CV Building Session" },
      });
      
      // Set all state at once, then trigger transition
      setAgentConversationId(agentConv.id);
      setMessages([]);
      setActiveMode("cv");
      setHasStarted(true);

      if (initialText) {
        setTimeout(() => handleAgentSend(agentConv, initialText), 100);
      }
    } else {
      // Use regular conversation for other topics
      const conv = await base44.entities.Conversation.create({
        title: "New conversation",
        persona,
        status: "active",
        messages: [],
      });

      // Set all state at once, then trigger transition
      setConversationId(conv.id);
      setMessages([]);
      setHasStarted(true);

      if (initialText) {
        setTimeout(() => handleSendInner([], initialText, conv.id), 100);
      }
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

  const getRelevantMemories = async (userMessage) => {
    const allMemories = await base44.entities.UserMemory.list("-created_date", 50);
    
    // Simple keyword-based filtering for relevant memories
    const keywords = userMessage.toLowerCase();
    const isCareerTopic = /career|job|work|role|salary|skill|interview|cv|resume/.test(keywords);
    const isSocialTopic = /friend|social|community|network|event|meet/.test(keywords);
    
    if (isCareerTopic) {
      return allMemories.filter(m => m.category === 'career');
    } else if (isSocialTopic) {
      return allMemories.filter(m => m.category === 'social');
    }
    
    // Return all if unclear
    return allMemories.slice(0, 10);
  };

  const getLastConversationSummary = async () => {
    const conversations = await base44.entities.Conversation.list("-updated_date", 5);
    if (conversations.length === 0) return null;
    
    const lastConv = conversations[0];
    if (!lastConv.messages || lastConv.messages.length === 0) return null;
    
    return {
      summary: lastConv.summary || "Previous conversation (no summary available)",
      keyDecisions: lastConv.key_decisions || [],
      timestamp: lastConv.updated_date,
      context: lastConv.context_extracted || {}
    };
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

    // Get relevant memories dynamically
    const relevantMemories = await getRelevantMemories(text);

    // Get last conversation summary (only for first message in new conversation)
    const isFirstMessage = newMessages.length === 1;
    const lastConvSummary = isFirstMessage ? await getLastConversationSummary() : null;

    // Build condensed chat history (last 10 messages max)
    const recentMessages = newMessages.slice(-10);
    const chatHistory = recentMessages
      .map((m) => `${m.role === "user" ? "User" : persona === "both" ? "Antonio & Mariana" : persona}: ${m.content}`)
      .join("\n\n");

    const memoryContext = relevantMemories.length > 0
      ? relevantMemories.map(m => `${m.key}: ${m.value}`).join("\n")
      : "No prior context available";

    const lastConvContext = lastConvSummary 
      ? `\n\nLAST CONVERSATION (${new Date(lastConvSummary.timestamp).toLocaleDateString()}):\nSummary: ${lastConvSummary.summary}${lastConvSummary.keyDecisions.length > 0 ? `\nKey decisions: ${lastConvSummary.keyDecisions.join(", ")}` : ""}\nContext: ${JSON.stringify(lastConvSummary.context)}`
      : "";

    const prompt = `${SYSTEM_PROMPTS[persona]}

CONVERSATION SO FAR:
${chatHistory}

USER'S NAME: ${userName || "Friend"}

WHAT YOU KNOW ABOUT THE USER:
${memoryContext}${lastConvContext}

Respond as ${persona === "both" ? "Antonio & Mariana together" : persona}.

CRITICAL RULES:
1. ${isFirstMessage && lastConvSummary ? "START by referencing the last conversation naturally (e.g., 'Last time we were working on...'), add a human thought about it, then transition to addressing today's message. Keep it conversational and natural." : "Continue the conversation naturally."}
2. Use their name naturally in messages (e.g., "Hey ${userName || "there"}," or references to them by name).
3. Chat message must be MAX 2-3 LINES (or 4 lines if recalling last conversation). Short, conversational, human. Like texting. NO long explanations.
4. Don't describe what the cards will show — just have a natural conversation.
5. Use what you know about the user to personalize your response.
6. Be dynamic — if user says 'hi', be general. If they mention a specific topic, address it directly.
7. Return structured data in the JSON format specified below.`;

    const responseSchema = {
      type: "object",
      properties: {
        chat_message: {
          type: "string",
          description: "Short conversational response (2-3 lines max)"
        },
        intent: {
          type: "string",
          enum: ["cv_building", "interview_prep", "career_path", "job_search", "networking", "social", "travel", "general"]
        },
        memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: ["career", "lifestyle", "travel", "social"] },
              key: { type: "string" },
              value: { type: "string" }
            }
          }
        },
        cv_data: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            location: { type: "string" },
            summary: { type: "string" },
            experience: { type: "array", items: { type: "object" } },
            education: { type: "array", items: { type: "object" } },
            skills: { type: "array", items: { type: "string" } }
          }
        },
        interview_questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              tip: { type: "string" },
              followup: { type: "string" }
            }
          }
        },
        career_path: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string" },
              timeframe: { type: "string" },
              description: { type: "string" },
              skills: { type: "array", items: { type: "string" } },
              experience: { type: "string" },
              isCurrent: { type: "boolean" },
              learningResources: { type: "array", items: { type: "object" } },
              skillBuildingTips: { type: "string" }
            }
          }
        }
      },
      required: ["chat_message", "intent"]
    };

    const res = await base44.integrations.Core.InvokeLLM({ 
      prompt,
      response_json_schema: responseSchema
    });

    const response = res;
    // Process structured response
    const intent = response.intent;
    const content = response.chat_message;

    // Route to appropriate mode
    const modes = ["cv", "interview", "career_path"];
    
    if (intent === "cv_building") {
      setActiveMode("cv");
    } else if (intent === "interview_prep") {
      setActiveMode("interview");
    } else if (intent === "career_path") {
      setActiveMode("career_path");
    } else if (intent === "job_search" || intent === "networking") {
      const randomMode = modes[Math.floor(Math.random() * modes.length)];
      setActiveMode(randomMode);
    } else if (activeMode && intent === "general") {
      setActiveMode(null);
    }

    // Save memories
    if (response.memories && response.memories.length > 0) {
      for (const mem of response.memories) {
        const existing = relevantMemories.find((m) => m.key === mem.key);
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
    if (response.cv_data && Object.keys(response.cv_data).length > 0) {
      setCvData(prev => ({ ...prev, ...response.cv_data }));
    }

    // Add interview questions
    if (response.interview_questions && response.interview_questions.length > 0) {
      setInterviewQuestions((prev) => [...prev, ...response.interview_questions]);
    }

    // Update career path
    if (response.career_path && response.career_path.length > 0) {
      setCareerPathData(response.career_path);
    }

    const assistantMsg = {
      role: "assistant",
      content,
      persona,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...newMessages, assistantMsg];
    setMessages(updatedMessages);
    setIsLoading(false);
    setWhisper("");

    if (convId) {
      await base44.entities.Conversation.update(convId, {
        messages: updatedMessages,
      });

      // Generate summary after every 6 messages (3 exchanges)
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
                  {persona === "both" ? "Antonio & Mariana" : persona.charAt(0).toUpperCase() + persona.slice(1)}
                </div>
              </div>
              <button
                onClick={() => setShowMemory(!showMemory)}
                className="relative w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/40 transition-colors"
              >
                <Brain className="w-4 h-4 text-neutral-500" />
                {memories.length > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-500" />
                )}
              </button>
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
                {messages.map((msg, i) => (
                  <MessageBubble 
                    key={i} 
                    message={msg} 
                    isLast={i === messages.length - 1}
                    onSpeakingChange={setIsSpeaking}
                  />
                ))}

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