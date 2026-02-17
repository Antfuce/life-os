import React, { useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import useSpeechRecognition from "@/hooks/useSpeechRecognition";

/**
 * Audio-first voice capture (Chrome SpeechRecognition).
 *
 * - Emits interim transcript for captions
 * - Auto-sends final utterance via onTranscript
 * - Optionally controlled via isListening (used to auto-start when entering voice mode)
 */
export default function VoiceInput({
  onTranscript,
  onInterim,
  onListeningChange,
  disabled = false,
  isListening,
  lang = "en-US",
}) {
  const { supported, listening, start, stop, interimTranscript, error } = useSpeechRecognition({
    lang,
    continuous: true,
    autoRestart: true,
    interimResults: true,
    onInterim: (t) => onInterim?.(t),
    onFinal: (t) => {
      const clean = String(t || "").trim();
      if (clean) onTranscript?.(clean);
    },
    onError: (e) => console.error("Speech recognition error:", e),
  });

  // Report listening state changes to parent (for avatar waves, etc)
  useEffect(() => {
    onListeningChange?.(listening);
  }, [listening, onListeningChange]);

  // Parent-driven auto-start (best effort; may be blocked without user gesture).
  // Important: we do NOT auto-stop on prop changes; otherwise the parent prop can
  // race the internal `listening` state and immediately stop user-initiated starts.
  useEffect(() => {
    if (typeof isListening !== "boolean") return;
    if (!supported) return;
    if (disabled) return;

    if (isListening && !listening) start();
  }, [isListening, supported, disabled, listening, start]);

  const toggleRecording = () => {
    if (disabled) return;
    if (!supported) return;

    if (listening) {
      stop();
      onListeningChange?.(false);
    } else {
      // Cancel any playing TTS before starting to listen
      window.speechSynthesis?.cancel?.();
      // Optimistically notify parent first to avoid race with isListening prop
      onListeningChange?.(true);
      start();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20"
    >
      <div className="flex flex-col items-center gap-2">
        <Button
          onClick={toggleRecording}
          disabled={disabled || !supported}
          variant={listening ? "destructive" : "default"}
          size="lg"
          className="rounded-full w-16 h-16 flex items-center justify-center"
          title={supported ? "Voice" : "SpeechRecognition not supported in this browser"}
        >
          {listening ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </Button>

        {/* Caption feedback - shows interim transcript or status */}
        <div className="text-[11px] text-neutral-400 text-center max-w-xs min-h-[1.5em]">
          {!supported
            ? "Voice not supported — use Chrome desktop."
            : error
              ? `Mic error: ${String(error?.error || error?.message || error)}`
              : listening
                ? (interimTranscript || "Listening…")
                : disabled
                  ? "Wait…"
                  : "Tap to talk"}
        </div>
      </div>
    </motion.div>
  );
}
