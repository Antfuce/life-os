import React from "react";
import { motion } from "framer-motion";
import PersonaAvatar from "@/components/chat/PersonaAvatar";

export default function AvatarWithWaves({ persona, isActive }) {
  const waveCount = 3;

  return (
    <div className="flex items-center justify-center">
      {/* Waves */}
      {isActive && (
        <>
          {[...Array(waveCount)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 2.2 + i * 0.4, opacity: 0 }}
              transition={{
                duration: 1.2,
                delay: i * 0.2,
                repeat: Infinity,
              }}
              className="absolute rounded-full border-2 border-violet-300/80"
              style={{
                width: "120px",
                height: "120px",
              }}
            />
          ))}
        </>
      )}

      {/* Glow effect */}
      <motion.div
        animate={
          isActive
            ? {
                boxShadow: [
                  "0 0 34px rgba(139, 92, 246, 0.22)",
                  "0 0 52px rgba(139, 92, 246, 0.34)",
                  "0 0 34px rgba(139, 92, 246, 0.22)",
                ],
              }
            : { boxShadow: "0 0 0px rgba(139, 92, 246, 0)" }
        }
        transition={{ duration: 2, repeat: Infinity }}
        className="rounded-full p-2"
      >
        <PersonaAvatar persona={persona} size="lg" />
      </motion.div>
    </div>
  );
}