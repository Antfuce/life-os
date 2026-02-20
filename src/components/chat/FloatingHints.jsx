import React from "react";
import { motion, AnimatePresence } from "framer-motion";

const SUGGESTIONS = [
  "Build my CV for this role",
  "Prepare me for this interview",
  "Write 3 outreach messages",
  "Plan my next 30 days",
  "Help me switch careers",
  "Make this answer shorter",
];

export default function FloatingHints({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
        >
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl px-4">
            {SUGGESTIONS.slice(0, 4).map((hint) => (
              <span
                key={hint}
                className="px-3 py-1.5 rounded-full border border-white/80 bg-white/75 backdrop-blur-sm text-[12px] text-neutral-500 shadow-sm"
              >
                {hint}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
