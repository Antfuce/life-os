import React, { useState } from "react";
import { Mic } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatInput({ onSend, disabled }) {
  const [isListening, setIsListening] = useState(false);

  const waveVariants = {
    animate: (i) => ({
      scale: [0, 2.5],
      opacity: [0.8, 0],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        delay: i * 0.15,
      },
    }),
  };

  return (
    <div className="relative w-full h-64 flex items-center justify-center">
      {/* Animated Waves - 8 waves converging from all directions */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={`wave-${i}`}
          custom={i}
          variants={waveVariants}
          animate="animate"
          className="absolute rounded-full border-2 pointer-events-none"
          style={{
            borderImage: `linear-gradient(${(i * 45)}deg, #f97316, #f97316, #ec4899, #a855f7) 1`,
            width: "120px",
            height: "120px",
          }}
        />
      ))}

      {/* Central Microphone Button with Glow */}
      <motion.div
        animate={isListening ? {
          boxShadow: [
            "0 0 40px rgba(249, 115, 22, 0.5)",
            "0 0 80px rgba(168, 85, 247, 0.5)",
            "0 0 40px rgba(249, 115, 22, 0.5)",
          ],
        } : {
          boxShadow: "0 0 40px rgba(249, 115, 22, 0.3), 0 0 80px rgba(168, 85, 247, 0.2)",
        }}
        transition={{ duration: 2, repeat: Infinity }}
        className="relative z-10"
      >
        <button
          onClick={() => setIsListening(!isListening)}
          disabled={disabled}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 via-orange-500 to-violet-500 flex items-center justify-center hover:scale-105 transition-transform shadow-2xl"
        >
          <motion.div
            animate={isListening ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.6, repeat: Infinity }}
          >
            <Mic className="w-10 h-10 text-white" />
          </motion.div>
        </button>
      </motion.div>
    </div>
  );
}