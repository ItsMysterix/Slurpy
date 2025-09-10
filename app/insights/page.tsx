"use client"

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { useAuth, useUser } from "@clerk/nextjs"
import { useInsightsStream } from "@/lib/use-insights-stream"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, TrendingUp, Brain, Heart, Calendar as CalendarIcon, Activity, Sun, Moon } from "lucide-react"

import SlideDrawer from "@/components/slide-drawer"
import MoodTrendChart from "@/components/insights/MoodTrendChart"
import ValencePill from "@/components/insights/ValencePill"

import {
  InsightsResponse,
  normalizeInsights,
  iconForEmotion,
} from "@/lib/insights-types"

/* ---------------- Config: throttling / polling ---------------- */
const MIN_REFRESH_MS = 4000;      // ignore SSE bursts faster than this
const DAY_POLL_MS = 15000;        // gentle fallback polling for "day"
const MAX_PARALLEL_FETCH = 1;     // block overlapping fetches

/* ---------------- Theme toggle ---------------- */
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className="p-2 opacity-0">
        <Sun className="w-5 h-5" />
      </Button>
    )
  }
  return (
    <Button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  )
}

/* ---------------- Icon map for insights list ---------------- */
const iconMap: Record<string, React.ElementType> = {
  TrendingUp,
  Heart,
  Brain,
  Calendar: CalendarIcon,
}

/* ---------------- Period label helpers (client) ---------------- */
function periodLabelFor(timeframe: "day" | "week" | "month" | "year") {
  const today = new Date()
  if (timeframe === "day") {
    return today.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    })
  }
  if (timeframe === "week") {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay())
    const end = new Date(start); end.setDate(start.getDate() + 6)
    const sameYear = start.getFullYear() === end.getFullYear()
    const startFmt = start.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: sameYear ? undefined : "numeric",
    })
    const endFmt = end.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    })
    return `${startFmt} – ${endFmt}`
  }
  if (timeframe === "month") {
    return today.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }
  return String(today.getFullYear())
}

/* ============================== Page ============================== */

