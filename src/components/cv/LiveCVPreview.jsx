import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, Sparkles, Edit, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * LiveCVPreview - Event-driven CV display
 * Backend controls the data and available actions
 * 
 * Props:
 * - deliverable: { type: 'cv', data: {...}, actions: [...] }
 * - onAction: (actionName, deliverable) => void
 * - inline: boolean (for compact inline display)
 */
export default function LiveCVPreview({ deliverable, onAction, inline = false }) {
  // Extract data from deliverable (backend-controlled)
  const data = deliverable?.data || {};
  const actions = deliverable?.actions || [];
  
  const {
    name = "",
    email = "",
    phone = "",
    location = "",
    summary = "",
    experience = [],
    education = [],
    skills = [],
    sections = [],
    markdown = "",
    json = {},
  } = data;

  const hasContent = name || experience.length > 0 || education.length > 0 || sections.length > 0;

  // Find available actions
  const canEdit = actions.some(a => a.action === 'cv.edit');
  const canExportPDF = actions.some(a => a.action === 'cv.export.pdf');
  const canExportMarkdown = actions.some(a => a.action === 'cv.export.markdown');
  const canCopy = actions.some(a => a.action === 'cv.copy');

  // Handle action clicks
  const handleAction = (actionName) => {
    if (onAction) {
      onAction(actionName, deliverable);
    }
  };

  // Inline compact view
  if (inline) {
    if (!hasContent) return null;

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
          <div className="flex gap-1">
            {canEdit && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleAction('cv.edit'); }}
                className="p-1.5 rounded-md hover:bg-violet-100 text-violet-600"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
            )}
            {canExportPDF && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleAction('cv.export.pdf'); }}
                className="p-1.5 rounded-md hover:bg-violet-100 text-violet-600"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
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

  // Full module view
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full h-full bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col"
    >
      {/* Header with actions from backend */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">CV Preview</h3>
            <p className="text-[10px] text-neutral-400">Backend-controlled view</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button
              onClick={() => handleAction('cv.edit')}
              size="sm"
              variant="outline"
            >
              <Edit className="w-3 h-3 mr-1.5" />
              Edit
            </Button>
          )}
          {canExportMarkdown && (
            <Button
              onClick={() => handleAction('cv.export.markdown')}
              size="sm"
              variant="outline"
            >
              <Copy className="w-3 h-3 mr-1.5" />
              Copy MD
            </Button>
          )}
          {canExportPDF && (
            <Button
              onClick={() => handleAction('cv.export.pdf')}
              size="sm"
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            >
              <Download className="w-3 h-3 mr-1.5" />
              PDF
            </Button>
          )}
        </div>
      </div>

      {/* CV Content */}
      <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-white to-neutral-50">
        <AnimatePresence mode="popLayout">
          {!hasContent ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center text-center"
            >
              <Sparkles className="w-12 h-12 text-neutral-300 mb-4" />
              <p className="text-sm text-neutral-400">
                Waiting for CV data from backend...
                <br />
                Start chatting about your experience
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto bg-white shadow-lg p-12 rounded-lg"
            >
              {/* Render from backend sections if available */}
              {sections.length > 0 ? (
                sections.map((section, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="mb-6"
                  >
                    <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3 border-b border-neutral-200 pb-1">
                      {section.title}
                    </h2>
                    <div className="text-sm text-neutral-700 whitespace-pre-wrap">
                      {section.content}
                    </div>
                  </motion.div>
                ))
              ) : (
                <>
                  {/* Name & Contact */}
                  {name && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6"
                    >
                      <h1 className="text-3xl font-bold text-neutral-900 mb-2">{name}</h1>
                      <div className="flex flex-wrap gap-3 text-sm text-neutral-600">
                        {email && <span>{email}</span>}
                        {phone && <span>• {phone}</span>}
                        {location && <span>• {location}</span>}
                      </div>
                    </motion.div>
                  )}

                  {/* Summary */}
                  {summary && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6"
                    >
                      <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-2 border-b border-neutral-200 pb-1">
                        Professional Summary
                      </h2>
                      <p className="text-sm text-neutral-700 leading-relaxed">{summary}</p>
                    </motion.div>
                  )}

                  {/* Experience */}
                  {experience.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6"
                    >
                      <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3 border-b border-neutral-200 pb-1">
                        Experience
                      </h2>
                      <div className="space-y-4">
                        {experience.map((exp, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <h3 className="text-sm font-semibold text-neutral-900">{exp.title}</h3>
                              <span className="text-xs text-neutral-500">{exp.duration}</span>
                            </div>
                            <p className="text-sm text-neutral-600 mb-1">{exp.company}</p>
                            {exp.description && (
                              <p className="text-xs text-neutral-600 leading-relaxed">{exp.description}</p>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Education */}
                  {education.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6"
                    >
                      <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3 border-b border-neutral-200 pb-1">
                        Education
                      </h2>
                      <div className="space-y-3">
                        {education.map((edu, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="text-sm font-semibold text-neutral-900">{edu.degree}</h3>
                                <p className="text-sm text-neutral-600">{edu.institution}</p>
                              </div>
                              <span className="text-xs text-neutral-500">{edu.year}</span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Skills */}
                  {skills.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-3 border-b border-neutral-200 pb-1">
                        Skills
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {skills.map((skill, i) => (
                          <motion.span
                            key={i}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className="px-3 py-1 bg-neutral-100 text-neutral-700 text-xs rounded-full"
                          >
                            {skill}
                          </motion.span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* Raw markdown preview (if provided) */}
              {markdown && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-6 pt-6 border-t border-neutral-200"
                >
                  <details>
                    <summary className="text-xs text-neutral-400 cursor-pointer">Raw Markdown</summary>
                    <pre className="mt-2 p-3 bg-neutral-50 rounded text-xs text-neutral-600 overflow-auto">
                      {markdown}
                    </pre>
                  </details>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
