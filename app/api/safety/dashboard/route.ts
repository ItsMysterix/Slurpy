export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { createServerServiceClient } from "@/lib/supabase/server";

const toUTCStartOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDaysUTC = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

function getUTCDateRange(timeframe: string) {
  const now = new Date();
  const today = toUTCStartOfDay(now);
  if (timeframe === "day") return { start: today, end: addDaysUTC(today, 1) };
  if (timeframe === "week") {
    const start = addDaysUTC(today, -today.getUTCDay());
    return { start, end: addDaysUTC(start, 7) };
  }
  if (timeframe === "month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  return { start, end };
}

export const GET = withAuth(async function GET(req: NextRequest, auth) {
  try {
    const url = new URL(req.url);
    const timeframe = url.searchParams.get("timeframe") || "week";
    const { start, end } = getUTCDateRange(timeframe);

    const supabase = createServerServiceClient();
    const { data, error } = await supabase
      .from("safety_events")
      .select("created_at, source, level")
      .eq("user_id", auth.userId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      const tableMissing = /safety_events/i.test(error.message || "");
      if (tableMissing) {
        return NextResponse.json({
          available: false,
          summary: {
            total: 0,
            immediate: 0,
            elevated: 0,
            ctaClicks: 0,
            ctaDismisses: 0,
            clickThroughRate: 0,
            lastEventAt: null,
          },
          daily: [],
        });
      }
      return NextResponse.json({ error: "Failed to load safety dashboard" }, { status: 500 });
    }

    const events = data || [];
    const total = events.length;
    const immediate = events.filter((e: any) => e.level === "immediate").length;
    const elevated = events.filter((e: any) => e.level === "elevated").length;
    const ctaClicks = events.filter((e: any) => e.source === "cta_click").length;
    const ctaDismisses = events.filter((e: any) => e.source === "cta_dismiss").length;
    const ctaShows = events.filter((e: any) => e.source === "assistant_output" || e.source === "user_input").length;
    const clickThroughRate = ctaShows > 0 ? Math.round((ctaClicks / ctaShows) * 100) : 0;

    const dailyMap: Record<string, { date: string; immediate: number; elevated: number }> = {};
    for (const e of events as any[]) {
      const date = String(e.created_at || "").slice(0, 10);
      if (!date) continue;
      if (!dailyMap[date]) dailyMap[date] = { date, immediate: 0, elevated: 0 };
      if (e.level === "immediate") dailyMap[date].immediate += 1;
      else if (e.level === "elevated") dailyMap[date].elevated += 1;
    }

    return NextResponse.json({
      available: true,
      summary: {
        total,
        immediate,
        elevated,
        ctaClicks,
        ctaDismisses,
        clickThroughRate,
        lastEventAt: events[0]?.created_at ?? null,
      },
      daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
