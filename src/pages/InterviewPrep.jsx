import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Sparkles, Book, ArrowLeft, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import MessageBubble from "../components/chat/MessageBubble";
import TypingIndicator from "../components/chat/TypingIndicator";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

const modes = [
  { id: "mock", icon: Video, label: "Mock Interview", desc: "Full simulation with feedback", gradient: "from-violet-500 to-purple-600" },
  { id: "practice", icon: Sparkles, label: "Practice Questions", desc: "Tailored to your CV", gradient: "from-blue-500 to-cyan-600" },
  { id: "tips", icon: Book, label: "Tips & Strategies", desc: "Win every interview", gradient: "from-amber-500 to-orange-600" },
];

export default function InterviewPrep() {
  const [selectedMode, setSelectedMode] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [candidateData, setCandidateData] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadCandidate();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId) return;

    const unsubscribe = base44.agents.subscribeToConversation(conversationId, (data) => {
      setMessages(data.messages || []);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [conversationId]);

  const loadCandidate = async () => {
    const user = await base44.auth.me();
    if (!user) return;
    
    const candidates = await base44.entities.Candidate.filter({ created_by: user.email });
    if (candidates[0]) {
      setCandidateData(candidates[0]);
    }
  };

  const startMode = async (mode) => {
    setSelectedMode(mode);
    
    const conv = await base44.agents.createConversation({
      agent_name: "antonio_interview_coach",
      metadata: { name: `Interview Prep - ${mode}`, mode },
    });
    setConversationId(conv.id);

    // Send initial context
    let initialPrompt = "";
    if (mode === "mock") {
      initialPrompt = "I want to do a full mock interview. Start with the first question.";
    } else if (mode === "practice") {
      initialPrompt = "Generate practice questions based on my CV and experience.";
    } else {
      initialPrompt = "Give me your best interview tips and strategies.";
    }

    setTimeout(() => sendMessage(conv, initialPrompt), 300);
  };

  const sendMessage = async (conv, text) => {
    setIsLoading(true);
    setInput("");

    await base44.agents.addMessage(conv || { id: conversationId }, {
      role: "user",
      content: text,
    });
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(null, input);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const resetMode = () => {
    setSelectedMode(null);
    setMessages([]);
    setConversationId(null);
    setInput("");
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white/50 backdrop-blur-xl border-b border-neutral-200/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl("Home")}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
          <div className="h-4 w-px bg-neutral-300" />
          <div>
            <h1 className="text-lg font-semibold text-neutral-800">Interview Prep</h1>
            <p className="text-xs text-neutral-500">Powered by Antonio</p>
          </div>
        </div>
        {selectedMode && (
          <Button onClick={resetMode} variant="outline" size="sm">
            Change Mode
          </Button>
        )}
      </div>

      {/* Mode Selection */}
      {!selectedMode && (
        <div className="flex-1 flex items-center justify-center p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl w-full"
          >
            <div className="text-center mb-12">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-blue-500 mx-auto mb-6 flex items-center justify-center shadow-2xl"
              >
                <Video className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-4xl font-bold text-neutral-900 mb-3">
                Ace Your Next Interview
              </h2>
              <p className="text-neutral-500 text-lg">
                Practice with AI, get instant feedback, build confidence
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {modes.map((mode, i) => {
                const Icon = mode.icon;
                return (
                  <motion.button
                    key={mode.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    onClick={() => startMode(mode.id)}
                    className="group relative bg-white rounded-3xl p-8 border-2 border-neutral-200 hover:border-transparent hover:shadow-2xl transition-all duration-300"
                  >
                    <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${mode.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                    <div className="relative z-10">
                      <div className="w-14 h-14 rounded-2xl bg-neutral-100 group-hover:bg-white/20 flex items-center justify-center mb-6 transition-colors">
                        <Icon className="w-7 h-7 text-neutral-600 group-hover:text-white transition-colors" />
                      </div>
                      <h3 className="text-xl font-bold text-neutral-900 group-hover:text-white mb-2 transition-colors">
                        {mode.label}
                      </h3>
                      <p className="text-sm text-neutral-500 group-hover:text-white/80 transition-colors">
                        {mode.desc}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {!candidateData && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 text-center"
              >
                <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
                  💡 Tip: Build your CV first for personalized questions
                </Badge>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}

      {/* Conversation View */}
      {selectedMode && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className="max-w-3xl mx-auto space-y-6">
              <AnimatePresence mode="popLayout">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} />
                ))}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <TypingIndicator persona="antonio" />
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-6 py-6 bg-white/50 backdrop-blur-xl border-t border-neutral-200/50">
            <div className="max-w-3xl mx-auto relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer or question..."
                disabled={isLoading}
                className="min-h-[80px] pr-12 resize-none rounded-2xl border-2 border-neutral-200 focus:border-violet-500 transition-colors"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="absolute bottom-3 right-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-center text-xs text-neutral-400 mt-3">
              Press Enter to send • Shift + Enter for new line
            </p>
          </div>
        </div>
      )}
    </div>
  );
}