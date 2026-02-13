import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { jsPDF } from "jspdf";
import ModernTemplate from "./templates/ModernTemplate";
import ClassicTemplate from "./templates/ClassicTemplate";
import MinimalTemplate from "./templates/MinimalTemplate";
import CVTemplateSelector from "./CVTemplateSelector";

const TEMPLATES = {
  modern: ModernTemplate,
  classic: ClassicTemplate,
  minimal: MinimalTemplate,
};

export default function LiveCVPreview({ cvData, onDownload }) {
  const [selectedTemplate, setSelectedTemplate] = useState("modern");
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const {
    name = "",
    email = "",
    phone = "",
    location = "",
    summary = "",
    experience = [],
    education = [],
    skills = [],
  } = cvData || {};

  const hasContent = name || email || experience.length > 0 || education.length > 0;

  const formatDateRange = (startDate, endDate, isCurrent) => {
    if (!startDate) return "";
    if (isCurrent) return `${startDate} — Present`;
    if (endDate) return `${startDate} — ${endDate}`;
    return startDate;
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    let y = 20;

    // Header
    doc.setFontSize(24);
    doc.text(name || "Your Name", 20, y);
    y += 10;

    doc.setFontSize(10);
    if (email) doc.text(email, 20, y);
    if (phone) doc.text(phone, email ? 80 : 20, y);
    if (location) doc.text(location, 140, y);
    y += 15;

    // Summary
    if (summary) {
      doc.setFontSize(12);
      doc.text("Professional Summary", 20, y);
      y += 7;
      doc.setFontSize(10);
      const summaryLines = doc.splitTextToSize(summary, 170);
      doc.text(summaryLines, 20, y);
      y += summaryLines.length * 5 + 10;
    }

    // Experience
    if (experience.length > 0) {
      doc.setFontSize(12);
      doc.text("Experience", 20, y);
      y += 7;
      doc.setFontSize(10);
      experience.forEach((exp) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.setFont(undefined, "bold");
        doc.text(exp.title || "", 20, y);
        doc.setFont(undefined, "normal");
        doc.text(exp.company || "", 100, y);
        y += 5;
        if (exp.duration) {
          doc.text(exp.duration, 20, y);
          y += 5;
        }
        if (exp.description) {
          const descLines = doc.splitTextToSize(exp.description, 170);
          doc.text(descLines, 20, y);
          y += descLines.length * 5 + 5;
        }
        y += 5;
      });
    }

    // Education
    if (education.length > 0) {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.text("Education", 20, y);
      y += 7;
      doc.setFontSize(10);
      education.forEach((edu) => {
        doc.setFont(undefined, "bold");
        doc.text(edu.degree || "", 20, y);
        doc.setFont(undefined, "normal");
        y += 5;
        doc.text(edu.institution || "", 20, y);
        if (edu.year) doc.text(edu.year, 150, y);
        y += 8;
      });
    }

    // Skills
    if (skills.length > 0) {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.text("Skills", 20, y);
      y += 7;
      doc.setFontSize(10);
      doc.text(skills.join(" • "), 20, y);
    }

    doc.save(`${name || "CV"}.pdf`);
    onDownload?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full h-full bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">Live CV Preview</h3>
            <p className="text-[10px] text-neutral-400">Building as you speak</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplateSelector(!showTemplateSelector)}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5"
          >
            🎨 Templates
            <ChevronDown className="w-3 h-3" />
          </button>
          <Button
            onClick={handleDownload}
            disabled={!hasContent}
            size="sm"
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
          >
            <Download className="w-3 h-3 mr-1.5" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Template Selector */}
      <AnimatePresence>
        {showTemplateSelector && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-6 py-4 border-b border-neutral-100 bg-neutral-50"
          >
            <CVTemplateSelector
              cvData={cvData}
              selectedTemplate={selectedTemplate}
              onSelect={(templateId) => {
                setSelectedTemplate(templateId);
                setShowTemplateSelector(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
                Start chatting about your experience,
                <br />
                and watch your CV build itself here
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {React.createElement(TEMPLATES[selectedTemplate] || ModernTemplate, { cvData })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  // Old single-template rendering code (commented out for reference)
  /*
            <div className="max-w-2xl mx-auto bg-white shadow-lg p-12 rounded-lg"
            >
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
                          <span className="text-xs text-neutral-500">{formatDateRange(exp.start_date, exp.end_date, exp.current) || exp.duration}</span>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}