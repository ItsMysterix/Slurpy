/*
 * POST /api/insights/generate
 * Generate a new weekly reflection
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  aggregateInsightData,
  get7DayWindowDates,
} from "@/lib/insight-aggregation";
import {
  generateNarrativeSummary,
  extractDominantEmotions,
  extractRecurringThemes,
} from "@/lib/insight-narrative";
import { InsightRun, GenerateInsightResponse } from "@/types";

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateInsightResponse>> {
  try {
    // Authenticate user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check user's plan (for memory access)
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_id")
      .eq("id", user.id)
      .single();

    const planId = profile?.plan_id || "free";

    // Get time window
    const window = get7DayWindowDates();

    // Check if insight already exists for this window
    const { data: existingInsight } = await supabase
      .from("insight_run")
      .select("id")
      .eq("user_id", user.id)
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
    const aggregatedData = await aggregateInsightData(user.id, planId, window);

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

    // Generate narrative
    const narrativeSummary = await generateNarrativeSummary({
      emotionFrequency: aggregatedData.emotionFrequency,
      topicFrequency: aggregatedData.topicFrequency,
      moodTrendDirection: aggregatedData.moodTrend,
      sessionCount: aggregatedData.sessionCount,
      moodEntryCount: aggregatedData.moodEntryCount,
      memoryContext: aggregatedData.memoryContext,
      timeRangeStart: window.start.toISOString(),
      timeRangeEnd: window.end.toISOString(),
    });

    // Extract metadata
    const dominantEmotions = extractDominantEmotions(
      aggregatedData.emotionFrequency
    );
    const recurringThemes = extractRecurringThemes(
      aggregatedData.topicFrequency
    );

    // Create InsightRun record
    const insightData = {
      user_id: user.id,
      time_range_start: window.start.toISOString(),
      time_range_end: window.end.toISOString(),
      dominant_emotions: dominantEmotions,
      recurring_themes: recurringThemes,
      mood_trend: aggregatedData.moodTrend,
      resilience_delta: aggregatedData.resilienceDelta,
      narrative_summary: narrativeSummary,
      source_metadata: {
        moodEntries: aggregatedData.moodEntryCount,
        sessionCount: aggregatedData.sessionCount,
        hasMemoryContext: !!aggregatedData.memoryContext,
        journalEntriesCount: 0, // TODO: add if journal is included
      },
    };

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
}
