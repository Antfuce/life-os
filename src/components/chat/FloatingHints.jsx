import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const hints = [
  "Find me a job",
  "Build me a resume",
  "Plan the perfect trip",
  "Book me a bicycle",
  "Help me book my tickets",
  "Find networking events",
  "Connect me with mentors",
  "Prepare for interviews",
  "Write a cover letter",
  "Negotiate my salary",
  "Find communities near me",
  "Make new friends",
  "Plan my career switch",
  "Improve my LinkedIn",
];

export default function FloatingHints({ visible }) {
  const [activeHints, setActiveHints] = useState([]);

  useEffect(() => {
    if (!visible) return;

    const addHint = () => {
      const randomHint = hints[Math.floor(Math.random() * hints.length)];
      const id = Date.now() + Math.random();
      
      // Random position around the screen edges
      const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
      let x, y;
      
      if (side === 0) { // top
        x = Math.random() * 80 + 10; // 10-90%
        y = Math.random() * 20 + 10; // 10-30%
      } else if (side === 1) { // right
        x = Math.random() * 20 + 70; // 70-90%
        y = Math.random() * 80 + 10; // 10-90%
      } else if (side === 2) { // bottom
        x = Math.random() * 80 + 10; // 10-90%
        y = Math.random() * 20 + 70; // 70-90%
      } else { // left
        x = Math.random() * 20 + 10; // 10-30%
        y = Math.random() * 80 + 10; // 10-90%
      }

      const newHint = { id, text: randomHint, x, y };
      setActiveHints((prev) => [...prev, newHint]);

      // Remove hint after 4 seconds
      setTimeout(() => {
        setActiveHints((prev) => prev.filter((h) => h.id !== id));
      }, 4000);
    };

    // Add first hint immediately
    addHint();

    // Then add hints at random intervals
    const interval = setInterval(() => {
      addHint();
    }, 2000 + Math.random() * 2000); // Random between 2-4 seconds

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      <AnimatePresence>
        {activeHints.map((hint) => (
          <motion.div
            key={hint.id}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              position: "absolute",
              left: `${hint.x}%`,
              top: `${hint.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            className="bg-white/70 backdrop-blur-md border border-white/80 rounded-2xl px-4 py-2.5 shadow-lg"
          >
            <p className="text-sm text-neutral-600 whitespace-nowrap">{hint.text}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}