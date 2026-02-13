import React from "react";
import { motion } from "framer-motion";
import { Users, Calendar, MapPin, Sparkles, ExternalLink, ThumbsUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const typeConfig = {
  friend: { icon: Users, label: "Friend Match", color: "text-rose-600 bg-rose-50" },
  networking: { icon: Users, label: "Networking", color: "text-blue-600 bg-blue-50" },
  event: { icon: Calendar, label: "Event", color: "text-violet-600 bg-violet-50" },
  community: { icon: Users, label: "Community", color: "text-emerald-600 bg-emerald-50" },
};

const statusColors = {
  suggested: "bg-amber-50 text-amber-700",
  interested: "bg-blue-50 text-blue-700",
  contacted: "bg-violet-50 text-violet-700",
  completed: "bg-emerald-50 text-emerald-700",
  dismissed: "bg-neutral-100 text-neutral-500",
};

export default function SocialMatchCard({ match, onStatusChange, onView }) {
  const config = typeConfig[match.match_type] || typeConfig.friend;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300"
    >
      <div className="flex items-start gap-4 mb-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", config.color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold text-neutral-800">{match.title}</h3>
            <Badge variant="secondary" className={cn("text-[10px] font-medium flex-shrink-0", statusColors[match.status])}>
              {match.status}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">{match.description}</p>
        </div>
      </div>

      {match.relevance_score && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${match.relevance_score}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className={cn(
                "h-full rounded-full",
                match.relevance_score >= 80 ? "bg-emerald-500" :
                match.relevance_score >= 60 ? "bg-blue-500" : "bg-amber-500"
              )}
            />
          </div>
          <span className="text-[10px] text-neutral-400 font-medium">{match.relevance_score}% match</span>
        </div>
      )}

      {match.why_matched && (
        <div className="mb-4 p-3 rounded-xl bg-violet-50/50 border border-violet-100/50">
          <p className="text-xs text-neutral-600 leading-relaxed flex items-start gap-2">
            <Sparkles className="w-3 h-3 text-violet-400 mt-0.5 flex-shrink-0" />
            <span>{match.why_matched}</span>
          </p>
        </div>
      )}

      {(match.metadata?.location || match.metadata?.date) && (
        <div className="flex items-center gap-3 mb-4 text-xs text-neutral-500">
          {match.metadata.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span>{match.metadata.location}</span>
            </div>
          )}
          {match.metadata.date && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{match.metadata.date}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onStatusChange?.(match, "interested")}
          disabled={match.status === "interested" || match.status === "contacted"}
          className="flex-1 gap-2 bg-neutral-900 hover:bg-neutral-800 text-white"
        >
          <ThumbsUp className="w-3 h-3" />
          Interested
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onView?.(match)}
          className="gap-2"
        >
          View
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onStatusChange?.(match, "dismissed")}
          className="flex-shrink-0"
        >
          <X className="w-4 h-4 text-neutral-400" />
        </Button>
      </div>
    </motion.div>
  );
}