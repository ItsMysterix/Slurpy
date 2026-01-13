/*
 * WeeklyReflection Component
 * Displays the latest insight run and allows generating new ones
 */

"use client";

import React from "react";
import { InsightRun } from "@/types";
import { Loader2, RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface WeeklyReflectionProps {
  userId: string;
}

export default function WeeklyReflection({ userId }: WeeklyReflectionProps) {
  const [latestInsight, setLatestInsight] = React.useState<InsightRun | null>(
    null
  );
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAllInsights, setShowAllInsights] = React.useState(false);
  const [allInsights, setAllInsights] = React.useState<InsightRun[]>([]);

  // Fetch latest insight on mount
  React.useEffect(() => {
    if (!userId) return;
    loadLatestInsight();
  }, [userId]);

  const loadLatestInsight = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/list?limit=1");
      if (!res.ok) throw new Error("Failed to load insights");

      const data = await res.json();
      setLatestInsight(data.insights?.[0] || null);
    } catch (err) {
      console.error("[WeeklyReflection] Load error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load insight"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadAllInsights = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insights/list?limit=20");
      if (!res.ok) throw new Error("Failed to load insights");

      const data = await res.json();
      setAllInsights(data.insights || []);
    } catch (err) {
      console.error("[WeeklyReflection] Load all error:", err);
    } finally {
      setLoading(false);
    }
  };

  const generateNewInsight = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/generate", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate insight");
      }

      setLatestInsight(data.insight);
      // Refresh all insights if showing
      if (showAllInsights) {
        await loadAllInsights();
      }
    } catch (err) {
      console.error("[WeeklyReflection] Generate error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate insight"
      );
    } finally {
      setGenerating(false);
    }
  };

  const deleteInsight = async (insightId: string) => {
    if (!confirm("Delete this reflection?")) return;

    try {
      const res = await fetch("/api/insights/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightId }),
      });

      if (!res.ok) throw new Error("Failed to delete insight");

      setLatestInsight((prev) =>
        prev?.id === insightId ? null : prev
      );
      setAllInsights((prev) =>
        prev.filter((i) => i.id !== insightId)
      );
    } catch (err) {
      console.error("[WeeklyReflection] Delete error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to delete insight"
      );
    }
  };

  // Format date range
  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  };

  // Format relative time
  const formatRelativeTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (loading && !latestInsight && !showAllInsights) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-clay-500" />
          <span className="text-gray-600 dark:text-gray-400">
            Loading reflections...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Latest Insight Card */}
      {!showAllInsights && (
        <div className="bg-gradient-to-br from-sand-50 to-sage-50 dark:from-gray-800 dark:to-gray-900 rounded-lg shadow-sm border border-sand-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Weekly Reflection
              </h3>
              {latestInsight && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {formatDateRange(
                    latestInsight.timeRangeStart,
                    latestInsight.timeRangeEnd
                  )}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {latestInsight ? (
            <>
              <div className="prose prose-sm dark:prose-invert max-w-none mb-6">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {latestInsight.narrativeSummary}
                </p>
              </div>

              {/* Metadata */}
              <div className="space-y-2 mb-6">
                {latestInsight.dominantEmotions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                      Emotions
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {latestInsight.dominantEmotions.map((emotion) => (
                        <span
                          key={emotion}
                          className="inline-block px-3 py-1 bg-white dark:bg-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300"
                        >
                          {emotion}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {latestInsight.recurringThemes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                      Themes
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {latestInsight.recurringThemes.map((theme) => (
                        <span
                          key={theme}
                          className="inline-block px-3 py-1 bg-white dark:bg-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {latestInsight.moodTrend && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Mood trend:</span>
                    <span className="capitalize">{latestInsight.moodTrend}</span>
                  </div>
                )}

                {latestInsight.resilienceDelta && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Resilience:</span>
                    <span className="capitalize">{latestInsight.resilienceDelta}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-sand-200 dark:border-gray-700">
                <button
                  onClick={generateNewInsight}
                  disabled={generating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-clay-500 hover:bg-clay-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Generate New
                    </>
                  )}
                </button>
                <button
                  onClick={() => deleteInsight(latestInsight.id)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setShowAllInsights(true);
                    loadAllInsights();
                  }}
                  className="flex-1 px-4 py-2 text-clay-600 dark:text-clay-400 hover:bg-clay-50 dark:hover:bg-clay-900/20 rounded-lg font-medium transition-colors"
                >
                  View all
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                No reflection yet this week. Generate one to get started!
              </p>
              <button
                onClick={generateNewInsight}
                disabled={generating}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-clay-500 hover:bg-clay-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Generate weekly reflection
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* All Insights List */}
      {showAllInsights && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Previous Reflections
            </h3>
            <button
              onClick={() => setShowAllInsights(false)}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ✕
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-4 h-4 animate-spin text-clay-500" />
              <span className="text-gray-600 dark:text-gray-400">
                Loading...
              </span>
            </div>
          ) : allInsights.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">
              No previous reflections
            </p>
          ) : (
            <div className="space-y-4">
              {allInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatDateRange(
                          insight.timeRangeStart,
                          insight.timeRangeEnd
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(insight.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteInsight(insight.id)}
                      className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                    {insight.narrativeSummary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
