import React from "react";
import { motion } from "framer-motion";
import { FileText, ChevronRight } from "lucide-react";

/**
 * Inline mini-CV preview that appears in chat
 * Shows first few fields, tap to expand full module
 */
export default function InlineCVPreview({ cvData, onExpand }) {
  const hasContent = cvData?.name || cvData?.experience?.length > 0 || cvData?.skills?.length > 0;

  if (!hasContent) return null;

  const sections = [
    cvData.name && "Name",
    cvData.experience?.length > 0 && `${cvData.experience.length} roles`,
    cvData.education?.length > 0 && `${cvData.education.length} schools`,
    cvData.skills?.length > 0 && `${cvData.skills.length} skills`,
  ].filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 p-3 bg-gradient-to-r from-violet-50 to-white border border-violet-100 rounded-xl cursor-pointer hover:shadow-md transition-shadow"
      onClick={onExpand}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-800 truncate">
            {cvData.name || "Building your CV..."}
          </p>
          <p className="text-xs text-neutral-500">
            {sections.join(" · ") || "Add more details..."}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
      </div>

      {/* Mini progress bar */}
      <div className="mt-2 flex gap-1">
        {["name", "experience", "education", "skills"].map((field) => {
          const has = cvData[field] && (Array.isArray(cvData[field]) ? cvData[field].length > 0 : true);
          return (
            <div
              key={field}
              className={`h-1 flex-1 rounded-full ${has ? "bg-violet-500" : "bg-violet-100"}`}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
