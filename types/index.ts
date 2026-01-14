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

export type {
  InsightRun,
  AggregatedInsightData,
  NarrativeInputs,
  GenerateInsightRequest,
  GenerateInsightResponse,
  ListInsightsResponse,
} from "@/lib/insights-types";
