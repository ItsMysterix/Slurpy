"use client";

import React from "react";
import SlideDrawer from "@/components/slide-drawer";
import InsightsHeader from "@/components/insights/InsightsHeader";
import SummaryCard from "@/components/insights/SummaryCard";
import WeeklyTrends from "@/components/insights/WeeklyTrends";
import EmotionBreakdown from "@/components/insights/EmotionBreakdown";
import KeyInsights from "@/components/insights/KeyInsights";
import Topics from "@/components/insights/Topics";

import { useAuth, useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useInsightsStream } from "@/lib/use-insights-stream";
import { normalizeInsights, type InsightsResponse } from "@/lib/insights-types";

const MIN_REFRESH_MS = 4000;
const DAY_POLL_MS = 15000;

export default function InsightsPage() {
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
        const res = await fetch(`/api/insights?userId=${userId}&timeframe=${tf}`, {
          cache: "no-store",
          signal: ac.signal,
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
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 grid place-items-center">
            <Loader2 className="w-8 h-8 animate-spin text-clay-500 dark:text-sand-400" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !insights) {
    return (
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
    );
  }

  const { header, trends, breakdown, insights: keyInsights, topics } = insights;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div className={`flex h-screen transition-all ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="flex-1 flex flex-col">
          <InsightsHeader
            userFirstName={user?.firstName ?? ""}
            timeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
            refreshing={refreshing}
            periodLabelOverride={undefined}
          />

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <SummaryCard header={header} timeframe={selectedTimeframe} />
              <WeeklyTrends data={trends.last7Days || []} />
              <div className="grid md:grid-cols-2 gap-6">
                <EmotionBreakdown breakdown={breakdown} />
                <KeyInsights items={keyInsights} />
              </div>
              <Topics items={Array.isArray(topics) ? topics : []} timeframe={selectedTimeframe} />
              {/* NLPQuickCheck removed */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
