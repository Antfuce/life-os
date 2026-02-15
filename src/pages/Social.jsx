import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Users, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SocialMatchCard from "../components/social/SocialMatchCard";

export default function Social() {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const queryClient = useQueryClient();

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["socialMatches"],
    queryFn: () => base44.entities.SocialMatch.list("-relevance_score", 50),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.SocialMatch.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["socialMatches"] }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const memories = await base44.entities.UserMemory.list("-created_date", 50);
      const userContext = memories
        .map((m) => `${m.key}: ${m.value}`)
        .join(", ");

      const prompt = `Based on this user profile: ${userContext}

Generate 3 personalized social suggestions in this exact JSON format:
{
  "matches": [
    {
      "match_type": "friend|networking|event|community",
      "title": "Short title",
      "description": "Brief description",
      "relevance_score": 85,
      "why_matched": "Why this is a good match for the user",
      "action_items": ["Action 1", "Action 2"],
      "metadata": {
        "location": "City",
        "date": "2026-03-15",
        "url": "https://example.com"
      }
    }
  ]
}

Be specific and realistic. Include real communities, events, or networking opportunities that match their career and interests.`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            matches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  match_type: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  relevance_score: { type: "number" },
                  why_matched: { type: "string" },
                  action_items: { type: "array", items: { type: "string" } },
                  metadata: { type: "object" },
                },
              },
            },
          },
        },
      });

      const created = [];
      for (const match of res.matches) {
        const c = await base44.entities.SocialMatch.create(match);
        created.push(c);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["socialMatches"] });
    },
  });

  const filteredMatches = matches.filter((m) => {
    if (filter === "all") return m.status !== "dismissed";
    if (filter === "active") return ["suggested", "interested"].includes(m.status);
    return m.match_type === filter;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-neutral-50 to-stone-100">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("Home")}>
              <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/60 transition-colors border border-white/30">
                <ArrowLeft className="w-4 h-4 text-neutral-500" />
              </button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-500" />
                <h1 className="text-2xl font-light text-neutral-800 tracking-tight">Social Matches</h1>
              </div>
              <p className="text-xs text-neutral-400 tracking-wide mt-0.5">
                People, events, and communities for you
              </p>
            </div>
          </div>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="gap-2 bg-neutral-900 hover:bg-neutral-800"
          >
            <Sparkles className="w-4 h-4" />
            {generateMutation.isPending ? "Generating..." : "Generate Matches"}
          </Button>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="mb-8">
          <TabsList className="bg-white/60 backdrop-blur-sm border border-white/40">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="friend">Friends</TabsTrigger>
            <TabsTrigger value="networking">Networking</TabsTrigger>
            <TabsTrigger value="event">Events</TabsTrigger>
            <TabsTrigger value="community">Communities</TabsTrigger>
          </TabsList>
        </Tabs>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 rounded-2xl bg-white/40 animate-pulse" />
              ))}
            </div>
          ) : filteredMatches.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <Users className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
              <p className="text-neutral-400 text-sm">No matches yet.</p>
              <p className="text-neutral-300 text-xs mt-1">
                Generate personalized suggestions based on your profile.
              </p>
            </motion.div>
          ) : (
            <div className="grid gap-4">
              {filteredMatches.map((match) => (
                <SocialMatchCard
                  key={match.id}
                  match={match}
                  onStatusChange={(m, status) => updateMutation.mutate({ id: m.id, status })}
                  onView={setSelected}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}