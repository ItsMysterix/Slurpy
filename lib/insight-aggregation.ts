/* 
 * Insight Aggregation Utilities
 * Aggregates mood, chat, and memory data for narrative generation
 */

import { supabaseServer } from "./supabaseClient";
import {
  AggregatedInsightData,
  DailyMood,
  ChatSession,
} from "@/types";

/**
 * Get 7-day rolling window dates (UTC)
 */
function get7DayWindow(fromDate: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const end = new Date(fromDate);
  end.setUTCHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6); // 7 days including today
  start.setUTCHours(0, 0, 0, 0);

  return { start, end };
}

/**
 * Fetch all mood entries in 7-day window
 */
async function fetchMoodEntries(
  userId: string,
  window: { start: Date; end: Date }
): Promise<DailyMood[]> {
  const { data, error } = await supabaseServer
    .from("daily_mood")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", window.start.toISOString())
    .lte("created_at", window.end.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[fetchMoodEntries] Error:", error);
    return [];
  }

  return data || [];
}

/**
 * Fetch all chat sessions in 7-day window
 * No limit - fetch ALL sessions
 */
async function fetchChatSessions(
  userId: string,
  window: { start: Date; end: Date }
): Promise<ChatSession[]> {
  const { data, error } = await supabaseServer
    .from("chat_session")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", window.start.toISOString())
    .lte("created_at", window.end.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[fetchChatSessions] Error:", error);
    return [];
  }

  return data || [];
}

/**
 * Fetch user memory (pro/elite only, read-only, contextual)
 * For pro users: fetch relevant memory entries, summarize
 */
async function fetchMemoryContext(
  userId: string,
  planId: string | null,
  topics: string[],
  limit: number = 3
): Promise<string | null> {
  // Free users have no memory access
  if (!planId || planId === "free") {
    return null;
  }

  if (topics.length === 0) {
    return null;
  }

  // Fetch relevant memory entries by topic/labels
  const { data, error } = await supabaseServer
    .from("user_memory")
    .select("content, labels")
    .eq("user_id", userId)
    .limit(limit)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return null;
  }

  // Summarize memory entries (just concatenate for now)
  return data
    .map((m) => m.content)
    .join(" | ")
    .substring(0, 500); // Limit to 500 chars
}

/**
 * Extract emotion from chat session
 * Use dominant_emotion if available, else default to "neutral"
 */
function extractSessionEmotion(session: ChatSession): string {
  if (session.dominant_emotion) {
    return session.dominant_emotion;
  }
  return "neutral";
}

/**
 * Extract topics from session summary
 */
function extractSessionTopics(session: ChatSession): string[] {
  if (!session.summary) {
    return [];
  }
  // Very basic: just look for common topic keywords
  // In production, could use NLP
  const text = session.summary.toLowerCase();
  const keywords = [
    "work",
    "family",
    "relationship",
    "health",
    "stress",
    "anxiety",
    "joy",
    "success",
    "goal",
  ];
  return keywords.filter((k) => text.includes(k));
}

/**
 * Aggregate mood data into frequency map
 */
function aggregateMoodFrequency(
  moodEntries: DailyMood[]
): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const entry of moodEntries) {
    const emotion = entry.emotion || "neutral";
    freq[emotion] = (freq[emotion] || 0) + 1;
  }
  return freq;
}

/**
 * Aggregate chat session emotions and topics
 */
function aggregateSessionData(
  sessions: ChatSession[]
): {
  emotionFreq: Record<string, number>;
  topicFreq: Record<string, number>;
} {
  const emotionFreq: Record<string, number> = {};
  const topicFreq: Record<string, number> = {};

  for (const session of sessions) {
    const emotion = extractSessionEmotion(session);
    emotionFreq[emotion] = (emotionFreq[emotion] || 0) + 1;

    const topics = extractSessionTopics(session);
    for (const topic of topics) {
      topicFreq[topic] = (topicFreq[topic] || 0) + 1;
    }
  }

  return { emotionFreq, topicFreq };
}

