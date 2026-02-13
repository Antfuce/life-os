import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import VoiceInput from "./VoiceInput";

export default function ChatInput({ onSend, disabled, voiceMode = false, pauseListening = false }) {
  const [interimText, setInterimText] = useState("");
  const [isListening, setIsListening] = useState(false);

  const handleVoiceTranscript = (transcript) => {
    onSend(transcript.trim());
  };

  const handleInterimTranscript = (interim) => {
    setInterimText(interim);
    if (interim.trim()) setIsListening(true);
  };

  const handleListeningChange = (listening) => {
    setIsListening(listening);
  };

  const isActive = isListening && !pauseListening;

  return (
    <div className="relative">
      {/* Vivid Reactive Wave Visualization */}
      <motion.div
        className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
        animate={{
          opacity: isActive ? 0.8 : pauseListening ? 0.2 : 0.4,
        }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 600 60"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Listening state - vibrant gradient */}
            <linearGradient id="waveGradientActive" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={isActive ? "rgba(168, 85, 247, 0.6)" : "rgba(168, 85, 247, 0.2)"} />
              <stop offset="50%" stopColor={isActive ? "rgba(244, 63, 94, 0.6)" : "rgba(244, 63, 94, 0.2)"} />
              <stop offset="100%" stopColor={isActive ? "rgba(251, 191, 36, 0.6)" : "rgba(251, 191, 36, 0.2)"} />
            </linearGradient>
            {/* Muted state - desaturated */}
            <linearGradient id="waveGradientMuted" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(120, 113, 108, 0.15)" />
              <stop offset="50%" stopColor="rgba(120, 113, 108, 0.15)" />
              <stop offset="100%" stopColor="rgba(120, 113, 108, 0.15)" />
            </linearGradient>
          </defs>

          {/* Primary wave - responsive to listening */}
          <motion.path
            d="M0,30 Q150,10 300,30 T600,30"
            stroke={pauseListening ? "url(#waveGradientMuted)" : "url(#waveGradientActive)"}
            strokeWidth={isActive ? 2.5 : 1.5}
            fill="none"
            vectorEffect="non-scaling-stroke"
            initial={{ strokeDashoffset: 0 }}
            animate={{
              strokeDashoffset: -300,
              d: isActive 
                ? ["M0,30 Q150,10 300,30 T600,30", "M0,30 Q150,5 300,30 T600,30", "M0,30 Q150,15 300,30 T600,30"]
                : "M0,30 Q150,10 300,30 T600,30"
            }}
            transition={{
              strokeDashoffset: { duration: isActive ? 1.5 : 2.5, repeat: Infinity, ease: "linear" },
              d: { duration: 0.4, repeat: Infinity, ease: "easeInOut" }
            }}
            strokeDasharray="300"
          />

          {/* Secondary wave - deeper response */}
          <motion.path
            d="M0,30 Q150,50 300,30 T600,30"
            stroke={pauseListening ? "url(#waveGradientMuted)" : "url(#waveGradientActive)"}
            strokeWidth={isActive ? 2.5 : 1.5}
            fill="none"
            vectorEffect="non-scaling-stroke"
            initial={{ strokeDashoffset: 0 }}
            animate={{
              strokeDashoffset: -300,
              d: isActive
                ? ["M0,30 Q150,50 300,30 T600,30", "M0,30 Q150,55 300,30 T600,30", "M0,30 Q150,45 300,30 T600,30"]
                : "M0,30 Q150,50 300,30 T600,30"
            }}
            transition={{
              strokeDashoffset: { duration: isActive ? 2 : 3, repeat: Infinity, ease: "linear", delay: isActive ? 0.1 : 0.3 },
              d: { duration: 0.5, repeat: Infinity, ease: "easeInOut", delay: 0.1 }
            }}
            strokeDasharray="300"
          />

          {/* Accent wave - appears when actively speaking */}
          {isActive && (
            <motion.path
              d="M0,30 Q150,20 300,30 T600,30"
              stroke="url(#waveGradientActive)"
              strokeWidth="1.5"
              fill="none"
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0, strokeDashoffset: 0 }}
              animate={{
                opacity: [0.3, 0.7, 0.3],
                strokeDashoffset: -300
              }}
              transition={{
                opacity: { duration: 0.6, repeat: Infinity },
                strokeDashoffset: { duration: 1.8, repeat: Infinity, ease: "linear" }
              }}
              strokeDasharray="300"
            />
          )}
        </svg>
      </motion.div>

      {/* Muted Overlay */}
      <AnimatePresence>
        {pauseListening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-2xl bg-neutral-900/30 backdrop-blur-sm flex items-center justify-center pointer-events-none z-20"
          >
            <span className="text-xs uppercase tracking-widest text-neutral-400 font-semibold">Muted</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`flex items-center justify-center gap-3 backdrop-blur-xl border rounded-2xl px-4 py-3 shadow-lg relative z-10 h-14 transition-all ${
        pauseListening 
          ? "bg-neutral-100/40 border-neutral-200/30" 
          : isActive 
          ? "bg-white/80 border-white/60" 
          : "bg-white/60 border-white/40"
      } shadow-black/[0.03]`}>
        <VoiceInput 
          onTranscript={handleVoiceTranscript} 
          onInterimTranscript={handleInterimTranscript}
          onListeningChange={handleListeningChange}
          disabled={disabled}
          autoStart={voiceMode}
          pauseListening={pauseListening}
        />
      </div>

      {/* Interim Transcript Caption */}
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