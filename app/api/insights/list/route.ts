/*
 * GET /api/insights/list
 * List user's previous insights (most recent first)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { InsightRun, ListInsightsResponse } from "@/types";

export async function GET(
  request: NextRequest
): Promise<NextResponse<ListInsightsResponse>> {
  try {
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
        { insights: [], total: 0 },
        { status: 401 }
      );
    }

    // Get query params
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    // Fetch insights
    const { data, count, error } = await supabase
      .from("insight_run")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
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
}
