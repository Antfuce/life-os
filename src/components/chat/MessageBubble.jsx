import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PersonaAvatar from "./PersonaAvatar";
import ReactMarkdown from "react-markdown";

const PERSONA_BADGES = {
  antonio: "Strategy",
  mariana: "Coaching",
  both: "Collaborative",
};

export default function MessageBubble({ message, isStreaming = false }) {
  const isUser = message.role === "user";
  const personaBadge = PERSONA_BADGES[message.persona] || "Assistant";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("flex gap-3 max-w-2xl", isUser ? "ml-auto flex-row-reverse" : "")}
    >
      {!isUser && <PersonaAvatar persona={message.persona} size="sm" />}

      <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}> 
        {!isUser && message.persona && message.persona !== "executor" && (
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium ml-1">
            {personaBadge}
          </span>
        )}

        <div
          className={cn(
            "rounded-2xl px-4 py-3 max-w-[min(80vw,38rem)]",
            isUser
              ? "bg-neutral-900 text-white"
              : "bg-white/75 backdrop-blur-sm border border-white/50 text-neutral-800 shadow-sm"
          )}
        >
          {isUser ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="text-[15px] leading-relaxed prose prose-sm prose-neutral max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}

          {isStreaming && !isUser && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-400">
              <span className="inline-flex w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Responding…
            </div>
          )}
        </div>

        {!isStreaming && message.timestamp && (
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
