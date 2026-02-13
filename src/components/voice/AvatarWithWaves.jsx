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
              className="absolute rounded-full border-2 border-cyan-400"
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
                  "0 0 40px rgba(34, 211, 238, 0.4)",
                  "0 0 60px rgba(34, 211, 238, 0.6)",
                  "0 0 40px rgba(34, 211, 238, 0.4)",
                ],
              }
            : { boxShadow: "0 0 0px rgba(34, 211, 238, 0)" }
        }
        transition={{ duration: 2, repeat: Infinity }}
        className="rounded-full p-2"
      >
        <PersonaAvatar persona={persona} size="lg" />
      </motion.div>
    </div>
  );
}