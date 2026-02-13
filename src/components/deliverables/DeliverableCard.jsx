import React from "react";
import { motion } from "framer-motion";
import { FileText, Mail, Video, UserPlus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const typeConfig = {
  cv: { icon: FileText, label: "CV", color: "text-emerald-600 bg-emerald-50" },
  cover_letter: { icon: FileText, label: "Cover Letter", color: "text-blue-600 bg-blue-50" },
  outreach_email: { icon: Mail, label: "Outreach Email", color: "text-amber-600 bg-amber-50" },
  interview_prep: { icon: Video, label: "Interview Prep", color: "text-violet-600 bg-violet-50" },
  intro_request: { icon: UserPlus, label: "Intro Request", color: "text-rose-600 bg-rose-50" },
  social_event: { icon: Sparkles, label: "Social Event", color: "text-purple-600 bg-purple-50" },
  networking_intro: { icon: UserPlus, label: "Networking Intro", color: "text-indigo-600 bg-indigo-50" },
  friend_match: { icon: UserPlus, label: "Friend Match", color: "text-pink-600 bg-pink-50" },
  community_suggestion: { icon: UserPlus, label: "Community", color: "text-cyan-600 bg-cyan-50" },
};

const statusColors = {
  draft: "bg-neutral-100 text-neutral-600",
  ready: "bg-emerald-50 text-emerald-700",
  sent: "bg-blue-50 text-blue-700",
  completed: "bg-violet-50 text-violet-700",
};

export default function DeliverableCard({ deliverable, onClick }) {
  const config = typeConfig[deliverable.type] || typeConfig.cv;
  const Icon = config.icon;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      onClick={() => onClick?.(deliverable)}
      className="w-full text-left bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 group"
    >
      <div className="flex items-start gap-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", config.color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-neutral-800 truncate">
              {deliverable.title}
            </h3>
            <Badge variant="secondary" className={cn("text-[10px] font-medium", statusColors[deliverable.status])}>
              {deliverable.status}
            </Badge>
          </div>
          {deliverable.metadata?.target_company && (
            <p className="text-xs text-neutral-400">{deliverable.metadata.target_company}</p>
          )}
          {deliverable.metadata?.target_role && (
            <p className="text-xs text-neutral-400">{deliverable.metadata.target_role}</p>
          )}
        </div>
        <Sparkles className="w-4 h-4 text-neutral-300 group-hover:text-amber-400 transition-colors" />
      </div>
    </motion.button>
  );
}