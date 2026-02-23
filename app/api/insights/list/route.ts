/*
 * GET /api/insights/list
 * List user's previous insights (most recent first)
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { createServerServiceClient } from "@/lib/supabase/server";
import { InsightRun, ListInsightsResponse } from "@/types";

export const GET = withAuth(async function GET(
  request: NextRequest
  , auth
): Promise<NextResponse<ListInsightsResponse>> {
  try {
    const supabase = createServerServiceClient();
    const userId = auth.userId;

    // Get query params
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    // Fetch insights
    const { data, count, error } = await supabase
      .from("insight_run")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[list] Error:", error);
      return NextResponse.json(
        { insights: [], total: 0 },
        { status: 500 }
      );
    }

    const insights: InsightRun[] = (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      timeRangeStart: row.time_range_start,
      timeRangeEnd: row.time_range_end,
      dominantEmotions: row.dominant_emotions,
      recurringThemes: row.recurring_themes,
      moodTrend: row.mood_trend,
      resilienceDelta: row.resilience_delta,
      narrativeSummary: row.narrative_summary,
      sourceMetadata: row.source_metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({
      insights,
      total: count || 0,
    });
  } catch (error) {
    console.error("[list] Error:", error);
    return NextResponse.json(
      { insights: [], total: 0 },
      { status: 500 }
    );
  }
});
