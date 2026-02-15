import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import DeliverableCard from "../components/deliverables/DeliverableCard";
import ReactMarkdown from "react-markdown";

const statusColors = {
  draft: "bg-neutral-100 text-neutral-600",
  ready: "bg-emerald-50 text-emerald-700",
  sent: "bg-blue-50 text-blue-700",
  completed: "bg-violet-50 text-violet-700",
};

export default function Deliverables() {
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ["deliverables"],
    queryFn: () => base44.entities.Deliverable.list("-created_date", 50),
  });

  const handleCopy = () => {
    if (selected?.content) {
      navigator.clipboard.writeText(selected.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-neutral-50 to-stone-100">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-10">
          <Link to={createPageUrl("Home")}>
            <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/60 transition-colors border border-white/30">
              <ArrowLeft className="w-4 h-4 text-neutral-500" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-light text-neutral-800 tracking-tight">Deliverables</h1>
            <p className="text-xs text-neutral-400 tracking-wide mt-0.5">Everything we've built for you</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-neutral-400 hover:text-neutral-600 mb-6 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back to all
              </button>

              <div className="bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl p-8 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-800">{selected.title}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className={cn("text-[10px]", statusColors[selected.status])}>
                        {selected.status}
                      </Badge>
                      {selected.metadata?.target_company && (
                        <span className="text-xs text-neutral-400">{selected.metadata.target_company}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="gap-2 text-xs"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <div className="prose prose-sm prose-neutral max-w-none">
                  <ReactMarkdown>{selected.content || "No content yet."}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-2xl bg-white/40 animate-pulse" />
                  ))}
                </div>
              ) : deliverables.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-neutral-400 text-sm">No deliverables yet.</p>
                  <p className="text-neutral-300 text-xs mt-1">
                    Start a conversation to get CVs, emails, and more.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {deliverables.map((d) => (
                    <DeliverableCard key={d.id} deliverable={d} onClick={setSelected} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}