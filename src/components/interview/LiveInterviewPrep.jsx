import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LiveInterviewPrep({ questions, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full h-full bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">Interview Prep</h3>
            <p className="text-[10px] text-neutral-400">Practice questions building</p>
          </div>
        </div>
        <Button onClick={onClose} variant="ghost" size="sm">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-white to-neutral-50">
        <AnimatePresence mode="popLayout">
          {questions.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center"
            >
              <Lightbulb className="w-12 h-12 text-neutral-300 mb-4" />
              <p className="text-sm text-neutral-400">
                Tell me about the role and company,
                <br />
                and I'll prepare interview questions
              </p>
            </motion.div>
          ) : (
            <motion.div key="content" className="space-y-6">
              {questions.map((q, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white rounded-xl p-6 shadow-sm border border-neutral-100"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-neutral-900 mb-2">{q.question}</h4>
                      {q.tip && (
                        <p className="text-xs text-neutral-600 bg-amber-50 rounded-lg p-3 border border-amber-100">
                          💡 <span className="font-medium">Tip:</span> {q.tip}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}