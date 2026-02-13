import React from "react";
import { cn } from "@/lib/utils";

export default function PersonaAvatar({ persona, size = "md" }) {
  const sizes = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-12 h-12 text-base",
  };

  const config = {
    antonio: {
      gradient: "from-amber-500 to-orange-600",
      letter: "A",
    },
    mariana: {
      gradient: "from-violet-500 to-purple-600",
      letter: "M",
    },
    both: {
      gradient: "from-amber-500 via-rose-500 to-violet-500",
      letter: "A·M",
    },
  };

  const { gradient, letter } = config[persona] || config.both;

  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center font-semibold text-white tracking-tight shadow-lg",
        gradient,
        sizes[size]
      )}
    >
      {letter}
    </div>
  );
}