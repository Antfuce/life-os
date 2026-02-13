import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import TypingIndicator from "../components/chat/TypingIndicator";

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
  const [contextUsedList, setContextUsedList] = useState([]);
  const [showDebug, setShowDebug] = useState(false); // Debug mode toggle
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

  const getRelevantMemories = async (userMessage) => {
    const allMemories = await base44.entities.UserMemory.list("-created_date", 100);
    
    // Semantic keyword matching for contextual relevance
    const msg = userMessage.toLowerCase();
    
    // Define memory relevance keywords
    const categoryPatterns = {
      career: /career|job|work|role|salary|skill|interview|cv|resume|experience|company|apply|position|promotion|raise|negotiat/,
      lifestyle: /lifestyle|hobby|interest|hobby|exercise|health|wellness|routine|daily|habit|balance|life|personal|free.time/,
      social: /friend|social|community|network|event|meet|connection|relationship|friend|contact|people|introduce|gathering|club/,
      travel: /travel|trip|destination|visit|location|country|city|abroad|vacation|passport|flight/
    };
    
    // Score memories by relevance to current message
    const scoredMemories = allMemories.map(memory => {
      let score = 0;
      
      // Category match
      if (categoryPatterns.career.test(msg)) score += memory.category === 'career' ? 50 : 0;
      if (categoryPatterns.social.test(msg)) score += memory.category === 'social' ? 50 : 0;
      if (categoryPatterns.lifestyle.test(msg)) score += memory.category === 'lifestyle' ? 50 : 0;
      if (categoryPatterns.travel.test(msg)) score += memory.category === 'travel' ? 50 : 0;
      
      // Key/value substring matching
      const keyLower = memory.key.toLowerCase();
      const valueLower = memory.value.toLowerCase();
      
      // Check if memory key/value appears in message
      if (msg.includes(keyLower)) score += 30;
      if (valueLower.split(' ').some(word => msg.includes(word) && word.length > 3)) score += 15;
      
      // Completeness check (full & specific = high confidence)
      const isComplete = valueLower.length > 10 && !/^(yes|no|maybe|unknown|not.sure|to.be.determined|tbd|n\/a|-|_)$/i.test(valueLower);
      memory.is_incomplete = !isComplete;
      memory.confidence = isComplete ? 95 : 30;
      
      return { ...memory, relevance_score: score };
    });
    
    // Return top 15 relevant memories, sorted by score
    return scoredMemories
      .filter(m => m.relevance_score > 0)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 15);
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

  // Helper to suggest specific clarification questions
  const getProbeHint = (memoryKey) => {
    const hints = {
      "achievement": "metrics, numbers, or impact?",
      "responsibility": "scope or team size?",
      "duration": "exact timeline?",
      "skill": "proficiency level or examples?",
      "goal": "specific target or metrics?",
      "location": "exact city/country?",
      "experience": "projects or outcomes?",
      "interest": "specific focus or depth?",
    };
    
    for (const [key, hint] of Object.entries(hints)) {
      if (memoryKey.toLowerCase().includes(key)) return hint;
    }
    return "specifics?";
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
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    // Assess context confidence to avoid re-asking known facts
    const contextConfidence = assessContextConfidence(relevantMemories);
    const highConfidenceKeys = Object.keys(contextConfidence);

    // Format memories with confidence indicators
    const memoryContext = relevantMemories.length > 0
      ? relevantMemories.map(m => {
          const confidence = m.confidence || 30;
          const confidenceFlag = confidence > 90 ? "✓" : confidence > 60 ? "~" : "?";
          const completenessNote = m.is_incomplete ? " [needs detail]" : "";
          return `[${confidenceFlag}] ${m.key}: ${m.value}${completenessNote}`;
        }).join("\n")
      : "No prior context available";

    // Only flag incomplete memories for probing if NOT high-confidence + critical facts
    const incompleteMemories = relevantMemories.filter(m => 
      m.is_incomplete && !highConfidenceKeys.some(k => m.key.toLowerCase().includes(k))
    );

    const lastConvContext = lastConvSummary 
      ? `\n\nLAST CONVERSATION (${new Date(lastConvSummary.timestamp).toLocaleDateString()}):\nSummary: ${lastConvSummary.summary}${lastConvSummary.keyDecisions.length > 0 ? `\nKey decisions: ${lastConvSummary.keyDecisions.join(", ")}` : ""}\nContext: ${JSON.stringify(lastConvSummary.context)}`
      : "";

    const unifiedSystemPrompt = `You are Antonio & Mariana — dual advisors for career AND life. You have distinct personalities that blend together:
- **Antonio**: Sharp, strategic, direct, action-oriented energy
- **Mariana**: Calm, thoughtful, supportive, introspective energy

## YOUR ROLE
You intelligently choose which persona (or blend of both) based on the conversation context and user needs:
- **Use Antonio** for: CV building, direct career moves, job search strategies, tactical advice
- **Use Mariana** for: Interview prep, career exploration, deeper career goals, emotional/lifestyle balance
- **Use Both** for: Complex career decisions, major life transitions, or when both perspectives add value

## CRITICAL CONVERSATION RULES
1. Keep chat messages EXTREMELY SHORT — max 2-3 lines. Conversational, like texting a friend. NO long explanations.
2. Use their name naturally (${userName ? `"Hey ${userName},"` : '"Hey,"'}) to personalize every response.
3. Don't describe what data/cards will show — just have a natural conversation. Let structure happen silently.
4. Use what you know about them from memory to personalize and build on previous context.
5. Be dynamic: if they say "hi", be general. If they mention something specific (CV, interview, career goals), address it directly.
6. ${isFirstMessage && lastConvSummary ? "Reference the last conversation naturally (e.g., 'Last time we...'), then transition to today. Keep it warm and human." : "Continue naturally from where you left off."}

## WHAT YOU KNOW ABOUT THE USER
${memoryContext}

## CONTEXT CONFIDENCE & MEMORY INJECTION
You have HIGH CONFIDENCE in these facts (do NOT re-ask): ${highConfidenceKeys.length > 0 ? highConfidenceKeys.join(", ") : "none yet"}
${incompleteMemories.length > 0 ? `\nYou should DEEPEN these incomplete memories ONLY IF relevant to current message:\n${incompleteMemories.map(m => `- ${m.key}: "${m.value}" → need specifics like: ${getProbeHint(m.key)}`).join("\n")}` : "\nAll relevant memories are well-established. Do NOT re-ask basic facts."}

## CRITICAL: INTELLIGENT FOLLOW-UP RULES
1. If context confidence is HIGH on key facts (name, role, company, years), DO NOT re-ask them
2. Only probe for incomplete memories if:
   - The information is relevant to WHAT THE USER JUST ASKED
   - You don't have enough detail to move forward
   - Your next output requires that information
3. Avoid generic "what else?" or "any other achievements?" — ask specific, unblocking questions
4. Examples of GOOD probes: "What was the impact?" "By how much?" "Timeline?" "Quantify that?"
5. Examples of BAD probes: "Tell me more" / "Any other details?" / "Anything else?"

## CONVERSATION SO FAR
${chatHistory}${lastConvContext}

## RESPONSE FORMAT
Return ONLY valid JSON (no markdown, no extra text) with this exact structure:
{
  "chat_message": "Your short response here (2-3 lines max)",
  "persona": "antonio" | "mariana" | "both",
  "intent": "cv_building" | "interview_prep" | "career_path" | "job_search" | "networking" | "social" | "travel" | "general",
  "context_used": ["name", "current_role", "company"],
  "memories": [{"category": "career|lifestyle|travel|social", "key": "memory_key", "value": "memory_value"}],
  "cv_data": {optional CV fields to update},
  "interview_questions": [{question, tip, followup}],
  "career_path": [{role, timeframe, description, skills, experience, isCurrent, learningResources, skillBuildingTips}]
}

GUIDANCE:
- chat_message: 2-3 lines max. Feel natural & smart, not scripted.
- context_used: List which memories you actually used to craft this response (shows transparency)
- ONLY include memories/cv_data if you're adding NEW information, not just confirming
- Persona assignment: Choose based on their actual need, not templated rules`;

    const responseSchema = {
      type: "object",
      properties: {
        chat_message: {
          type: "string",
          description: "Short conversational response (2-3 lines max)"
        },
        persona: {
          type: "string",
          enum: ["antonio", "mariana", "both"]
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
        context_used: {
          type: "array",
          items: { type: "string" },
          description: "List of memory keys you actually used to generate this response (transparency)"
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
      required: ["chat_message", "persona", "intent"]
    };

    const res = await base44.integrations.Core.InvokeLLM({ 
      prompt: unifiedSystemPrompt,
      response_json_schema: responseSchema
    });

    const response = res;
    const intent = response.intent;
    const content = response.chat_message;
    const selectedPersona = response.persona || "both";
    
    // Track what context was used (for transparency/debugging)
    if (response.context_used) {
      setContextUsedList(response.context_used);
    }

    // Route to appropriate mode
    let newMode = activeMode;
    if (intent === "cv_building") {
      newMode = "cv";
    } else if (intent === "interview_prep") {
      newMode = "interview";
    } else if (intent === "career_path") {
      newMode = "career_path";
    } else if (intent === "job_search" || intent === "networking") {
      const modes = ["cv", "interview", "career_path"];
      newMode = modes[Math.floor(Math.random() * modes.length)];
    } else if (activeMode && intent === "general") {
      newMode = null;
    }
    
    setActiveMode(newMode);
    setPersona(selectedPersona);

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
                  {persona === "both" ? "Antonio & Mariana" : persona ? persona.charAt(0).toUpperCase() + persona.slice(1) : "Antonio & Mariana"}
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