/**
 * Calculate mood trend (simple: compare first half vs second half of window)
 */
function calculateMoodTrend(
  moodEntries: DailyMood[]
): "rising" | "declining" | "stable" | null {
  if (moodEntries.length < 2) {
    return null;
  }

  const mid = Math.floor(moodEntries.length / 2);
  const firstHalf = moodEntries.slice(0, mid);
  const secondHalf = moodEntries.slice(mid);

  const avgFirst =
    firstHalf.reduce((sum, m) => sum + (m.intensity || 0), 0) / firstHalf.length;
  const avgSecond =
    secondHalf.reduce((sum, m) => sum + (m.intensity || 0), 0) /
    secondHalf.length;

  const delta = avgSecond - avgFirst;

  if (Math.abs(delta) < 0.1) {
    return "stable";
  }
  return delta > 0 ? "rising" : "declining";
}

/**
 * Compare to previous InsightRun for resilience delta
 */
async function calculateResilienceDelta(
  userId: string,
  currentIntensity: number
): Promise<"improving" | "stable" | "strained" | null> {
  const { data: prevRun } = await supabaseServer
    .from("insight_run")
    .select("source_metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!prevRun || prevRun.length === 0) {
    return null; // No previous run to compare
  }

  const prevMetadata = prevRun[0].source_metadata || {};
  const prevMoodCount = prevMetadata.moodEntries || 0;
  const prevSessionCount = prevMetadata.sessionCount || 0;

  // Simple heuristic: more mood entries + more sessions = better engagement/resilience
  const prevEngagement = prevMoodCount + prevSessionCount * 0.5;
  const currentEngagement = currentIntensity + prevSessionCount * 0.5;

  const delta = currentEngagement - prevEngagement;

  if (Math.abs(delta) < 0.5) {
    return "stable";
  }
  return delta > 0 ? "improving" : "strained";
}

/**
 * Main aggregation function
 * Collects all data for narrative generation
 */
export async function aggregateInsightData(
  userId: string,
  planId: string | null,
  window?: { start: Date; end: Date }
): Promise<AggregatedInsightData> {
  const w = window || get7DayWindow();

  // Fetch data in parallel
  const [moodEntries, sessions] = await Promise.all([
    fetchMoodEntries(userId, w),
    fetchChatSessions(userId, w),
  ]);

  // Aggregate emotions and topics
  const moodFreq = aggregateMoodFrequency(moodEntries);
  const { emotionFreq: sessionEmotions, topicFreq } =
    aggregateSessionData(sessions);

  // Merge emotion frequencies
  const allEmotions = { ...moodFreq, ...sessionEmotions };
  Object.keys(sessionEmotions).forEach((e) => {
    allEmotions[e] = (allEmotions[e] || 0) + sessionEmotions[e];
  });

  // Fetch memory context for pro users
  const topicList = Object.keys(topicFreq);
  const memoryContext = await fetchMemoryContext(userId, planId, topicList);

  const totalIntensity =
    moodEntries.reduce((sum, m) => sum + (m.intensity || 0), 0) /
      moodEntries.length || 0;

  return {
    moodEntries,
    sessionSummaries: sessions.map((s) => ({
      id: s.id,
      dominantEmotion: extractSessionEmotion(s),
      topics: extractSessionTopics(s),
      startTime: s.created_at,
    })),
    emotionFrequency: allEmotions,
    topicFrequency: topicFreq,
    sessionCount: sessions.length,
    moodEntryCount: moodEntries.length,
    totalIntensity,
    memoryContext,
    moodTrend: calculateMoodTrend(moodEntries),
    resilienceDelta: await calculateResilienceDelta(userId, totalIntensity),
    timeRangeStart: w.start.toISOString(),
    timeRangeEnd: w.end.toISOString(),
  };
}

export function get7DayWindowDates(
  fromDate?: Date
): { start: Date; end: Date } {
  return get7DayWindow(fromDate);
}
