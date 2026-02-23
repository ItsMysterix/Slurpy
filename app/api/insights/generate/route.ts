/*
 * POST /api/insights/generate
 * Generate a new weekly reflection
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { createServerServiceClient } from "@/lib/supabase/server";
import {
  aggregateInsightData,
  get7DayWindowDates,
} from "@/lib/insight-aggregation";
import {
  generateNarrativeSummary,
  extractDominantEmotions,
  extractRecurringThemes,
  generateKeyInsights,
} from "@/lib/insight-narrative";
import { InsightRun, GenerateInsightResponse } from "@/types";

export const POST = withAuth(async function POST(
  request: NextRequest,
  auth
): Promise<NextResponse<GenerateInsightResponse>> {
  try {
    const supabase = createServerServiceClient();
    const userId = auth.userId;

    // Check user's plan (for memory access)
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_id")
      .eq("id", userId)
      .single();

    const planId = profile?.plan_id || "free";

    // Get time window
    const window = get7DayWindowDates();

    // Check if insight already exists for this window
    const { data: existingInsight } = await supabase
      .from("insight_run")
      .select("id")
      .eq("user_id", userId)
      .gte("time_range_start", window.start.toISOString())
      .lte("time_range_end", window.end.toISOString())
      .single();

    if (existingInsight) {
      return NextResponse.json(
        {
          success: false,
          error: "Insight already exists for this week",
        },
        { status: 400 }
      );
    }

    // Aggregate data
    const aggregatedData = await aggregateInsightData(userId, planId, window);

    // Fetch session summaries for progress tracking
    const { data: sessionSummaries } = await supabase
      .from("chat_sessions")
      .select("started_at, session_summary, progress_indicators")
      .eq("user_id", userId)
      .not("session_summary", "is", null)
      .gte("started_at", window.start.toISOString())
      .lte("started_at", window.end.toISOString())
      .order("started_at", { ascending: true });

    // Check if we have any data
    if (
      aggregatedData.moodEntryCount === 0 &&
      aggregatedData.sessionCount === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Not enough data this week to generate reflection",
        },
        { status: 400 }
      );
    }

    // Generate therapist-style key insights with progress tracking
    const keyInsights = await generateKeyInsights({
      emotionFrequency: aggregatedData.emotionFrequency,
      topicFrequency: aggregatedData.topicFrequency,
      moodTrend: aggregatedData.moodTrend,
      sessionCount: aggregatedData.sessionCount,
      moodEntryCount: aggregatedData.moodEntryCount,
      memoryContext: aggregatedData.memoryContext,
      sessionSummaries: (sessionSummaries || []).map(s => ({
        date: new Date(s.started_at).toISOString().split("T")[0],
        summary: s.session_summary || "",
        progressIndicators: s.progress_indicators,
      })),
    });

    // Generate narrative summary (optional, only if no key insights)
    let narrativeSummary = "";
    if (keyInsights.length === 0) {
      narrativeSummary = await generateNarrativeSummary({
        emotionFrequency: aggregatedData.emotionFrequency,
        topicFrequency: aggregatedData.topicFrequency,
        moodTrendDirection: aggregatedData.moodTrend,
        sessionCount: aggregatedData.sessionCount,
        moodEntryCount: aggregatedData.moodEntryCount,
        memoryContext: aggregatedData.memoryContext,
        timeRangeStart: window.start.toISOString(),
        timeRangeEnd: window.end.toISOString(),
      });
    }

    // Extract metadata
    const dominantEmotions = extractDominantEmotions(
      aggregatedData.emotionFrequency
    );
    const recurringThemes = extractRecurringThemes(
      aggregatedData.topicFrequency
    );

    // Create InsightRun record
    const insightData: any = {
      user_id: userId,
      time_range_start: window.start.toISOString(),
      time_range_end: window.end.toISOString(),
      dominant_emotions: dominantEmotions,
      recurring_themes: recurringThemes,
      mood_trend: aggregatedData.moodTrend,
      resilience_delta: aggregatedData.resilienceDelta,
      key_insights: keyInsights, // Primary insights (AI-generated)
      source_metadata: {
        moodEntries: aggregatedData.moodEntryCount,
        sessionCount: aggregatedData.sessionCount,
        hasMemoryContext: !!aggregatedData.memoryContext,
        journalEntriesCount: 0,
        hasSessionSummaries: (sessionSummaries?.length || 0) > 0,
      },
    };

    // Only add narrative summary if we generated one (for backwards compatibility)
    if (narrativeSummary) {
      insightData.narrative_summary = narrativeSummary;
    } else {
      // Use first key insight as summary fallback
      insightData.narrative_summary = keyInsights[0]?.description || "Weekly reflection generated";
    }

    const { data: newInsight, error: insertError } = await supabase
      .from("insight_run")
      .insert([insightData])
      .select()
      .single();

    if (insertError) {
      console.error("[generate] Insert error:", insertError);
      return NextResponse.json(
        { success: false, error: "Failed to save insight" },
        { status: 500 }
      );
    }

    // Transform response to match InsightRun type
    const insight: InsightRun = {
      id: newInsight.id,
      userId: newInsight.user_id,
      timeRangeStart: newInsight.time_range_start,
      timeRangeEnd: newInsight.time_range_end,
      dominantEmotions: newInsight.dominant_emotions,
      recurringThemes: newInsight.recurring_themes,
      moodTrend: newInsight.mood_trend,
      resilienceDelta: newInsight.resilience_delta,
      narrativeSummary: newInsight.narrative_summary,
      sourceMetadata: newInsight.source_metadata,
      createdAt: newInsight.created_at,
      updatedAt: newInsight.updated_at,
    };

    return NextResponse.json({ success: true, insight }, { status: 201 });
  } catch (error) {
    console.error("[generate] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to generate insight",
      },
      { status: 500 }
    );
  }
});
