import React, { useState, useRef, useEffect } from "react";
import { Send, Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [text]);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="relative">
      <motion.div
        animate={{
          borderColor: isFocused ? "rgba(34, 211, 238, 0.5)" : "rgba(255, 255, 255, 0.1)",
          boxShadow: isFocused 
            ? "0 0 20px rgba(34, 211, 238, 0.25), inset 0 0 1px rgba(34, 211, 238, 0.1)"
            : "none"
        }}
        transition={{ duration: 0.2 }}
        className="flex items-end gap-2 bg-white/5 backdrop-blur-md border rounded-2xl px-5 py-4 shadow-lg shadow-black/5"
      >
        {/* Microphone Button (Voice-First) */}
        <motion.button
          onClick={() => {/* Voice handler - future */}}
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Mic className="w-5 h-5 text-neutral-400 hover:text-cyan-400 transition-colors" />
        </motion.button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="What's on your mind..."
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-neutral-700 placeholder:text-neutral-500 text-[15px] leading-relaxed resize-none outline-none max-h-[120px]"
        />

        {/* Send Button */}
        <AnimatePresence mode="wait">
          {text.trim() ? (
            <motion.button
              key="send"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={handleSubmit}
              disabled={disabled}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white flex items-center justify-center hover:shadow-lg hover:shadow-cyan-400/20 transition-all disabled:opacity-50"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Send className="w-4 h-4" />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}