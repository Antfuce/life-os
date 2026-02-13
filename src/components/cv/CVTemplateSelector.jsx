import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import ModernTemplate from "./templates/ModernTemplate";
import ClassicTemplate from "./templates/ClassicTemplate";
import MinimalTemplate from "./templates/MinimalTemplate";

const TEMPLATES = [
  {
    id: "modern",
    name: "Modern",
    description: "Bold colors & clean design",
    icon: "✨",
    Component: ModernTemplate,
    industries: ["Tech", "Startup", "Creative"]
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional & professional",
    icon: "📋",
    Component: ClassicTemplate,
    industries: ["Finance", "Law", "Corporate"]
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Elegant & ATS-optimized",
    icon: "◊",
    Component: MinimalTemplate,
    industries: ["All industries", "ATS-friendly"]
  }
];

export default function CVTemplateSelector({ cvData, selectedTemplate = "modern", onSelect }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div className="w-full">
      {/* Template Grid */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {TEMPLATES.map((template) => (
          <motion.button
            key={template.id}
            onClick={() => onSelect(template.id)}
            onHoverStart={() => setHoveredId(template.id)}
            onHoverEnd={() => setHoveredId(null)}
            className={`relative p-4 rounded-lg transition-all ${
              selectedTemplate === template.id
                ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg"
                : "bg-white border border-gray-200 text-gray-900 hover:border-blue-300"
            }`}
          >
            <div className="text-2xl mb-2">{template.icon}</div>
            <p className="text-xs font-semibold">{template.name}</p>
            <p className="text-[10px] opacity-70 mt-1">{template.description}</p>
            {selectedTemplate === template.id && (
              <motion.div
                layoutId="selected"
                className="absolute top-2 right-2 w-3 h-3 rounded-full bg-white"
              />
            )}
          </motion.button>
        ))}
      </div>

      {/* Preview */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedTemplate}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-96 overflow-y-auto"
        >
          <div className="scale-[0.6] origin-top-left">
            {TEMPLATES.find(t => t.id === selectedTemplate)?.Component && (
              React.createElement(TEMPLATES.find(t => t.id === selectedTemplate)?.Component, { cvData })
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Industries */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Best for</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.find(t => t.id === selectedTemplate)?.industries.map((ind, i) => (
            <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 text-[10px] rounded">{ind}</span>
          ))}
        </div>
      </div>
    </div>
  );
}