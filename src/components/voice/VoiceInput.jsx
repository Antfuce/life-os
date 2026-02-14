import React, { useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

import useSpeechRecognition from "@/hooks/useSpeechRecognition";

export default function VoiceInput({ onTranscript, onInterim, isListening }) {
  const {
    supported,
    listening,
    start,
    stop,
    interimTranscript,
    error,
  } = useSpeechRecognition({
    lang: "en-US",
    continuous: false,
    interimResults: true,
    onInterim: (t) => onInterim?.(t),
    onFinal: (t) => onTranscript?.(t),
  });

  // Parent-controlled listening (auto-start when voice room opens)
  useEffect(() => {
    if (!supported) return;
    if (isListening && !listening) start();
    if (!isListening && listening) stop();
  }, [isListening, supported, listening, start, stop]);

  const toggleRecording = () => {
    if (!supported) return;
    if (listening) stop();
    else start();
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
          variant={listening ? "destructive" : "default"}
          size="lg"
          className="rounded-full w-16 h-16 flex items-center justify-center"
          title={supported ? "Voice" : "SpeechRecognition not supported in this browser"}
        >
          {listening ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </Button>

        {/* Minimal feedback */}
        <div className="text-[11px] text-neutral-400 text-center max-w-xs">
          {!supported
            ? "Voice not supported — use Chrome desktop."
            : error
              ? `Mic error: ${String(error?.error || error?.message || error)}`
              : listening
                ? (interimTranscript ? interimTranscript : "Listening…")
                : "Tap to talk"}
        </div>
      </div>
    </motion.div>
  );
}
