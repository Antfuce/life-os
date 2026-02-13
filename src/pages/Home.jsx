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
  antonio: `You are Antonio — a sharp, strategic, direct career advisor and life matchmaker. You speak with high energy and confidence. CRITICAL: Keep chat messages EXTREMELY SHORT — max 2-3 lines, conversational, like texting a friend. Never dump long explanations in chat. Instead, generate structured data (CV, interview questions, career paths, learning resources) that will appear as visual cards on the side. You help users with career moves AND social connections. Always extract and remember key details: career (current role, target role, skills, salary, location) AND social (interests, hobbies, desired connections, social goals).`,
  mariana: `You are Mariana — a calm, structured, thoughtful career guide and life strategist. You speak with warmth and support. CRITICAL: Keep chat messages EXTREMELY SHORT — max 2-3 lines, conversational, like texting a friend. Never dump long explanations in chat. Instead, generate structured data (CV, interview questions, career paths, learning resources) that will appear as visual cards on the side. You help users explore their deeper motivations in BOTH career and social life. Always extract and remember key details about career AND social preferences.`,
  both: `You are Antonio & Mariana — dual advisors for career AND life. Antonio is sharp, strategic, and action-oriented. Mariana is calm, thoughtful, and supportive. CRITICAL: Keep chat messages EXTREMELY SHORT — max 2-3 lines total, conversational, natural, like texting. Never explain everything in chat. Instead, generate structured data (career paths, interview prep, CV, learning resources) using the special format tags that will display as visual cards on the side. Blend both energies — be direct yet empathetic. Help users with career transitions AND social connections. Always extract and remember key details about BOTH career and social life.`,
};

