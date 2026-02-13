import { base44 } from "@/api/base44Client";

/**
 * Hook that encapsulates all conversation, LLM, and data processing logic.
 * Removes the need for massive prompt strings and complex logic in components.
 */
export function useConversationService() {
  const assessContextConfidence = (memories) => {
    const criticalKeys = ["name", "age", "current_role", "company", "years_experience"];
    const confidence = {};
    
    criticalKeys.forEach(key => {
      const mem = memories.find(m => m.key.toLowerCase().includes(key.toLowerCase()));
      if (mem && mem.value && mem.value.length > 5) {
        confidence[key] = { value: mem.value, confidence: 95 };
      }
    });
    
    return confidence;
  };

  const getRelevantMemories = async (userMessage) => {
    const allMemories = await base44.entities.UserMemory.list("-created_date", 100);
    
    const msg = userMessage.toLowerCase();
    
    const categoryPatterns = {
      career: /career|job|work|role|salary|skill|interview|cv|resume|experience|company|apply|position|promotion|raise|negotiat/,
      lifestyle: /lifestyle|hobby|interest|hobby|exercise|health|wellness|routine|daily|habit|balance|life|personal|free.time/,
      social: /friend|social|community|network|event|meet|connection|relationship|friend|contact|people|introduce|gathering|club/,
      travel: /travel|trip|destination|visit|location|country|city|abroad|vacation|passport|flight/
    };
    
    const scoredMemories = allMemories.map(memory => {
      let score = 0;
      
      if (categoryPatterns.career.test(msg)) score += memory.category === 'career' ? 50 : 0;
      if (categoryPatterns.social.test(msg)) score += memory.category === 'social' ? 50 : 0;
      if (categoryPatterns.lifestyle.test(msg)) score += memory.category === 'lifestyle' ? 50 : 0;
      if (categoryPatterns.travel.test(msg)) score += memory.category === 'travel' ? 50 : 0;
      
      const keyLower = memory.key.toLowerCase();
      const valueLower = memory.value.toLowerCase();
      
      if (msg.includes(keyLower)) score += 30;
      if (valueLower.split(' ').some(word => msg.includes(word) && word.length > 3)) score += 15;
      
      const isComplete = valueLower.length > 10 && !/^(yes|no|maybe|unknown|not.sure|to.be.determined|tbd|n\/a|-|_)$/i.test(valueLower);
      memory.is_incomplete = !isComplete;
      memory.confidence = isComplete ? 95 : 30;
      
      return { ...memory, relevance_score: score };
    });
    
    return scoredMemories
      .filter(m => m.relevance_score > 0)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 15);
  };

  const getUserHistoryContext = async () => {
    const conversations = await base44.entities.Conversation.list("-updated_date", 10);
    if (conversations.length === 0) return null;
    
    const recentConvs = conversations.slice(0, 5).filter(c => c.summary && c.summary.length > 5);
    if (recentConvs.length === 0) return null;
    
    const historyItems = recentConvs.map((conv, idx) => {
      const date = new Date(conv.updated_date).toLocaleDateString();
      return `${date}: ${conv.summary}${conv.key_decisions?.length > 0 ? ` [Decisions: ${conv.key_decisions.join(", ")}]` : ""}`;
    });
    
    return {
      history: historyItems.join("\n"),
      extractedContext: recentConvs[0].context_extracted || {}
    };
  };

  const buildSystemPrompt = (userName, memoryContext, userHistoryContext, cvData, chatHistory) => {
    const cvDataContext = cvData && Object.keys(cvData).length > 0 
      ? `\n\n## EXISTING CV DATA:\n${JSON.stringify(cvData, null, 2)}\n\nIMPORTANT: Build on existing data, don't start from scratch.`
      : "\n\n## NO CV DATA YET";

    return `You are Antonio & Mariana — career and life advisors. Keep responses SHORT (2-3 lines max), conversational, and natural.

## RULES
1. NEVER re-ask information you already know
2. Proactively suggest next steps based on context
3. For CV: enhance existing data, never ask to start fresh
4. Extract and save memories (key facts) in your response

## USER CONTEXT
Name: ${userName || "Unknown"}
${memoryContext}
${userHistoryContext || ""}
${cvDataContext}

## RECENT CHAT
${chatHistory}

## RESPONSE FORMAT (ONLY valid JSON, no markdown)
{
  "chat_message": "2-3 lines max, conversational",
  "memories": [{"category": "career|lifestyle|travel|social", "key": "key_name", "value": "specific_value"}],
  "cv_data": {}
}

Return ONLY the JSON object, nothing else.`;
  };

  const buildResponseSchema = () => ({
    type: "object",
    properties: {
      chat_message: { type: "string", description: "2-3 lines max" },
      memories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["career", "lifestyle", "travel", "social"] },
            key: { type: "string" },
            value: { type: "string" }
          }
        }
      },
      cv_data: { type: "object", description: "Only if updating CV data" },
      interview_questions: { type: "array", description: "Only if generating interview questions" },
      career_path: { type: "array", description: "Only if building career path" }
    },
    required: ["chat_message"]
  });

  return {
    assessContextConfidence,
    getRelevantMemories,
    getUserHistoryContext,
    buildSystemPrompt,
    buildResponseSchema
  };
}