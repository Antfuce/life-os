import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Eye } from "lucide-react";

export default function ContextUsageDebug({ contextUsed, memoryContext, visible = false }) {
  const [expanded, setExpanded] = React.useState(false);

  if (!visible || !contextUsed?.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mt-2"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left text-xs font-medium text-violet-700 hover:text-violet-900"
        >
          <Eye className="w-3 h-3" />
          <span>Context used in this response</span>
          <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, maxHeight: 0 }}
              animate={{ opacity: 1, maxHeight: 500 }}
              exit={{ opacity: 0, maxHeight: 0 }}
              className="mt-2 pt-2 border-t border-violet-200"
            >
              <div className="space-y-1">
                {contextUsed.map((key, i) => (
                  <div key={i} className="text-[11px] text-violet-600 pl-2">
                    ✓ {key}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-violet-500 mt-2 italic">
                This shows what the AI actually referenced to answer you — helps debug "stateless" behavior.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}