const WELCOME_MESSAGES = {
  antonio: "What's the move? Career, connections, whatever — tell me where you are and where you want to be. I'll map the fastest route there.",
  mariana: "Welcome. Take a breath. Tell me what's been on your mind — career, relationships, life. I'm here to listen and help you find clarity.",
  both: "Hey — we're Antonio & Mariana. Think of us as your matchmakers for work and life. Tell us what's going on, and we'll figure out the best move together.",
};

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [persona, setPersona] = useState("both");
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
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    loadMemories();
    loadDeliverables();
    initializeCandidate();
    
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
      
      const welcomeMsg = {
        role: "assistant",
        content: "Let's build your CV together. First things first — what's your full name and current role?",
      };

      // Set all state at once, then trigger transition
      setAgentConversationId(agentConv.id);
      setMessages([welcomeMsg]);
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

      const welcomeMsg = {
        role: "assistant",
        content: WELCOME_MESSAGES[persona],
        persona,
        timestamp: new Date().toISOString(),
      };

      // Set all state at once, then trigger transition
      setConversationId(conv.id);
      setMessages([welcomeMsg]);
      setHasStarted(true);

      if (initialText) {
        setTimeout(() => handleSendInner([welcomeMsg], initialText, conv.id), 100);
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

    const chatHistory = newMessages
      .map((m) => `${m.role === "user" ? "User" : persona === "both" ? "Antonio & Mariana" : persona}: ${m.content}`)
      .join("\n\n");

    const prompt = `${SYSTEM_PROMPTS[persona]}

CONVERSATION SO FAR:
${chatHistory}

Respond as ${persona === "both" ? "Antonio & Mariana together" : persona}.

CRITICAL RULES:
1. Chat message must be MAX 2-3 LINES. Short, conversational, human. Like texting. NO long explanations.
2. Don't describe what the cards will show — just have a natural conversation.
3. Generate structured data separately using the format tags below.

At the start of your response, classify the conversation intent:
[INTENT:category] where category is one of: cv_building, interview_prep, career_path, job_search, networking, social, travel, general

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
[INTERVIEW:scenario=Brief scenario setup for the mock interview]

If user is asking about career progression or future paths (intent: career_path):
Your chat message should be SHORT and conversational (2-3 lines). Don't explain the whole path in text.
Then generate structured roadmap data that will display as visual cards:
[PATH:role=Job Title]
[PATH:timeframe=Expected timeframe (e.g., "1-2 years", "Next 6 months")]
[PATH:description=Brief description of this role and why it's a logical step]
[PATH:skills=skill1, skill2, skill3]
[PATH:experience=What experience or achievements needed for this step]
[PATH:isCurrent=true] (only for their current position)
[PATH:learning_resources=[{"course": "Specific course name", "article": "Platform/link description", "type": "online_course"}]] (JSON array of 2-3 resources)
[PATH:skill_building_tips=Specific actionable advice for developing the required skills]

Remember: Keep chat response SHORT (2-3 lines max). Let the visual cards show the details.`;

    const res = await base44.integrations.Core.InvokeLLM({ prompt });

    let content = res;
    
    // Extract intent
    const intentMatch = content.match(/\[INTENT:(\w+)\]/);
    if (intentMatch) {
      const [, intent] = intentMatch;
      content = content.replace(/\[INTENT:\w+\]/g, "").trim();
      
      // Route to appropriate mode with randomization
      const modes = ["cv", "interview", "career_path"];
      
      if (intent === "cv_building") {
        setActiveMode("cv");
      } else if (intent === "interview_prep") {
        setActiveMode("interview");
      } else if (intent === "career_path") {
        setActiveMode("career_path");
      } else if (intent === "job_search" || intent === "networking") {
        // Randomly suggest a helpful mode for job search/networking
        const randomMode = modes[Math.floor(Math.random() * modes.length)];
        setActiveMode(randomMode);
      } else if (activeMode && intent === "general") {
        // Close mode if conversation shifts to general
        setActiveMode(null);
      }
    }
    
    const memoryMatches = content.match(/\[MEMORY:(\w+)=([^\]]+)\]/g);
    const cvMatches = content.match(/\[CV:(\w+)=([^\]]+)\]/g);
    const interviewMatches = content.match(/\[INTERVIEW:(\w+)=([^\]]+)\]/g);
    const pathMatches = content.match(/\[PATH:(\w+)=([^\]]+)\]/g);

    if (memoryMatches) {
      content = content.replace(/\[MEMORY:\w+=[^\]]+\]/g, "").trim();

      for (const match of memoryMatches) {
        const [, key, value] = match.match(/\[MEMORY:(\w+)=([^\]]+)\]/);
        const existing = memories.find((m) => m.key === key);
        if (!existing || existing.value !== value) {
          const isSocial = ["social_interests", "social_goals", "desired_connections", "preferred_communities"].includes(key);
          await base44.entities.UserMemory.create({
            category: isSocial ? "social" : "career",
            key,
            value,
            source_conversation_id: conversationId,
          });
        }
      }
      loadMemories();
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

    if (pathMatches) {
      content = content.replace(/\[PATH:\w+=[^\]]+\]/g, "").trim();
      const pathSteps = [];
      let currentStep = {};

      for (const match of pathMatches) {
        const [, key, value] = match.match(/\[PATH:(\w+)=([^\]]+)\]/);
        
        if (key === "role" && Object.keys(currentStep).length > 0) {
          pathSteps.push(currentStep);
          currentStep = { role: value };
        } else if (key === "role") {
          currentStep.role = value;
        } else if (key === "timeframe") {
          currentStep.timeframe = value;
        } else if (key === "description") {
          currentStep.description = value;
        } else if (key === "skills") {
          currentStep.skills = value.split(",").map((s) => s.trim());
        } else if (key === "experience") {
          currentStep.experience = value;
        } else if (key === "isCurrent") {
          currentStep.isCurrent = value === "true";
        } else if (key === "learning_resources") {
          try {
            currentStep.learningResources = JSON.parse(value);
          } catch {
            currentStep.learningResources = [];
          }
        } else if (key === "skill_building_tips") {
          currentStep.skillBuildingTips = value;
        }
      }
      
      if (Object.keys(currentStep).length > 0) {
        pathSteps.push(currentStep);
      }
      
      if (pathSteps.length > 0) {
        setCareerPathData(pathSteps);
      }
    }

    const assistantMsg = {
      role: "assistant",
      content,
      persona,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsLoading(false);
    setWhisper("");

    if (convId) {
      await base44.entities.Conversation.update(convId, {
        messages: [...newMessages, assistantMsg],
      });
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
                className="mb-8"
              >
                <PersonaSelector active={persona} onChange={setPersona} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="w-full max-w-lg"
              >
                <ChatInput onSend={handleSend} voiceMode={voiceMode} />
              </motion.div>
              
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                onClick={() => setVoiceMode(!voiceMode)}
                className="mt-4 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {voiceMode ? "Switch to typing" : "Switch to voice mode"}
              </motion.button>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1 }}
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
                    setActiveMode(null);
                    setCvData({});
                    setInterviewQuestions([]);
                  }}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-violet-500 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <span className="text-white text-[10px] font-bold">A·M</span>
                </button>
                <PersonaSelector active={persona} onChange={setPersona} />
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
                  <MessageBubble key={i} message={msg} isLast={i === messages.length - 1} />
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
                <ChatInput onSend={handleSend} disabled={isLoading} voiceMode={voiceMode} />
              </div>
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}