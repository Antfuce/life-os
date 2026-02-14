import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import useSpeechRecognition from "@/hooks/useSpeechRecognition";

/**
 * Unified input - text always visible, mic as enhancer
 * - Always shows text box
 * - Small mic button (not giant CTA)
 * - Live transcript overlay
 * - Permission denied fallback
 */
export default function UnifiedInput({
  onSend,
  disabled = false,
  placeholder = "Type or speak...",
  onInterim,
  onListeningChange,
}) {
  const [text, setText] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const inputRef = useRef(null);

  const {
    supported,
    listening,
    start,
    stop,
    interimTranscript,
    finalTranscript,
    error,
  } = useSpeechRecognition({
    lang: "en-US",
    continuous: true,
    interimResults: true,
  });

  // Handle final transcript
  useEffect(() => {
    if (finalTranscript) {
      setText((prev) => {
        const combined = prev ? `${prev} ${finalTranscript}` : finalTranscript;
        return combined.trim();
      });
    }
  }, [finalTranscript]);

  // Emit interim for parent captions
  useEffect(() => {
    onInterim?.(interimTranscript);
    setShowTranscript(!!interimTranscript && listening);
  }, [interimTranscript, listening, onInterim]);

  // Report listening state to parent
  useEffect(() => {
    onListeningChange?.(listening);
  }, [listening, onListeningChange]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!text.trim() || disabled) return;
    onSend?.(text.trim());
    setText("");
    stop();
  };

  const toggleMic = () => {
    if (!supported) return;
    if (listening) {
      stop();
    } else {
      window.speechSynthesis?.cancel?.();
      setShowTranscript(true);
      start();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Permission denied or not supported UI
  const showMicError = error?.error === "not-allowed" || !supported;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Live transcript overlay */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-3 px-4 py-2 bg-neutral-100 rounded-lg text-sm text-neutral-600 text-center"
          >
            {interimTranscript || "Listening..."}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input container */}
      <div className="relative flex items-end gap-2 bg-white border border-neutral-200 rounded-2xl shadow-sm p-2 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500 transition-all">
        {/* Text input */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] placeholder:text-neutral-400 focus:outline-none max-h-[120px] min-h-[44px]"
          style={{ fieldSizing: "content" }}
        />

        {/* Right actions */}
        <div className="flex items-center gap-1 pb-1 pr-1">
          {/* Mic button - small, not giant */}
          {supported && (
            <Button
              type="button"
              onClick={toggleMic}
              disabled={disabled}
              variant={listening ? "destructive" : "ghost"}
              size="icon"
              className={`h-9 w-9 rounded-full transition-all ${
                listening ? "bg-red-500 hover:bg-red-600 animate-pulse" : "hover:bg-neutral-100"
              }`}
              title={listening ? "Stop listening" : "Start voice input"}
            >
              {listening ? (
                <Square className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4 text-neutral-500" />
              )}
            </Button>
          )}

          {/* Send button */}
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
            size="icon"
            className="h-9 w-9 rounded-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Error / permission fallback */}
      <AnimatePresence>
        {showMicError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 text-xs text-center"
          >
            {!supported ? (
              <span className="text-neutral-400">
                Voice not supported — type instead
              </span>
            ) : (
              <span className="text-amber-600">
                Mic blocked — enable permissions or type instead
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard hint */}
      <div className="mt-2 text-[11px] text-neutral-400 text-center">
        <span className="hidden sm:inline">Press Enter to send, Shift+Enter for new line</span>
        <span className="sm:hidden">Tap to type, mic for voice</span>
      </div>
    </div>
  );
}
