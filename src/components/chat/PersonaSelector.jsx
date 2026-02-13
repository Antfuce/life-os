import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";

const personas = [
  { id: "antonio", label: "Antonio", desc: "Strategic · Direct", gradient: "from-amber-500 to-orange-600" },
  { id: "mariana", label: "Mariana", desc: "Thoughtful · Supportive", gradient: "from-violet-500 to-purple-600" },
  { id: "both", label: "Both", desc: "Full spectrum", gradient: "from-amber-500 via-rose-500 to-violet-500" },
];

export default function PersonaSelector({ active, onChange }) {
  return (
    <div className="flex items-center gap-2">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => !p.locked && onChange(p.id)}
          disabled={p.locked}
          className={cn(
            "relative px-4 py-2 rounded-xl text-xs font-medium transition-all duration-300 group",
            p.locked
              ? "text-neutral-300 bg-neutral-50/50 border border-neutral-200/50 cursor-not-allowed"
              : active === p.id
              ? "text-white shadow-lg"
              : "text-neutral-500 hover:text-neutral-700 bg-white/40 hover:bg-white/60 border border-white/30"
          )}
        >
          {active === p.id && !p.locked && (
            <motion.div
              layoutId="persona-bg"
              className={cn("absolute inset-0 rounded-xl bg-gradient-to-r", p.gradient)}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {p.label}
            {p.locked && (
              <Lock className="w-3 h-3 text-neutral-400" />
            )}
          </span>
          {p.locked && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              <div className="bg-neutral-800 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap shadow-lg">
                Coming soon
              </div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-neutral-800" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}