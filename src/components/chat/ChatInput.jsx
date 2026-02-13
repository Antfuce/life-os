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
      <div className="flex items-end gap-2 bg-white/60 backdrop-blur-xl border border-white/40 rounded-2xl px-3 py-2 shadow-lg shadow-black/[0.03] relative z-10 overflow-hidden group hover:shadow-xl hover:shadow-violet-500/20 transition-all duration-300">
        {/* Glow backdrop layer */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-500/0 via-rose-500/5 to-violet-600/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* Animated wave overlay - flows left to right with luxury glow */}
        <motion.div
          className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
        >
          <svg
            className="absolute inset-0 w-full h-full filter drop-shadow-xl"
            viewBox="0 0 600 60"
            preserveAspectRatio="none"
          >
            <defs>
              {/* Primary gradient - orange to purple */}
              <linearGradient id="waveGradientPrimary" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(251, 146, 60, 0.6)" />
                <stop offset="25%" stopColor="rgba(251, 146, 60, 0.4)" />
                <stop offset="50%" stopColor="rgba(244, 63, 94, 0.5)" />
                <stop offset="75%" stopColor="rgba(168, 85, 247, 0.4)" />
                <stop offset="100%" stopColor="rgba(168, 85, 247, 0.6)" />
              </linearGradient>
              
              {/* Glow gradient for secondary wave */}
              <linearGradient id="waveGradientGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(251, 146, 60, 0.3)" />
                <stop offset="50%" stopColor="rgba(168, 85, 247, 0.3)" />
                <stop offset="100%" stopColor="rgba(168, 85, 247, 0.15)" />
              </linearGradient>

              {/* Blur filter for glow effect */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Glow layer waves - fat filled */}
            <motion.path
              d="M0,30 Q150,10 300,30 T600,30"
              stroke="url(#waveGradientGlow)"
              strokeWidth="8"
              fill="url(#waveGradientGlow)"
              vectorEffect="non-scaling-stroke"
              filter="url(#glow)"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -300 }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
              strokeDasharray="300"
              opacity="0.6"
            />

            {/* Primary wave layer 1 - thick filled */}
            <motion.path
              d="M0,30 Q150,8 300,30 T600,30"
              stroke="url(#waveGradientPrimary)"
              strokeWidth="6"
              fill="url(#waveGradientPrimary)"
              vectorEffect="non-scaling-stroke"
              filter="url(#glow)"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -300 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
              strokeDasharray="300"
            />

            {/* Primary wave layer 2 - thick filled */}
            <motion.path
              d="M0,30 Q150,52 300,30 T600,30"
              stroke="url(#waveGradientPrimary)"
              strokeWidth="6"
              fill="url(#waveGradientPrimary)"
              vectorEffect="non-scaling-stroke"
              filter="url(#glow)"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -300 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear", delay: 0.2 }}
              strokeDasharray="300"
              opacity="0.9"
            />

            {/* Accent shimmer wave - bright sparkle */}
            <motion.path
              d="M0,30 Q150,20 300,30 T600,30"
              stroke="url(#waveGradientGlow)"
              strokeWidth="3"
              fill="url(#waveGradientGlow)"
              vectorEffect="non-scaling-stroke"
              initial={{ strokeDashoffset: 0, opacity: 0.5 }}
              animate={{ strokeDashoffset: -300, opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0 }}
              strokeDasharray="300"
            />
          </svg>
        </motion.div>

        {/* Text label with glow on hover */}
        <div className="relative z-10 flex items-center justify-center w-full pointer-events-none">
          <motion.span 
            className="text-[15px] bg-gradient-to-r from-amber-600 via-rose-600 to-violet-600 bg-clip-text text-transparent font-medium tracking-wide"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            Click to start talking...
          </motion.span>
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