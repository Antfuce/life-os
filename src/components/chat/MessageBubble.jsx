import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PersonaAvatar from "./PersonaAvatar";
import ReactMarkdown from "react-markdown";

export default function MessageBubble({ message, isLast }) {
  const isUser = message.role === "user";

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