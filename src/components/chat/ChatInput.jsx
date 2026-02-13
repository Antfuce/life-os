import React, { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import VoiceInput from "./VoiceInput";

export default function ChatInput({ onSend, disabled, voiceMode = false, pauseListening = false, onModeChange }) {
  const [text, setText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
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
    setText(prev => (prev + " " + transcript).trim());
    setInterimText("");
    // In continuous voice mode, DON'T auto-send — wait for manual send
  };

  const handleInterimTranscript = (interim) => {
    setInterimText(interim);
  };

  return (
    <div className="relative">
      <div className="flex items-end gap-3 bg-white/60 backdrop-blur-xl border border-white/40 rounded-2xl px-4 py-3 shadow-lg shadow-black/[0.03]">
        <textarea
          ref={textareaRef}
          value={text + (interimText ? " " + interimText : "")}
          onChange={(e) => !voiceMode && setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={voiceMode && isRecording ? "🎤 Recording... click send when done" : "Tell us what's on your mind..."}
          disabled={disabled}
          readOnly={voiceMode}
          rows={1}
          className="flex-1 bg-transparent text-neutral-800 placeholder:text-neutral-400 text-[15px] leading-relaxed resize-none outline-none max-h-[120px]"
        />
        <VoiceInput 
          onTranscript={handleVoiceTranscript} 
          onInterimTranscript={handleInterimTranscript}
          disabled={disabled}
          autoStart={voiceMode}
          pauseListening={pauseListening}
          isRecording={isRecording}
          onRecordingChange={setIsRecording}
        />
        <AnimatePresence>
          {text.trim() && !voiceMode && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={handleSubmit}
              disabled={disabled}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      
      {/* Live Caption Display - Prominent Popup */}
      <AnimatePresence>
        {interimText && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -15 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="absolute -top-16 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white text-sm px-4 py-2 rounded-xl shadow-2xl shadow-black/30 font-medium max-w-xs break-words"
          >
            🎤 {interimText}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}