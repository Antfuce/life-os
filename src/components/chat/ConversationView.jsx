import React, { useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MessageWhisper from "./MessageWhisper";

export default function ConversationView({ messages, isLoading, whisper }) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-4 px-6 py-6">
      <AnimatePresence>
        {messages.map((msg, idx) => (
          <MessageWhisper key={idx} message={msg} />
        ))}
      </AnimatePresence>

      {isLoading && whisper && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-neutral-400 italic"
        >
          {whisper}
        </motion.div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}