import React from "react";
import { motion } from "framer-motion";
import PersonaAvatar from "./PersonaAvatar";

export default function TypingIndicator({ persona }) {
  return (
    <div className="flex items-end gap-3">
      <PersonaAvatar persona={persona} size="sm" />
      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/20">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-neutral-400"
            animate={{ y: [0, -5, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}