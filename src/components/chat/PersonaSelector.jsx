import React from "react";
import { cn } from "@/lib/utils";

const personas = [
  { id: "executor", label: "Executor", desc: "Execution-first", gradient: "from-neutral-700 to-neutral-900" },
  { id: "antonio", label: "Antonio", desc: "Strategic · Direct", gradient: "from-amber-500 to-orange-600" },
  { id: "mariana", label: "Mariana", desc: "Thoughtful · Supportive", gradient: "from-violet-500 to-purple-600" },
  { id: "both", label: "Both", desc: "Full spectrum", gradient: "from-amber-500 via-rose-500 to-violet-500" },
];

export default function PersonaSelector({ active, onChange }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full max-w-xl">
      {personas.map((p) => {
        const isActive = active === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange?.(p.id)}
            className={cn(
              "text-left rounded-2xl px-4 py-3 border transition",
              "bg-white/60 backdrop-blur-sm",
              isActive ? "border-black/30 shadow-sm" : "border-white/40 hover:border-black/15"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-neutral-800">{p.label}</div>
                <div className="text-[11px] text-neutral-500">{p.desc}</div>
              </div>
              <div className={cn("w-6 h-6 rounded-lg bg-gradient-to-br", p.gradient)} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
