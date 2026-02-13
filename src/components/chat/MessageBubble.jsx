import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import PersonaAvatar from "./PersonaAvatar";
import ReactMarkdown from "react-markdown";
import { base44 } from "@/api/base44Client";

export default function MessageBubble({ message, isLast }) {
  const isUser = message.role === "user";
  const persona = message.persona || "both";
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    // Auto-play assistant messages
    if (!isUser && message.content && isLast) {
      playAudio();
    }
  }, [isUser, message.content, isLast]);

  const playAudio = async () => {
    if (audioUrl) {
      if (audioRef.current) {
        audioRef.current.play();
        setIsPlaying(true);
      }
      return;
    }

    try {
      setIsPlaying(true);
      const { data } = await base44.functions.invoke('textToSpeech', {
        text: message.content,
        voiceGender: persona === 'mariana' ? 'FEMALE' : persona === 'antonio' ? 'MALE' : 'NEUTRAL',
      });

      const audioBlob = base64ToBlob(data.audioContent, 'audio/mpeg');
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
      audio.onended = () => setIsPlaying(false);
    } catch (error) {
      console.error('TTS error:', error);
      setIsPlaying(false);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const base64ToBlob = (base64, type) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("flex gap-3 max-w-2xl", isUser ? "ml-auto flex-row-reverse" : "")}
    >
      {!isUser && <PersonaAvatar persona={message.persona} size="sm" />}

      <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
        {!isUser && message.persona && (
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium ml-1">
            {message.persona === "both" ? "Antonio & Mariana" : message.persona}
          </span>
        )}
        <div className="flex items-start gap-2">
          <div
            className={cn(
              "rounded-2xl px-5 py-3 max-w-lg",
              isUser
                ? "bg-neutral-900 text-white"
                : "bg-white/70 backdrop-blur-sm border border-white/40 text-neutral-800 shadow-sm"
            )}
          >
            {isUser ? (
              <p className="text-[15px] leading-relaxed">{message.content}</p>
            ) : (
              <div className="text-[15px] leading-relaxed prose prose-sm prose-neutral max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
          {!isUser && (
            <button
              onClick={isPlaying ? stopAudio : playAudio}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/60 transition-colors"
            >
              {isPlaying ? (
                <VolumeX className="w-4 h-4 text-neutral-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-neutral-500" />
              )}
            </button>
          )}
        </div>
        {message.timestamp && (
          <span className="text-[10px] text-neutral-300 ml-1">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </motion.div>
  );
}