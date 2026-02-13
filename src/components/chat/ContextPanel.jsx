import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Brain, Briefcase, MapPin, Target, DollarSign, Wrench } from "lucide-react";

const memoryIcons = {
  current_role: Briefcase,
  target_role: Target,
  location_preference: MapPin,
  salary_range: DollarSign,
  skills: Wrench,
};

export default function ContextPanel({ memories, visible, onClose }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="absolute right-0 top-0 w-72 h-full bg-white/80 backdrop-blur-xl border-l border-white/40 p-6 overflow-y-auto z-20"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-500" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-600">
                Memory
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-neutral-100 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-neutral-400" />
            </button>
          </div>

          {memories.length === 0 ? (
            <p className="text-xs text-neutral-400 leading-relaxed">
              As you chat, we'll remember what matters to you.
            </p>
          ) : (
            <div className="space-y-3">
              {memories.map((mem) => {
                const Icon = memoryIcons[mem.key] || Brain;
                return (
                  <div
                    key={mem.id}
                    className="flex items-start gap-3 p-3 rounded-xl bg-white/60 border border-white/40"
                  >
                    <Icon className="w-3.5 h-3.5 text-neutral-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-neutral-400 mb-0.5">
                        {mem.key?.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-neutral-700 font-medium">{mem.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}