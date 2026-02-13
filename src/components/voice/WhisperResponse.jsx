import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function WhisperResponse({ text, visible, duration = 4000 }) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }

    setShow(true);
    const timer = setTimeout(() => {
      setShow(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, text, duration]);

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.6 }}
      className="fixed top-1/4 left-1/2 -translate-x-1/2 max-w-2xl pointer-events-none"
    >
      <div className="text-center space-y-2">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-neutral-400 text-lg italic leading-relaxed"
        >
          {text}
        </motion.p>
        
        {/* Movie-credits-style fade lines */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          exit={{ scaleX: 0 }}
          transition={{ duration: 0.8 }}
          className="h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent"
        />
      </div>
    </motion.div>
  );
}