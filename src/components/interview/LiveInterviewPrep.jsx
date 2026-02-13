import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Lightbulb, X, MessageCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function LiveInterviewPrep({ questions, onClose, onAnswer }) {
  const [mockMode, setMockMode] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setAnswer("");
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setMockMode(false);
      setCurrentQuestionIndex(0);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full h-full flex flex-col"
    >
      <div className="flex-shrink-0 px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-800">Interview Prep</h3>
              <p className="text-[10px] text-neutral-400">
                {mockMode ? `Question ${currentQuestionIndex + 1} of ${questions.length}` : `${questions.length} questions ready`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {questions.length > 0 && !mockMode && (
              <Button onClick={() => setMockMode(true)} size="sm" variant="outline" className="text-xs">
                <Mic className="w-3 h-3 mr-1" />
                Start Mock Interview
              </Button>
            )}
            <Button onClick={onClose} variant="ghost" size="sm">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
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
                and I'll prepare tailored interview questions
              </p>
            </motion.div>
          ) : mockMode ? (
            <motion.div
              key="mock"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl p-8 border border-violet-100">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {currentQuestionIndex + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                      {questions[currentQuestionIndex].question}
                    </h3>
                    {questions[currentQuestionIndex].tip && (
                      <p className="text-xs text-violet-700 bg-white/60 rounded-lg p-3 border border-violet-200">
                        💡 {questions[currentQuestionIndex].tip}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-neutral-600 flex items-center gap-2">
                    <MessageCircle className="w-3 h-3" />
                    Your answer
                  </label>
                  <Textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Take your time and craft your response..."
                    className="min-h-[160px] text-sm"
                  />
                  
                  {questions[currentQuestionIndex].followup && answer.length > 50 && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200"
                    >
                      <span className="font-semibold">Follow-up:</span> {questions[currentQuestionIndex].followup}
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMockMode(false);
                    setCurrentQuestionIndex(0);
                    setAnswer("");
                  }}
                >
                  Exit Mock Interview
                </Button>
                <Button
                  onClick={handleNextQuestion}
                  disabled={!answer.trim()}
                  className="bg-gradient-to-r from-violet-500 to-purple-600"
                >
                  {currentQuestionIndex === questions.length - 1 ? "Finish" : "Next Question"}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="content" className="space-y-4 max-w-2xl mx-auto">
              {questions.map((q, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-xl p-5 shadow-sm border border-neutral-100 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 space-y-2">
                      <h4 className="text-sm font-semibold text-neutral-900">{q.question}</h4>
                      {q.tip && (
                        <p className="text-xs text-neutral-600 bg-amber-50 rounded-lg p-2 border border-amber-100">
                          💡 {q.tip}
                        </p>
                      )}
                      {q.followup && (
                        <p className="text-xs text-violet-600 bg-violet-50 rounded-lg p-2 border border-violet-100">
                          🔄 Follow-up: {q.followup}
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