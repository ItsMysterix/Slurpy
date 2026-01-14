import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface SessionSummaryInput {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    emotion?: string;
    topics?: string[];
  }>;
  dominantEmotion?: string;
  topics: string[];
  previousSummaries?: Array<{
    date: string;
    summary: string;
    progressIndicators?: any;
  }>;
}

export interface SessionSummaryOutput {
  summary: string;
  keyInsights: string[];
  progressIndicators: {
    emotional_state: "improving" | "stable" | "declining" | "mixed";
    coping_skills: "developing" | "consistent" | "needs_support";
    resilience: "strengthening" | "maintaining" | "challenged";
    engagement: "high" | "moderate" | "low";
    primary_concerns: string[];
    positive_changes: string[];
  };
}

/**
 * Generate a therapeutic session summary using AI
 * This summary will be used to build insights and track progress over time
 */
export async function generateSessionSummary(
  input: SessionSummaryInput
): Promise<SessionSummaryOutput> {
  const { messages, dominantEmotion, topics, previousSummaries = [] } = input;

  // Build context from previous sessions to track progress
  const progressContext = previousSummaries.length > 0
    ? `Previous sessions:\n${previousSummaries.slice(-3).map(s => 
        `- ${s.date}: ${s.summary.substring(0, 150)}...${s.progressIndicators ? ` [${s.progressIndicators.emotional_state}]` : ''}`
      ).join("\n")}\n\n`
    : "";

  const systemPrompt = `You are a professional therapist analyzing a chat session to generate a clinical summary.

Your task:
1. Summarize the session in 2-3 sentences (focus on themes, emotions, and progress)
2. Extract 2-3 key insights or takeaways
3. Assess progress indicators compared to previous sessions

Guidelines:
- Be objective and clinical in your assessment
- Note both challenges and strengths
- Identify patterns and progress trends
- Recognize coping strategies used
- Focus on actionable insights

Return ONLY valid JSON with this structure:
{
  "summary": "2-3 sentence session summary",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "progressIndicators": {
    "emotional_state": "improving" | "stable" | "declining" | "mixed",
    "coping_skills": "developing" | "consistent" | "needs_support",
    "resilience": "strengthening" | "maintaining" | "challenged",
    "engagement": "high" | "moderate" | "low",
    "primary_concerns": ["concern1", "concern2"],
    "positive_changes": ["change1", "change2"]
  }
}`;

  const userPrompt = `${progressContext}Current session analysis:
- Dominant emotion: ${dominantEmotion || "not specified"}
- Topics discussed: ${topics.join(", ") || "general conversation"}
- Message count: ${messages.length}

Recent conversation context (last 10 messages):
${messages.slice(-10).map(m => `${m.role}: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`).join("\n\n")}

Generate the session summary and progress assessment.`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (textContent && textContent.type === "text") {
      const text = textContent.text;
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result;
      }
    }

    // Fallback
    return generateFallbackSummary(messages, dominantEmotion, topics);
  } catch (error) {
    console.error("[generateSessionSummary] Error:", error);
    return generateFallbackSummary(messages, dominantEmotion, topics);
  }
}

/**
 * Generate a simple fallback summary without AI
 */
function generateFallbackSummary(
  messages: any[],
  dominantEmotion?: string,
  topics: string[] = []
): SessionSummaryOutput {
  const summary = `User discussed ${topics.join(", ") || "various topics"} ${
    dominantEmotion ? `with a dominant emotion of ${dominantEmotion}` : ""
  }. Session included ${messages.length} messages.`;

  return {
    summary,
    keyInsights: [
      `Discussed ${topics[0] || "personal matters"}`,
      `Emotion: ${dominantEmotion || "varied"}`,
    ],
    progressIndicators: {
      emotional_state: "stable",
      coping_skills: "consistent",
      resilience: "maintaining",
      engagement: messages.length > 10 ? "high" : messages.length > 5 ? "moderate" : "low",
      primary_concerns: topics.slice(0, 2),
      positive_changes: [],
    },
  };
}
