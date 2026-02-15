import React from "react";
import { motion } from "framer-motion";
import { FileText, ChevronRight, Edit, Download } from "lucide-react";

/**
 * InlineCVPreview - Event-driven mini CV preview for chat
 * Backend controls what actions are available
 * 
 * Props:
 * - deliverable: { type: 'cv', data: {...}, actions: [...] }
 * - onAction: (actionName, deliverable) => void
 */
export default function InlineCVPreview({ deliverable, onAction }) {
  const data = deliverable?.data || {};
  const actions = deliverable?.actions || [];
  
  const {
    name = "",
    experience = [],
    education = [],
    skills = [],
    sections = [],
  } = data;

  const hasContent = name || experience.length > 0 || education.length > 0 || skills.length > 0 || sections.length > 0;

  if (!hasContent) return null;

  // Check available actions from backend
  const canEdit = actions.some(a => a.action === 'cv.edit');
  const canExportPDF = actions.some(a => a.action === 'cv.export.pdf');

  // Handle action clicks
  const handleAction = (actionName, e) => {
    if (e) e.stopPropagation();
    if (onAction) {
      onAction(actionName, deliverable);
    }
  };

  const summaryItems = [
    name && "Name",
    experience?.length > 0 && `${experience.length} roles`,
    education?.length > 0 && `${education.length} schools`,
    skills?.length > 0 && `${skills.length} skills`,
    sections?.length > 0 && `${sections.length} sections`,
  ].filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 p-3 bg-gradient-to-r from-violet-50 to-white border border-violet-100 rounded-xl cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => handleAction('cv.expand')}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-800 truncate">
            {name || "Your CV"}
          </p>
          <p className="text-xs text-neutral-500">
            {summaryItems.join(" · ") || "CV Ready"}
          </p>
        </div>
        
        {/* Action buttons from backend */}
        <div className="flex gap-1">
          {canEdit && (
            <button 
              onClick={(e) => handleAction('cv.edit', e)}
              className="p-1.5 rounded-md hover:bg-violet-100 text-violet-600 transition-colors"
              title="Edit CV"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
          )}
          {canExportPDF && (
            <button 
              onClick={(e) => handleAction('cv.export.pdf', e)}
              className="p-1.5 rounded-md hover:bg-violet-100 text-violet-600 transition-colors"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0 self-center" />
        </div>
      </div>

      {/* Progress indicators */}
      <div className="mt-2 flex gap-1">
        {['name', 'experience', 'education', 'skills'].map((field) => {
          const has = data[field] && (Array.isArray(data[field]) ? data[field].length > 0 : true);
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
