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
    },
    mariana: {
      image: MARIANA_IMG,
      gradient: "from-violet-500 to-purple-600",
    },
    both: {
      gradient: "from-amber-500 via-rose-500 to-violet-500",
    },
  };

  const current = config[persona] || config.both;

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

  return (
    <div className={cn("relative rounded-full overflow-hidden shadow-lg", sizes[size])}>
      <img
        src={current.image}
        alt={persona}
        className="w-full h-full object-cover"
      />
    </div>
  );
}