import React from "react";
import { cn } from "@/lib/utils";

const ANTONIO_IMG = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698f3f60f5948c5b35dd08f9/2bf5fe829_15680278182562.jpeg";
const MARIANA_IMG = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698f3f60f5948c5b35dd08f9/d9e3a7cf8_1736792585340.jpeg";

export default function PersonaAvatar({ persona, size = "md" }) {
  const sizes = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-12 h-12",
  };

  const config = {
    antonio: {
      image: ANTONIO_IMG,
      gradient: "from-amber-500 to-orange-600",
      label: "A",
    },
    mariana: {
      image: MARIANA_IMG,
      gradient: "from-violet-500 to-purple-600",
      label: "M",
    },
    both: {
      gradient: "from-amber-500 via-rose-500 to-violet-500",
      label: "A·M",
    },
    executor: {
      gradient: "from-neutral-700 to-neutral-900",
      label: "E",
    },
  };

  const current = config[persona] || config.executor;

  if (persona === "both") {
    return (
      <div className={cn("relative flex items-center", sizes[size])}>
        <img
          src={ANTONIO_IMG}
          alt="Antonio"
          className="absolute left-0 w-full h-full rounded-full object-cover border-2 border-white shadow-lg z-10"
        />
        <img
          src={MARIANA_IMG}
          alt="Mariana"
          className="absolute left-3 w-full h-full rounded-full object-cover border-2 border-white shadow-lg"
        />
      </div>
    );
  }

  // If we don't have an image (e.g., executor), render a clean badge.
  if (!current.image) {
    return (
      <div
        className={cn(
          "rounded-full shadow-lg flex items-center justify-center text-white text-[10px] font-semibold",
          "bg-gradient-to-br",
          current.gradient,
          sizes[size]
        )}
      >
        {current.label}
      </div>
    );
  }

  return (
    <div className={cn("relative rounded-full overflow-hidden shadow-lg", sizes[size])}>
      <img src={current.image} alt={persona} className="w-full h-full object-cover" />
    </div>
  );
}