export default function InsightsPage() {
  const { userId } = useAuth()
  const { user } = useUser()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedTimeframe, setSelectedTimeframe] = useState<"day" | "week" | "month" | "year">("week")
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [insights, setInsights] = useState<InsightsResponse | null>(null)

  // --- refs for throttling / dedupe / abort ---
  const lastRefreshAtRef = useRef<number>(0)
  const inFlightCountRef = useRef(0)
  const currentAbortRef = useRef<AbortController | null>(null)

  // Stable fetch with dedupe + abort + background spinner control
  const fetchInsights = useCallback(
    async (timeframe: "day" | "week" | "month" | "year", opts: { background?: boolean } = {}) => {
      if (!userId) return
      if (inFlightCountRef.current >= MAX_PARALLEL_FETCH) return

      setError(null)
      if (opts.background) setRefreshing(true)
      else setInitialLoading(true)

      // Abort any slow previous background fetch for the same timeframe
      if (opts.background && currentAbortRef.current) {
        currentAbortRef.current.abort()
      }
      const ac = new AbortController()
      currentAbortRef.current = ac
      inFlightCountRef.current += 1

      try {
        const res = await fetch(`/api/insights?userId=${userId}&timeframe=${timeframe}`, {
          cache: "no-store",
          signal: ac.signal,
        })
        if (!res.ok) throw new Error(`Failed to fetch insights: ${res.status}`)
        const raw = await res.json()
        const norm = normalizeInsights(raw)
        // Use the timeframe we actually fetched, not the (possibly changed) state
        norm.header.periodLabel = periodLabelFor(timeframe)
        setInsights(norm)
        lastRefreshAtRef.current = Date.now()
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // swallow aborted fetches
        } else {
          console.error(err)
          setError(err instanceof Error ? err.message : "Failed to load insights")
        }
      } finally {
        if (opts.background) setRefreshing(false)
        else setInitialLoading(false)
        inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1)
      }
    },
    [userId]
  )

  // initial + on timeframe change
  useEffect(() => {
    if (userId) fetchInsights(selectedTimeframe)
  }, [userId, selectedTimeframe, fetchInsights])

  // ✅ Throttled SSE refresh: ignore bursts faster than MIN_REFRESH_MS
  useInsightsStream(selectedTimeframe, () => {
    const now = Date.now()
    if (now - lastRefreshAtRef.current < MIN_REFRESH_MS) return
    fetchInsights(selectedTimeframe, { background: true })
  })

  // Gentle fallback polling for "day" only
  useEffect(() => {
    if (!userId || selectedTimeframe !== "day") return
    const poll = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now()
        if (now - lastRefreshAtRef.current >= MIN_REFRESH_MS) {
          fetchInsights("day", { background: true })
        }
      }
    }
    const id = setInterval(poll, DAY_POLL_MS)
    window.addEventListener("focus", poll)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", poll)
    }
  }, [userId, selectedTimeframe, fetchInsights])

  const trendData = useMemo(() => insights?.trends.last7Days ?? [], [insights?.trends.last7Days])

  /* -------------------------- Loading / Error -------------------------- */

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-clay-500 dark:text-sand-400" />
              <p className="text-clay-500 dark:text-sand-400">Loading your insights...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !insights) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-display text-clay-700 dark:text-sand-200 mb-2">Unable to Load Insights</h2>
              <p className="text-clay-500 dark:text-sand-400 mb-4">{error ?? "Unknown error"}</p>
              <Button onClick={() => fetchInsights(selectedTimeframe)} className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 text-white">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const { header, breakdown, insights: keyInsights, topics: topicsRaw } = insights
  const topics = Array.isArray(topicsRaw) ? topicsRaw : [] // guard

  /* ============================== UI ============================== */

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm border-b border-sage-100/50 dark:border-gray-800/50">
            <motion.h1
              className="text-2xl font-display font-medium text-clay-700 dark:text-sand-200 flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <TrendingUp className="w-6 h-6" />
              Session Insights
              {user && <span className="text-sm text-clay-500 dark:text-sand-400">- {user.firstName}'s analytics</span>}
            </motion.h1>

            <div className="flex items-center gap-3">
              {/* timeframe buttons */}
              <div className="flex bg-white/50 dark:bg-gray-800/50 rounded-xl p-1 border border-sage-200/50 dark:border-gray-700/50">
                {(["day","week","month","year"] as const).map((id) => (
                  <Button
                    key={id}
                    onClick={() => setSelectedTimeframe(id)}
                    variant={selectedTimeframe === id ? "default" : "ghost"}
                    size="sm"
                    className={`rounded-lg text-xs ${
                      selectedTimeframe === id
                        ? "bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 text-white"
                        : "text-clay-600 hover:text-clay-700 dark:text-sand-300 dark:hover:text-sand-200 hover:bg-sage-100 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    {id === "day" ? "Today" : id === "week" ? "This Week" : id === "month" ? "This Month" : "This Year"}
                  </Button>
                ))}
              </div>

              <Badge variant="secondary" className="bg-sage-100 text-sage-700 dark:bg-gray-800 dark:text-sand-300 border-sage-200 dark:border-gray-700">
                {header.periodLabel || periodLabelFor(selectedTimeframe)}
              </Badge>

              {/* background refresh spinner */}
              <AnimatePresence>{refreshing && <Loader2 className="w-4 h-4 animate-spin text-sage-600 dark:text-sand-300" />}</AnimatePresence>
              <ThemeToggle />
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Summary Card */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        {selectedTimeframe === "day"
                          ? "Today's Summary"
                          : selectedTimeframe === "week"
                          ? "This Week's Summary"
                          : selectedTimeframe === "month"
                          ? "This Month's Summary"
                          : "This Year's Summary"}
                      </h3>
                      <Badge className="bg-sage-100 text-sage-600 border-sage-300 dark:bg-gray-800 dark:text-sand-300">
                        {selectedTimeframe === "day" ? "Active" : "Summary"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-clay-700 dark:text-sand-200">
                          {header.totalMinutes < 60
                            ? `${header.totalMinutes} minutes`
                            : `${Math.floor(header.totalMinutes / 60)}h ${header.totalMinutes % 60}m`}
                        </div>
                        <div className="text-sm text-clay-500 dark:text-sand-400">Total Time</div>
                      </div>

                      <div className="text-center">
                        <div className="text-2xl font-bold text-clay-700 dark:text-sand-200">{header.totalMessages}</div>
                        <div className="text-sm text-clay-500 dark:text-sand-400">Messages</div>
                      </div>

                      {/* Valence (−1..1) with emotion icon */}
                      <div className="text-center flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          <img
                            src={iconForEmotion(header.currentEmotion)}
                            alt={header.currentEmotion}
                            className="w-6 h-6 rounded"
                          />
                          <ValencePill valence={header.currentValenceNeg1To1} />
                        </div>
                        <div className="text-sm text-clay-500 dark:text-sand-400 capitalize">{header.currentEmotion}</div>
                      </div>

                      <div className="text-center">
                        <div className="text-base md:text-lg text-clay-700 dark:text-sand-200">
                          {header.topicSentence}
                        </div>
                        <div className="text-sm text-clay-500 dark:text-sand-400">Topics</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Weekly Mood Trends */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Weekly Mood Trends
                    </h3>
                    <MoodTrendChart
                      data={(trendData || []).map((t) => ({ label: t.label, valence: Number(t.valence || 0) }))}
                      height={280}
                    />
                  </CardContent>
                </Card>
              </motion.div>

              {/* Breakdown & Insights */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Emotion Breakdown */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
                  <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                    <CardContent className="p-6">
                      <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4 flex items-center gap-2">
                        <Heart className="w-5 h-5" />
                        Emotion Breakdown
                      </h3>
                      <div className="space-y-3">
                        {(breakdown.emotions || []).map((emotion) => {
                          const widthPct = Math.max(0, Math.min(100, emotion.percentage))
                          return (
                            <div key={emotion.emotion} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <img
                                  src={iconForEmotion(emotion.emotion)}
                                  alt={emotion.emotion}
                                  className="w-5 h-5 rounded"
                                />
                                <Badge className="text-xs bg-slate-800/60 text-slate-300 border-slate-700/50 capitalize">
                                  {emotion.emotion}
                                </Badge>
                                <span className="text-sm text-clay-600 dark:text-sand-300">{emotion.count}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-28 h-2 bg-sage-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-sage-400 to-clay-500 dark:from-sage-500 dark:to-clay-600 rounded-full transition-all duration-300"
                                    style={{ width: `${widthPct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-clay-500 dark:text-sand-400 w-8">{widthPct}%</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Key Insights */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}>
                  <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                    <CardContent className="p-6">
                      <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4 flex items-center gap-2">
                        <Brain className="w-5 h-5" />
                        Key Insights
                      </h3>
                      <div className="space-y-4">
                        {keyInsights.map((ins, idx) => {
                          const Icon = iconMap[ins.icon] || Brain
                          return (
                            <div key={`${ins.title}-${idx}`} className="flex items-start gap-3">
                              <div
                                className={`w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center ${
                                  ins.trend === "positive"
                                    ? "from-green-400 to-green-500"
                                    : ins.trend === "negative"
                                    ? "from-red-400 to-red-500"
                                    : "from-sage-400 to-clay-500"
                                }`}
                              >
                                <Icon className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium text-clay-700 dark:text-sand-200 mb-1">{ins.title}</h4>
                                <p className="text-sm text-clay-500 dark:text-sand-400 leading-relaxed">
                                  {ins.description}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                        {!keyInsights.length && (
                          <div className="text-sm text-clay-500 dark:text-sand-400">
                            Getting Started — Chat more to unlock personalized insights.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              {/* Topics */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">
                      {selectedTimeframe === "day" ? "Today's Topics" : "Recent Topics Discussed"}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {topics.length > 0 ? (
                        topics.map((t) => (
                          <a key={`${t.topic}-${t.lastSeenISO}`} href={t.href} className="cursor-pointer">
                            <Badge
                              variant="secondary"
                              className="bg-sage-100 dark:bg-gray-800 text-clay-600 dark:text-sand-300 hover:bg-sage-200 dark:hover:bg-gray-700 transition-colors"
                            >
                              {t.topic}
                            </Badge>
                          </a>
                        ))
                      ) : (
                        <p className="text-clay-500 dark:text-sand-400 text-sm">No topics identified yet.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
