import React from "react";
import { motion } from "framer-motion";
import { FileText, Video, Briefcase, Users } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

const actions = [
  { icon: FileText, label: "Build CV", color: "from-emerald-500 to-teal-600", page: "Home", hint: "cv" },
  { icon: Video, label: "Interview Prep", color: "from-violet-500 to-purple-600", page: "InterviewPrep" },
  { icon: Briefcase, label: "Find Jobs", color: "from-blue-500 to-cyan-600", page: "Home", hint: "jobs" },
  { icon: Users, label: "Social Match", color: "from-rose-500 to-pink-600", page: "Social" },
];

export default function QuickActions({ onActionClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
      className="flex items-center justify-center gap-3"
    >
      {actions.map((action, i) => {
        const Icon = action.icon;
        const content = (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 + i * 0.1 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => action.hint && onActionClick?.(action.hint)}
            className="group relative"
          >
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center shadow-lg hover:shadow-xl transition-all`}>
              <Icon className="w-7 h-7 text-white" />
            </div>
            <p className="text-xs text-neutral-600 mt-2 font-medium">{action.label}</p>
          </motion.button>
        );

        return action.page ? (
          <Link key={action.label} to={createPageUrl(action.page)}>
            {content}
          </Link>
        ) : (
          <div key={action.label}>{content}</div>
        );
      })}
    </motion.div>
  );
}