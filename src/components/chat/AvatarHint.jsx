import React from "react";
import { motion } from "framer-motion";
import PersonaAvatar from "./PersonaAvatar";

export default function AvatarHint({ persona, text, visible }) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="flex items-start gap-3"
    >
      <PersonaAvatar persona={persona} size="sm" />
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="relative max-w-xs"
      >
        {/* Speech bubble tail */}
        <div className="absolute -left-2 top-3 w-0 h-0 border-t-[6px] border-t-transparent border-r-[8px] border-r-white/80 border-b-[6px] border-b-transparent" />
        
        <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
          <p className="text-xs text-neutral-600 leading-relaxed">{text}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}