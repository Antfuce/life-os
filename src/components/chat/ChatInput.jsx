import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import VoiceInput from "./VoiceInput";

export default function ChatInput({ onSend, disabled, voiceMode = false, pauseListening = false }) {
  const [text, setText] = useState("");
  const [interimText, setInterimText] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [text, interimText]);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
    setInterimText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleVoiceTranscript = (transcript) => {
    // Auto-send immediately on voice transcript
    if (transcript.trim()) {
      onSend(transcript.trim());
      setText("");
      setInterimText("");
    }
  };

  const handleInterimTranscript = (interim) => {
    setInterimText(interim);
  };

  return (
    <div className="relative">
      {/* Animated wave overlay - flows right to left */}
      <div className="flex items-end gap-3 bg-white/60 backdrop-blur-xl border border-white/40 rounded-2xl px-4 py-3 shadow-lg shadow-black/[0.03] relative z-10 overflow-hidden">
        {/* Animated wave overlay - flows right to left */}
        <motion.div
          className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
        >
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 600 60"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(168, 85, 247, 0.15)" />
                <stop offset="50%" stopColor="rgba(244, 63, 94, 0.15)" />
                <stop offset="100%" stopColor="rgba(251, 191, 36, 0.15)" />
              </linearGradient>
            </defs>
            <motion.path
              d="M0,30 Q150,10 300,30 T600,30"
              stroke="url(#waveGradient)"
              strokeWidth="1.5"
              fill="none"
              vectorEffect="non-scaling-stroke"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -300 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              strokeDasharray="300"
            />
            <motion.path
              d="M0,30 Q150,50 300,30 T600,30"
              stroke="url(#waveGradient)"
              strokeWidth="1.5"
              fill="none"
              vectorEffect="non-scaling-stroke"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -300 }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear", delay: 0.3 }}
              strokeDasharray="300"
            />
          </svg>
        </motion.div>

        <div className="relative z-10 flex items-center justify-center w-full text-neutral-400 pointer-events-none">
          <span className="text-[15px]">Click to start talking...</span>
        </div>

        <VoiceInput 
          onTranscript={handleVoiceTranscript} 
          onInterimTranscript={handleInterimTranscript}
          disabled={disabled}
          autoStart={voiceMode}
          pauseListening={pauseListening}
        />
      </div>
      
      {/* Live Caption Display */}
      <AnimatePresence>
        {interimText && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute -top-12 left-0 right-0 bg-neutral-900/90 backdrop-blur-xl text-white text-sm px-4 py-2 rounded-xl shadow-lg"
          >
            <span className="text-neutral-400 text-xs mr-2">You're saying:</span>
            {interimText}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}