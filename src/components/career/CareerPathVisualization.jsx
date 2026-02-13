import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Target, Sparkles, X, ChevronRight, Award, BookOpen, ExternalLink, Lightbulb, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

export default function CareerPathVisualization({ pathData, onClose }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goals, setGoals] = useState([]);
  const [goalForm, setGoalForm] = useState({
    target_role: "",
    target_timeframe: "",
    skills_to_develop: [],
    notes: "",
  });

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    const userGoals = await base44.entities.CareerGoal.list("-created_date", 10);
    setGoals(userGoals);
  };

  const saveGoal = async () => {
    await base44.entities.CareerGoal.create({
      ...goalForm,
      current_status: "not_started",
    });
    setGoalForm({ target_role: "", target_timeframe: "", skills_to_develop: [], notes: "" });
    setShowGoalForm(false);
    loadGoals();
  };

  // Parse path data into structured nodes
  const nodes = pathData.map((item, index) => ({
    id: index,
    title: item.role || item.title,
    timeframe: item.timeframe,
    skills: item.skills || [],
    experience: item.experience,
    description: item.description,
    isCurrent: item.isCurrent || false,
    learningResources: item.learningResources || [],
    skillBuildingTips: item.skillBuildingTips || "",
  }));

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 via-rose-500 to-violet-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-800">Career Path</h3>
              <p className="text-[10px] text-neutral-400">Your roadmap to success</p>
            </div>
          </div>
          <Button onClick={onClose} variant="ghost" size="sm">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>



      {/* Active Goals Display */}
      {goals.length > 0 && !showGoalForm && (
        <div className="border-b border-neutral-200 bg-white/50 px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <Flag className="w-3 h-3 text-violet-500" />
            <span className="font-medium">Your Goals:</span>
            <div className="flex flex-wrap gap-2">
              {goals.filter(g => g.current_status !== "achieved").slice(0, 3).map((goal) => (
                <span key={goal.id} className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px]">
                  {goal.target_role} ({goal.target_timeframe})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Visual Roadmap */}
      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {nodes.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center"
            >
              <Target className="w-12 h-12 text-neutral-300 mb-4" />
              <p className="text-sm text-neutral-400">
                Tell me about your career goals,
                <br />
                and I'll map out your journey
              </p>
            </motion.div>
          ) : (
            <motion.div key="content" className="space-y-8 max-w-2xl mx-auto pb-8">
              {/* Fluorescent Chain Visualization */}
              <div className="relative">
                {nodes.map((node, index) => (
                  <div key={node.id} className="relative">
                    {/* Connection Line */}
                    {index > 0 && (
                      <div className="absolute left-6 -top-4 w-0.5 h-8 bg-gradient-to-b from-violet-300 via-rose-300 to-amber-300 opacity-60" />
                    )}

                    {/* Node Card */}
                    <motion.button
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => setSelectedNode(selectedNode?.id === node.id ? null : node)}
                      className={cn(
                        "w-full text-left group relative",
                        "transition-all duration-300"
                      )}
                    >
                      <div className="flex items-start gap-4">
                        {/* Glowing Node */}
                        <div
                          className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 relative",
                            "transition-all duration-300",
                            node.isCurrent
                              ? "bg-gradient-to-br from-amber-400 via-rose-400 to-violet-500 shadow-lg shadow-violet-500/30"
                              : "bg-gradient-to-br from-amber-500/20 via-rose-500/20 to-violet-600/20 hover:from-amber-500/30 hover:via-rose-500/30 hover:to-violet-600/30"
                          )}
                        >
                          {node.isCurrent ? (
                            <Sparkles className="w-5 h-5 text-white" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-gradient-to-br from-amber-400 to-violet-500" />
                          )}
                          
                          {/* Pulse effect for current node */}
                          {node.isCurrent && (
                            <motion.div
                              className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400 via-rose-400 to-violet-500 opacity-30"
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            />
                          )}
                        </div>

                        {/* Content Card */}
                        <div
                          className={cn(
                            "flex-1 bg-white rounded-xl p-4 border transition-all duration-300",
                            selectedNode?.id === node.id
                              ? "border-violet-300 shadow-md shadow-violet-100"
                              : "border-neutral-200 hover:border-violet-200 hover:shadow-sm"
                          )}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                                {node.title}
                                {node.isCurrent && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-violet-100 text-violet-700 font-medium">
                                    You are here
                                  </span>
                                )}
                              </h4>
                              {node.timeframe && (
                                <p className="text-xs text-neutral-500 mt-1">{node.timeframe}</p>
                              )}
                            </div>
                            <ChevronRight
                              className={cn(
                                "w-4 h-4 text-neutral-400 transition-transform",
                                selectedNode?.id === node.id && "rotate-90"
                              )}
                            />
                          </div>

                          {node.description && (
                            <p className="text-xs text-neutral-600 leading-relaxed">{node.description}</p>
                          )}

                          {/* Expanded Details */}
                          <AnimatePresence>
                            {selectedNode?.id === node.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-3 pt-3 border-t border-neutral-100 space-y-3"
                              >
                                {/* Required Skills */}
                                {node.skills.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <BookOpen className="w-3 h-3 text-violet-500" />
                                      <span className="text-[10px] font-semibold text-neutral-700 uppercase tracking-wider">
                                        Skills Needed
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {node.skills.map((skill, i) => (
                                        <span
                                          key={i}
                                          className="text-[10px] px-2 py-1 rounded-lg bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700 border border-violet-100"
                                        >
                                          {skill}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Experience Required */}
                                {node.experience && (
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <Award className="w-3 h-3 text-amber-500" />
                                      <span className="text-[10px] font-semibold text-neutral-700 uppercase tracking-wider">
                                        Experience
                                      </span>
                                    </div>
                                    <p className="text-xs text-neutral-600 bg-amber-50 rounded-lg p-2 border border-amber-100">
                                      {node.experience}
                                    </p>
                                  </div>
                                )}

                                {/* Skill Building Tips */}
                                {node.skillBuildingTips && (
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <Lightbulb className="w-3 h-3 text-rose-500" />
                                      <span className="text-[10px] font-semibold text-neutral-700 uppercase tracking-wider">
                                        How to Develop These Skills
                                      </span>
                                    </div>
                                    <p className="text-xs text-neutral-600 bg-rose-50 rounded-lg p-2 border border-rose-100 leading-relaxed">
                                      {node.skillBuildingTips}
                                    </p>
                                  </div>
                                )}

                                {/* Learning Resources */}
                                {node.learningResources.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <ExternalLink className="w-3 h-3 text-blue-500" />
                                      <span className="text-[10px] font-semibold text-neutral-700 uppercase tracking-wider">
                                        Recommended Learning
                                      </span>
                                    </div>
                                    <div className="space-y-2">
                                      {node.learningResources.map((resource, i) => (
                                        <div
                                          key={i}
                                          className="flex items-start gap-2 text-xs bg-blue-50 rounded-lg p-2 border border-blue-100 hover:border-blue-200 transition-colors"
                                        >
                                          <div className="flex-1">
                                            <p className="font-medium text-blue-900">{resource.course || resource.title}</p>
                                            {resource.article && (
                                              <p className="text-blue-700 text-[10px] mt-0.5">{resource.article}</p>
                                            )}
                                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] bg-blue-100 text-blue-600">
                                              {resource.type?.replace(/_/g, " ") || "resource"}
                                            </span>
                                          </div>
                                          <ExternalLink className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.button>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: nodes.length * 0.1 + 0.2 }}
                className="flex items-center justify-center gap-4 text-[10px] text-neutral-400 pt-4"
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-br from-amber-400 to-violet-500" />
                  <span>Career Step</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  <span>Current Position</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}