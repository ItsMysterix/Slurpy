"use client";

import React from "react";
import dynamic from "next/dynamic";
import { RequireAuth } from "@/components/auth/RequireAuth";
import SlideDrawer from "@/components/slide-drawer";
import InsightsHeader from "@/components/insights/InsightsHeader";
import SummaryCard from "@/components/insights/SummaryCard";
import WeeklyTrends from "@/components/insights/WeeklyTrends";
import EmotionBreakdown from "@/components/insights/EmotionBreakdown";
import KeyInsights from "@/components/insights/KeyInsights";
import Topics from "@/components/insights/Topics";

const WeeklyReflection = dynamic(
  () => import("@/components/insights/WeeklyReflection"),
  { ssr: false }
);

import { useAuth, useUser } from "@/lib/auth-hooks";
import { Loader2 } from "lucide-react";
import { useInsightsStream } from "@/lib/use-insights-stream";
import { normalizeInsights, type InsightsResponse, type TrendPoint } from "@/lib/insights-types";
import { supabase } from "@/lib/supabaseClient";

const MIN_REFRESH_MS = 4000;
const DAY_POLL_MS = 15000;

/* --------------------------- Date helpers --------------------------- */

function fmtShort(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function fmtYear(d: Date) {
  return d.getFullYear().toString();
}
function parseISO(d?: string) {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(+x) ? null : x;
}
function minMaxDates(points: TrendPoint[]) {
  const dates = points
    .map((p) => parseISO(p.date))
    .filter((d): d is Date => !!d)
    .sort((a, b) => +a - +b);
  if (!dates.length) return null;
  return { min: dates[0], max: dates[dates.length - 1] };
}

/** Builds a pretty label for the header’s top-right chip */
function periodLabelFor(
  timeframe: "day" | "week" | "month" | "year",
  header: InsightsResponse["header"] | undefined,
  trends: InsightsResponse["trends"] | undefined,
) {
  // Prefer whatever the API sent (if present)
  if (header?.periodLabel) return header.periodLabel;

  const today = new Date();

  if (timeframe === "day") {
    return today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }

  if (timeframe === "week") {
    const range = trends?.last7Days && minMaxDates(trends.last7Days);
    if (range) {
      const sameMonth = range.min.getMonth() === range.max.getMonth() && range.min.getFullYear() === range.max.getFullYear();
      return sameMonth
        ? `${range.min.toLocaleDateString("en-US", { month: "short" })} ${range.min.getDate()}–${range.max.getDate()}, ${range.max.getFullYear()}`
        : `${fmtShort(range.min)}–${fmtShort(range.max)}, ${range.max.getFullYear()}`;
    }
    // Fallback to current ISO week if we have no data yet
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Monday-ish start
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${fmtShort(start)}–${fmtShort(end)}, ${end.getFullYear()}`;
  }

  if (timeframe === "month") {
    // Try first point’s month, else current month
    const first = trends?.last7Days?.[0] && parseISO(trends.last7Days[0].date);
    return fmtMonthYear(first ?? today);
  }

  // year
  const any = trends?.last7Days?.[0] && parseISO(trends.last7Days[0].date);
  return fmtYear(any ?? today);
}

/* ------------------------------------------------------------------- */

export default function ClientPage() {
  const { userId } = useAuth();
  const { user } = useUser();

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [selectedTimeframe, setSelectedTimeframe] =
    React.useState<"day" | "week" | "month" | "year">("week");
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [insights, setInsights] = React.useState<InsightsResponse | null>(null);

  const lastRefreshAtRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const fetchInsights = React.useCallback(
    async (tf: "day" | "week" | "month" | "year", opts: { background?: boolean } = {}) => {
      if (!userId) return;
      setError(null);
      opts.background ? setRefreshing(true) : setInitialLoading(true);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        let bearer = "";
        try {
          const { data } = await supabase.auth.getSession();
          bearer = data.session?.access_token || "";
        } catch {}
        const res = await fetch(`/api/insights?timeframe=${tf}`, {
          cache: "no-store",
          signal: ac.signal,
          headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        });
        if (!res.ok) throw new Error(`Failed to fetch insights: ${res.status}`);
        const raw = await res.json();
        const norm = normalizeInsights(raw);
        setInsights(norm);
        lastRefreshAtRef.current = Date.now();
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load insights");
      } finally {
        opts.background ? setRefreshing(false) : setInitialLoading(false);
      }
    },
    [userId]
  );

  React.useEffect(() => {
    if (userId) fetchInsights(selectedTimeframe);
  }, [userId, selectedTimeframe, fetchInsights]);

  useInsightsStream(selectedTimeframe, () => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < MIN_REFRESH_MS) return;
    fetchInsights(selectedTimeframe, { background: true });
  });

  React.useEffect(() => {
    if (!userId || selectedTimeframe !== "day") return;
    const poll = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastRefreshAtRef.current >= MIN_REFRESH_MS) {
          fetchInsights("day", { background: true });
        }
      }
    };
    const id = setInterval(poll, DAY_POLL_MS);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", poll);
    };
  }, [userId, selectedTimeframe, fetchInsights]);

  if (initialLoading) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
          <SlideDrawer onSidebarToggle={setSidebarOpen} />
          <div className={`flex h-screen ${sidebarOpen ? "ml-64" : "ml-16"}`}>
            <div className="flex-1 grid place-items-center">
              <Loader2 className="w-8 h-8 animate-spin text-clay-500 dark:text-sand-400" />
            </div>
          </div>
        </div>
      </RequireAuth>
    );
  }

  if (error || !insights) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
          <SlideDrawer onSidebarToggle={setSidebarOpen} />
          <div className={`flex h-screen ${sidebarOpen ? "ml-64" : "ml-16"}`}>
            <div className="flex-1 grid place-items-center">
              <div className="text-center text-clay-600 dark:text-sand-300">
                <p className="mb-3">Unable to load insights.</p>
                <button className="underline" onClick={() => fetchInsights(selectedTimeframe)}>
                  Retry
                </button>
              </div>
            </div>
        </div>
      </div>
      </RequireAuth>
    );
  }

  const { header, trends, breakdown, insights: keyInsights, topics } = insights;
  const periodLabel = periodLabelFor(selectedTimeframe, header, trends);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div className={`flex h-screen transition-all ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="flex-1 flex flex-col">
          <InsightsHeader
            userFirstName={(() => {
              const m: any = user?.user_metadata || {};
              const username = m.username || m.user_name;
              const full = m.name || m.full_name;
              const gn = m.given_name, fn = m.family_name;
              const email = user?.email;
              return (username || full || [gn, fn].filter(Boolean).join(" ") || (email ? email.split("@")[0] : "")) as string;
            })()}
            timeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
            refreshing={refreshing}
            periodLabelOverride={periodLabel}
          />

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <WeeklyReflection userId={userId ?? ""} />
              <SummaryCard header={header} timeframe={selectedTimeframe} />
              <WeeklyTrends data={trends.last7Days || []} />
              <div className="grid md:grid-cols-2 gap-6">
                <EmotionBreakdown breakdown={breakdown} />
                <KeyInsights items={keyInsights} />
              </div>
              <Topics items={Array.isArray(topics) ? topics : []} timeframe={selectedTimeframe} />
            </div>
          </div>
        </div>
      </div>
    </div>
    </RequireAuth>
  );
}
