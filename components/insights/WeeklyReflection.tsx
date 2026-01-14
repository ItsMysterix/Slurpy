/*
 * WeeklyReflection Component
 * Displays the latest insight run and allows generating new ones
 */

"use client";

import React from "react";
import { InsightRun } from "@/types";
import { Loader2, RefreshCw, Trash2, AlertCircle, Lightbulb } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-clay-500" />
            <span className="text-clay-600 dark:text-sand-400">
              Loading reflections...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Latest Insight Card */}
      {!showAllInsights && (
        <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-clay-600 dark:text-sand-300" />
                <h3 className="font-display text-lg text-clay-700 dark:text-sand-200">
                  Weekly Reflection
                </h3>
              </div>
              {latestInsight && (
                <Badge className="bg-sage-100 text-sage-600 border-sage-300 dark:bg-gray-800 dark:text-sand-300">
                  {formatRelativeTime(latestInsight.createdAt)}
                </Badge>
              )}
            </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {latestInsight ? (
            <>
              <div className="mb-6">
                <p className="text-clay-700 dark:text-sand-300 leading-relaxed">
                  {latestInsight.narrativeSummary}
                </p>
              </div>

              {/* Metadata */}
              <div className="space-y-3 mb-6">
                {latestInsight.dominantEmotions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-clay-500 dark:text-sand-400 uppercase tracking-wide mb-2">
                      Emotions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {latestInsight.dominantEmotions.map((emotion) => (
                        <Badge
                          key={emotion}
                          variant="outline"
                          className="bg-sage-50 text-clay-700 border-sage-200 dark:bg-gray-800 dark:text-sand-300 dark:border-gray-700"
                        >
                          {emotion}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {latestInsight.recurringThemes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-clay-500 dark:text-sand-400 uppercase tracking-wide mb-2">
                      Themes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {latestInsight.recurringThemes.map((theme) => (
                        <Badge
                          key={theme}
                          variant="outline"
                          className="bg-sand-50 text-clay-700 border-sand-200 dark:bg-gray-800 dark:text-sand-300 dark:border-gray-700"
                        >
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-4 text-sm">
                  {latestInsight.moodTrend && (
                    <div className="flex items-center gap-2 text-clay-600 dark:text-sand-400">
                      <span className="font-medium">Mood trend:</span>
                      <span className="capitalize text-clay-700 dark:text-sand-300">{latestInsight.moodTrend}</span>
                    </div>
                  )}

                  {latestInsight.resilienceDelta && (
                    <div className="flex items-center gap-2 text-clay-600 dark:text-sand-400">
                      <span className="font-medium">Resilience:</span>
                      <span className="capitalize text-clay-700 dark:text-sand-300">{latestInsight.resilienceDelta}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-sage-200/50 dark:border-gray-700/50">
                <button
                  onClick={generateNewInsight}
                  disabled={generating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-clay-600 hover:bg-clay-700 text-white rounded-lg font-medium transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="px-4 py-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setShowAllInsights(true);
                    loadAllInsights();
                  }}
                  className="flex-1 px-4 py-2 text-clay-600 dark:text-sand-300 hover:bg-sage-50 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                >
                  View all
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-clay-600 dark:text-sand-400 mb-4">
                No reflection yet this week. Generate one to get started!
              </p>
              <button
                onClick={generateNewInsight}
                disabled={generating}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-clay-600 hover:bg-clay-700 text-white rounded-lg font-medium transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
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
          </CardContent>
        </Card>
      )}

      {/* All Insights List */}
      {showAllInsights && (
        <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                Previous Reflections
              </h3>
              <button
                onClick={() => setShowAllInsights(false)}
                className="text-clay-600 dark:text-sand-400 hover:text-clay-900 dark:hover:text-sand-200 transition-colors"
              >
                ✕
              </button>
            </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-4 h-4 animate-spin text-clay-500" />
              <span className="text-clay-600 dark:text-sand-400">
                Loading...
              </span>
            </div>
          ) : allInsights.length === 0 ? (
            <p className="text-center text-clay-600 dark:text-sand-400 py-8">
              No previous reflections
            </p>
          ) : (
            <div className="space-y-4">
              {allInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="border border-sage-200 dark:border-gray-700 rounded-lg p-4 hover:bg-sage-50/50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-clay-700 dark:text-sand-200">
                        {formatDateRange(
                          insight.timeRangeStart,
                          insight.timeRangeEnd
                        )}
                      </p>
                      <p className="text-xs text-clay-500 dark:text-sand-400">
                        {formatRelativeTime(insight.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteInsight(insight.id)}
                      className="text-clay-400 hover:text-red-600 dark:text-sand-500 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-clay-700 dark:text-sand-300 line-clamp-2">
                    {insight.narrativeSummary}
                  </p>
                </div>
              ))}
            </div>
          )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
