import React, { useState, useRef, useEffect, useCallback } from "react";
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
  enableSpeech = true,
}) {
  const [text, setText] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);
  const inputRef = useRef(null);
  const previousListeningRef = useRef(false);
  const autoSendVoiceRef = useRef(false);
  const latestVoiceDraftRef = useRef("");
  const voiceFinalBufferRef = useRef("");
  const voiceAutoSendTimerRef = useRef(null);

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
    autoRestart: true,
    interimResults: true,
  });

  const clearVoiceAutoSendTimer = useCallback(() => {
    if (voiceAutoSendTimerRef.current) {
      clearTimeout(voiceAutoSendTimerRef.current);
      voiceAutoSendTimerRef.current = null;
    }
  }, []);

  const flushVoiceBuffer = useCallback(() => {
    const buffered = String(voiceFinalBufferRef.current || "").trim();
    if (!buffered || disabled) return;
    onSend?.(buffered);
    voiceFinalBufferRef.current = "";
    latestVoiceDraftRef.current = "";
    setText("");
  }, [disabled, onSend]);

  // Handle final transcript
  useEffect(() => {
    if (!finalTranscript) return;

    if (autoSendVoiceRef.current) {
      const merged = `${voiceFinalBufferRef.current ? `${voiceFinalBufferRef.current} ` : ""}${finalTranscript}`.trim();
      voiceFinalBufferRef.current = merged;
      latestVoiceDraftRef.current = merged;
      onInterim?.(merged);

      clearVoiceAutoSendTimer();
      voiceAutoSendTimerRef.current = setTimeout(() => {
        flushVoiceBuffer();
      }, 900);
      return;
    }

    setText((prev) => {
      const combined = prev ? `${prev} ${finalTranscript}` : finalTranscript;
      const normalized = combined.trim();
      latestVoiceDraftRef.current = normalized;
      return normalized;
    });
  }, [finalTranscript, disabled, onInterim, clearVoiceAutoSendTimer, flushVoiceBuffer]);

  // Flush pending voice chunk if recognition drops while in auto-send mode
  useEffect(() => {
    const wasListening = previousListeningRef.current;
    if (wasListening && !listening && autoSendVoiceRef.current) {
      clearVoiceAutoSendTimer();
      flushVoiceBuffer();
    }
    previousListeningRef.current = listening;
  }, [listening, clearVoiceAutoSendTimer, flushVoiceBuffer]);

  // Emit interim for parent captions
  useEffect(() => {
    if (interimTranscript) {
      onInterim?.(interimTranscript);
    }
    setShowTranscript(voiceSessionActive && (listening || !!interimTranscript));
  }, [interimTranscript, listening, voiceSessionActive, onInterim]);

  // Report effective voice-active state to parent
  useEffect(() => {
    onListeningChange?.(voiceSessionActive || listening);
  }, [listening, voiceSessionActive, onListeningChange]);

  useEffect(() => {
    const code = String(error?.error || "");
    if (!code) return;
    if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
      setVoiceSessionActive(false);
      autoSendVoiceRef.current = false;
      clearVoiceAutoSendTimer();
      voiceFinalBufferRef.current = "";
    }
  }, [error, clearVoiceAutoSendTimer]);

  useEffect(() => {
    return () => {
      clearVoiceAutoSendTimer();
    };
  }, [clearVoiceAutoSendTimer]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.style.height = "0px";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [text]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!text.trim() || disabled) return;
    autoSendVoiceRef.current = false;
    latestVoiceDraftRef.current = "";
    voiceFinalBufferRef.current = "";
    clearVoiceAutoSendTimer();
    onSend?.(text.trim());
    setText("");
    setVoiceSessionActive(false);
    stop();
  };

  const toggleMic = () => {
    if (!enableSpeech || !supported) return;

    if (voiceSessionActive || listening) {
      clearVoiceAutoSendTimer();
      flushVoiceBuffer();
      autoSendVoiceRef.current = false;
      latestVoiceDraftRef.current = "";
      setVoiceSessionActive(false);
      setShowTranscript(false);
      stop();
      return;
    }

    window.speechSynthesis?.cancel?.();
    autoSendVoiceRef.current = !text.trim();
    latestVoiceDraftRef.current = "";
    voiceFinalBufferRef.current = "";
    setVoiceSessionActive(true);
    setShowTranscript(true);
    start();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Permission denied or not supported UI
  const micErrorCode = String(error?.error || "");
  const showMicError = enableSpeech && (!supported || Boolean(micErrorCode));
  const isVoiceActive = voiceSessionActive || listening;

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
            {interimTranscript || (listening ? "Listening..." : "Reconnecting mic…")}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input container */}
      <div className="relative flex items-end gap-2 bg-white/95 border border-neutral-200 rounded-2xl shadow-sm p-2 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500 transition-all">
        {/* Text input */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-[15px] placeholder:text-neutral-400 focus:outline-none max-h-[120px] min-h-[44px]"
        />

        {/* Right actions */}
        <div className="flex items-center gap-1 pb-1 pr-1">
          {/* Mic button - small, not giant */}
          {enableSpeech && supported && (
            <Button
              type="button"
              onClick={toggleMic}
              disabled={disabled}
              variant={isVoiceActive ? "destructive" : "ghost"}
              size="icon"
              aria-label={isVoiceActive ? "Stop voice input" : "Start voice input"}
              className={`h-9 w-9 rounded-full transition-all ${
                isVoiceActive ? "bg-red-500 hover:bg-red-600 animate-pulse" : "hover:bg-neutral-100"
              }`}
              title={isVoiceActive ? "Stop listening" : "Start voice input"}
            >
              {isVoiceActive ? (
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
            aria-label="Send message"
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
            ) : micErrorCode === "not-allowed" || micErrorCode === "service-not-allowed" ? (
              <span className="text-amber-600">
                Mic blocked — enable permissions or type instead
              </span>
            ) : micErrorCode === "audio-capture" ? (
              <span className="text-amber-600">
                No microphone detected — check your input device
              </span>
            ) : micErrorCode === "no-speech" ? (
              <span className="text-neutral-500">
                No speech detected — keep talking after tapping mic
              </span>
            ) : (
              <span className="text-neutral-500">
                Voice input interrupted — try again
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
