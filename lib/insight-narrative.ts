/*
 * Narrative Generation for Weekly Reflections
 * Uses Claude (Anthropic) to generate human, thoughtful, non-clinical summaries
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.OPENAI_API_KEY,
});

interface NarrativeGenerationInput {
  emotionFrequency: Record<string, number>;
  topicFrequency: Record<string, number>;
  moodTrendDirection: "rising" | "declining" | "stable" | null;
  sessionCount: number;
  moodEntryCount: number;
  memoryContext?: string;
  timeRangeStart: string;
  timeRangeEnd: string;
}

/**
 * Generate 5-7 sentence reflection using OpenAI
 * Sounds like a thoughtful friend, not clinical or diagnostic
 */
export async function generateNarrativeSummary(
  input: NarrativeGenerationInput
): Promise<string> {
  const {
    emotionFrequency,
    topicFrequency,
    moodTrendDirection,
    sessionCount,
    moodEntryCount,
    memoryContext,
  } = input;

  // Sort emotions/topics by frequency
  const topEmotions = Object.entries(emotionFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  const topTopics = Object.entries(topicFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);

  // Build context for the prompt
  const contextLines = [];

  if (moodEntryCount > 0) {
    contextLines.push(
      `The person recorded ${moodEntryCount} mood check-ins this week.`
    );
  }

  if (sessionCount > 0) {
    contextLines.push(`They had ${sessionCount} conversations.`);
  }

  if (topEmotions.length > 0) {
    contextLines.push(
      `The dominant emotions felt this week were: ${topEmotions.join(", ")}.`
    );
  }

  if (topTopics.length > 0) {
    contextLines.push(
      `Key themes that came up: ${topTopics.join(", ")}.`
    );
  }

  if (moodTrendDirection) {
    const trendDescription = {
      rising: "Their mood has been trending upward",
      declining: "Their mood has been trending downward",
      stable: "Their mood has remained relatively consistent",
    }[moodTrendDirection];
    contextLines.push(trendDescription + " over the week.");
  }

  if (memoryContext) {
    contextLines.push(
      `Relevant context from their personal notes: ${memoryContext}`
    );
  }

  const contextString = contextLines.join(" ");

  const systemPrompt = `You are a warm, empathetic AI coach providing weekly reflections. 
Your tone is thoughtful and conversational, like a caring friend. 
- NEVER use clinical language, diagnoses, or severity labels
- NEVER provide scores, percentages, or numerical analysis
- NEVER make predictions
- Focus on observations and emotional themes
- Be encouraging and non-judgmental
- Keep reflections to 5-7 sentences`;

  const userPrompt = `Based on the following week's data, write a brief, warm weekly reflection (5-7 sentences):

${contextString}

Write a genuine, empathetic reflection that feels personal and supportive.`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((c: { type: string }) => c.type === "text");
    if (textContent && textContent.type === "text") {
      return (textContent as { type: "text"; text: string }).text;
    }

    return "Unable to generate reflection at this time.";
  } catch (error) {
    console.error("[generateNarrativeSummary] Anthropic error:", error);
    throw error;
  }
}

/**
 * Extract top emotions/themes for metadata
 */
export function extractDominantEmotions(
  emotionFreq: Record<string, number>
): string[] {
  return Object.entries(emotionFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([emotion]) => emotion);
}

export function extractRecurringThemes(
  topicFreq: Record<string, number>
): string[] {
  return Object.entries(topicFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);
}

/**
 * Generate therapist-style key insights from emotional patterns and session summaries
 * Returns actionable insights about emotional patterns, coping strategies, and growth areas
 * Tracks progress over time (e.g., "anxious patient improving")
 */
