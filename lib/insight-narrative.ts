/*
 * Narrative Generation for Weekly Reflections
 * Uses OpenAI to generate human, thoughtful, non-clinical summaries
 */

import OpenAI from "openai";

const client = new OpenAI({
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
    const textContent = response.content.find((c) => c.type === "text");
    if (textContent && textContent.type === "text") {
      return textContent.text;
    }

    return "Unable to generate reflection at this time.";
  } catch (error) {
    console.error("[generateNarrativeSummary] OpenAI error:", error);
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
