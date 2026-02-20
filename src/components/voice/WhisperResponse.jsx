import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function WhisperResponse({ text, visible, duration = 3200 }) {
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
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 max-w-2xl pointer-events-none px-4 z-10"
    >
      <div className="rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm px-4 py-2 shadow-sm">
        <p className="text-neutral-600 text-sm leading-relaxed text-center">{text}</p>
      </div>
    </motion.div>
  );
}