export async function generateKeyInsights(input: {
  emotionFrequency: Record<string, number>;
  topicFrequency: Record<string, number>;
  moodTrend: "rising" | "declining" | "stable" | null;
  sessionCount: number;
  moodEntryCount: number;
  memoryContext?: string;
  sessionSummaries?: Array<{
    date: string;
    summary: string;
    progressIndicators?: {
      emotional_state: string;
      coping_skills: string;
      resilience: string;
      primary_concerns: string[];
      positive_changes: string[];
    };
  }>;
}): Promise<Array<{
  title: string;
  description: string;
  icon: string;
  trend: "positive" | "negative" | "neutral";
}>> {
  const {
    emotionFrequency,
    topicFrequency,
    moodTrend,
    sessionCount,
    moodEntryCount,
    memoryContext,
    sessionSummaries = [],
  } = input;

  // Get top emotions and topics
  const topEmotions = Object.entries(emotionFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e, count]) => ({ emotion: e, count }));

  const topTopics = Object.entries(topicFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, count]) => ({ topic: t, count }));

  // Build context for AI including session summaries for progress tracking
  const contextLines = [];
  
  if (topEmotions.length > 0) {
    contextLines.push(
      `Top emotions: ${topEmotions.map(e => `${e.emotion} (${e.count}x)`).join(", ")}`
    );
  }

  if (topTopics.length > 0) {
    contextLines.push(
      `Key themes: ${topTopics.map(t => `${t.topic} (${t.count}x)`).join(", ")}`
    );
  }

  if (moodTrend) {
    contextLines.push(`Mood trend: ${moodTrend}`);
  }

  contextLines.push(`Engagement: ${sessionCount} conversations, ${moodEntryCount} mood logs`);

  // Add session summaries for progress tracking
  if (sessionSummaries.length > 0) {
    contextLines.push(`\nRecent sessions:`);
    sessionSummaries.slice(-5).forEach(s => {
      contextLines.push(`- ${s.date}: ${s.summary}`);
      if (s.progressIndicators) {
        const progress = s.progressIndicators;
        contextLines.push(`  Progress: ${progress.emotional_state} emotional state, ${progress.coping_skills} coping skills, ${progress.resilience} resilience`);
        if (progress.positive_changes?.length > 0) {
          contextLines.push(`  Improvements: ${progress.positive_changes.join(", ")}`);
        }
      }
    });
  }

  if (memoryContext) {
    contextLines.push(`\nContext: ${memoryContext.substring(0, 200)}`);
  }

  const systemPrompt = `You are an empathetic therapist analyzing a person's emotional patterns and progress over time.
Generate 3-5 key insights that:
- Track progress and improvements (e.g., "Your anxiety is improving", "You're developing better coping skills")
- Identify emotional patterns and what they reveal
- Recognize positive changes and growth
- Suggest healthy coping strategies or next steps
- Acknowledge challenges while emphasizing resilience
- Are warm, non-judgmental, and actionable
- Use simple, conversational language
- Avoid clinical jargon or diagnoses

IMPORTANT: If you see progress indicators showing improvement, explicitly mention the progress in your insights.
Example: If emotional_state is "improving" and coping_skills is "developing", say "You're making real progress with managing anxiety" or similar.

Return ONLY a JSON array with this exact structure:
[
  {
    "title": "Brief insight title (4-8 words)",
    "description": "Supportive explanation (15-25 words)",
    "icon": "Heart" | "Brain" | "TrendingUp" | "Calendar",
    "trend": "positive" | "negative" | "neutral"
  }
]`;

  const userPrompt = `Based on this week's emotional patterns, generate 3-5 key therapeutic insights:

${contextLines.join("\\n")}

Return only the JSON array, no other text.`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textContent = response.content.find((c: { type: string }) => c.type === "text");
    if (textContent && textContent.type === "text") {
      const text = (textContent as { type: "text"; text: string }).text;
      
      // Extract JSON from response (might have markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const insights = JSON.parse(jsonMatch[0]);
        return insights;
      }
    }

    // Fallback insights if AI fails
    return generateFallbackInsights(emotionFrequency, topTopics, moodTrend);
  } catch (error) {
    console.error("[generateKeyInsights] Error:", error);
    return generateFallbackInsights(emotionFrequency, topTopics, moodTrend);
  }
}

/**
 * Generate fallback insights when AI is unavailable
 */
function generateFallbackInsights(
  emotionFreq: Record<string, number>,
  topTopics: Array<{ topic: string; count: number }>,
  moodTrend: "rising" | "declining" | "stable" | null
): Array<{
  title: string;
  description: string;
  icon: string;
  trend: "positive" | "negative" | "neutral";
}> {
  const insights = [];

  // Emotion pattern insight
  const topEmotion = Object.entries(emotionFreq).sort((a, b) => b[1] - a[1])[0];
  if (topEmotion) {
    const [emotion, count] = topEmotion;
    const isPositive = ["joy", "happy", "calm", "grateful", "excited"].includes(emotion.toLowerCase());
    insights.push({
      title: `${emotion.charAt(0).toUpperCase() + emotion.slice(1)} is your dominant feeling`,
      description: `You've experienced ${emotion} frequently this week. ${isPositive ? "That's wonderful! Consider what's contributing to these positive feelings." : "Notice what triggers this emotion and how you respond to it."}`,
      icon: "Heart",
      trend: isPositive ? "positive" as const : "neutral" as const,
    });
  }

  // Mood trend insight
  if (moodTrend) {
    insights.push({
      title: moodTrend === "rising" ? "Your mood is improving" : moodTrend === "declining" ? "Mood needs attention" : "Emotional stability",
      description: moodTrend === "rising" 
        ? "Your emotional state shows positive momentum. Keep doing what's working for you!"
        : moodTrend === "declining"
        ? "Your mood has been challenging. Be gentle with yourself and reach out for support if needed."
        : "You're maintaining emotional balance. This consistency is a strength.",
      icon: "TrendingUp",
      trend: moodTrend === "rising" ? "positive" as const : moodTrend === "declining" ? "negative" as const : "neutral" as const,
    });
  }

  // Topic-based insight
  if (topTopics.length > 0) {
    const topic = topTopics[0].topic;
    insights.push({
      title: `${topic.charAt(0).toUpperCase() + topic.slice(1)} is on your mind`,
      description: `This theme came up ${topTopics[0].count} times. Reflecting on it more deeply might reveal important insights.`,
      icon: "Brain",
      trend: "neutral" as const,
    });
  }

  return insights.slice(0, 5);
}
