/*
 * Unified type definitions for Slurpy
 */

// ======================= Existing Types =======================

export interface DailyMood {
  id: string;
  userId: string;
  emotion: string;
  intensity: number; // 0-1
  journal?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title?: string;
  summary?: string;
  dominantEmotion?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface UserMemory {
  id: string;
  userId: string;
  content: string;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  email: string;
  fullName?: string;
  planId: "free" | "pro" | "elite";
  createdAt: string;
  updatedAt: string;
}

// ======================= Sprint 2: InsightRun Types =======================

export interface InsightRun {
  id: string;
  userId: string;
  timeRangeStart: string; // ISO timestamp
  timeRangeEnd: string;   // ISO timestamp
  dominantEmotions: string[];
  recurringThemes: string[];
  moodTrend: "rising" | "declining" | "stable" | null;
  resilienceDelta: "improving" | "stable" | "strained" | null;
  narrativeSummary: string; // 5-7 sentence reflection
  sourceMetadata: {
    moodEntries: number;
    sessionCount: number;
    hasMemoryContext: boolean;
    journalEntriesCount?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AggregatedInsightData {
  // Raw aggregation from data sources
  moodEntries: DailyMood[];
  sessionSummaries: {
    id: string;
    dominantEmotion: string;
    topics: string[];
    startTime: string;
  }[];
  emotionFrequency: Record<string, number>;
  topicFrequency: Record<string, number>;
  sessionCount: number;
  moodEntryCount: number;
  totalIntensity: number;
  memoryContext?: string; // For pro users only (read-only)
  moodTrend: "rising" | "declining" | "stable" | null;
  resilienceDelta: "improving" | "stable" | "strained" | null;
  timeRangeStart: string;
  timeRangeEnd: string;
}

export interface NarrativeInputs {
  // Structured inputs to narrative generation
  emotionFrequency: Record<string, number>; // emotion -> count
  topicFrequency: Record<string, number>;  // topic -> count
  moodTrendDirection: "rising" | "declining" | "stable" | null;
  sessionCount: number;
  moodEntryCount: number;
  memoryContext?: string; // Summarized memory for pro users
  timeRangeStart: string;
  timeRangeEnd: string;
}

export interface GenerateInsightRequest {
  // No parameters needed - uses 7-day window from now
}

export interface GenerateInsightResponse {
  success: boolean;
  insight?: InsightRun;
  error?: string;
}

export interface ListInsightsResponse {
  insights: InsightRun[];
  total: number;
}
