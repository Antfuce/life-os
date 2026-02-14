import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function WhisperCaption({ text, visible }) {
  return (
    <AnimatePresence>
      {visible && text && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <p className="text-[13px] tracking-[0.08em] text-neutral-300 font-light">
            {text}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}