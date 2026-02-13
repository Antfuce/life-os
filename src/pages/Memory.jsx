import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Brain, Briefcase, MapPin, Target, DollarSign, Wrench, Heart, Plane, Users, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { cn } from "@/lib/utils";

const categoryConfig = {
  career: { icon: Briefcase, color: "text-amber-600 bg-amber-50", label: "Career" },
  lifestyle: { icon: Heart, color: "text-rose-600 bg-rose-50", label: "Lifestyle" },
  travel: { icon: Plane, color: "text-blue-600 bg-blue-50", label: "Travel" },
  social: { icon: Users, color: "text-violet-600 bg-violet-50", label: "Social" },
};

const keyIcons = {
  current_role: Briefcase,
  target_role: Target,
  location_preference: MapPin,
  salary_range: DollarSign,
  skills: Wrench,
};

export default function Memory() {
  const queryClient = useQueryClient();

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["memories"],
    queryFn: () => base44.entities.UserMemory.list("-created_date", 100),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.UserMemory.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
  });

  const grouped = memories.reduce((acc, mem) => {
    const cat = mem.category || "career";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mem);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-neutral-50 to-stone-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-10">
          <Link to={createPageUrl("Home")}>
            <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/60 transition-colors border border-white/30">
              <ArrowLeft className="w-4 h-4 text-neutral-500" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-violet-500" />
              <h1 className="text-2xl font-light text-neutral-800 tracking-tight">Memory</h1>
            </div>
            <p className="text-xs text-neutral-400 tracking-wide mt-0.5">
              Everything we remember about you
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-white/40 animate-pulse" />
            ))}
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-20">
            <Brain className="w-10 h-10 text-neutral-200 mx-auto mb-4" />
            <p className="text-neutral-400 text-sm">No memories yet.</p>
            <p className="text-neutral-300 text-xs mt-1">
              Chat with Antonio & Mariana to start building your profile.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([category, mems]) => {
              const config = categoryConfig[category] || categoryConfig.career;
              const CatIcon = config.icon;
              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", config.color)}>
                      <CatIcon className="w-3.5 h-3.5" />
                    </div>
                    <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">
                      {config.label}
                    </h2>
                  </div>

                  <div className="space-y-2">
                    {mems.map((mem) => {
                      const KeyIcon = keyIcons[mem.key] || Brain;
                      return (
                        <div
                          key={mem.id}
                          className="flex items-center gap-4 p-4 rounded-xl bg-white/70 backdrop-blur-sm border border-white/40 group"
                        >
                          <KeyIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.1em] text-neutral-400">
                              {mem.key?.replace(/_/g, " ")}
                            </p>
                            <p className="text-sm text-neutral-700 font-medium truncate">{mem.value}</p>
                          </div>
                          <button
                            onClick={() => deleteMutation.mutate(mem.id)}
                            className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}