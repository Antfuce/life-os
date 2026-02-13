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
          onClick={() => onChange(p.id)}
          className={cn(
            "relative px-4 py-2 rounded-xl text-xs font-medium transition-all duration-300",
            active === p.id
              ? "text-white shadow-lg"
              : "text-neutral-500 hover:text-neutral-700 bg-white/40 hover:bg-white/60 border border-white/30"
          )}
        >
          {active === p.id && (
            <motion.div
              layoutId="persona-bg"
              className={cn("absolute inset-0 rounded-xl bg-gradient-to-r", p.gradient)}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">
            {p.label}
          </span>
        </button>
      ))}
    </div>
  );
}