"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart3, TrendingUp, Heart, Brain, Calendar as CalendarIcon,
  Sun, Moon, Activity, Loader2
} from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth, useUser } from "@clerk/nextjs"
import SlideDrawer from "@/components/slide-drawer"

// ---------------- Types ----------------
interface SessionData {
  duration: string
  messagesExchanged: number
  dominantEmotion: string
  emotionIntensity: number
  fruit: string
  topics: string[]
}
interface WeeklyTrend {
  day: string
  mood: number
  sessions: number
  date: string
}
interface EmotionBreakdown {
  emotion: string
  count: number
  percentage: number
  color: string
}
interface Insight {
  title: string
  description: string
  icon: string
  trend: "positive" | "negative" | "neutral"
}
interface InsightsData {
  currentSession: SessionData
  weeklyTrends: WeeklyTrend[]
  emotionBreakdown: EmotionBreakdown[]
  insights: Insight[]
}

// Map icon string → component
const iconMap: Record<string, React.ElementType> = {
  MessageCircle: CalendarIcon, // fallback mapping not used here, kept for completeness
  TrendingUp,
  Heart,
  Brain,
  Calendar: CalendarIcon,
}

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

export default function InsightsPage() {
  const { userId } = useAuth()
  const { user } = useUser()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedTimeframe, setSelectedTimeframe] = useState<"day" | "week" | "month" | "year">("week")
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timeframes = [
    { id: "day", label: "Today" },
    { id: "week", label: "This Week" },
    { id: "month", label: "This Month" },
    { id: "year", label: "This Year" },
  ] as const

  // ---------- Helpers for header date ----------
  const today = new Date()
  const formatHeaderPeriod = () => {
    if (selectedTimeframe === "day") {
      return today.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    }
    if (selectedTimeframe === "week") {
      const start = new Date(today)
      start.setDate(today.getDate() - today.getDay()) // Sunday start
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      const sameYear = start.getFullYear() === end.getFullYear()
      const startFmt = start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: sameYear ? undefined : "numeric",
      })
      const endFmt = end.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      return `${startFmt} – ${endFmt}`
    }
    if (selectedTimeframe === "month") {
      return today.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    }
    return String(today.getFullYear())
  }

  // ---------- Data fetch ----------
  const fetchInsights = async (timeframe: string, opts: { background?: boolean } = {}) => {
    if (!userId) return
    try {
      setError(null)
      if (opts.background) setRefreshing(true)
      else setInitialLoading(true)

      const res = await fetch(`/api/insights?userId=${userId}&timeframe=${timeframe}`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`Failed to fetch insights: ${res.status}`)
      const data: InsightsData = await res.json()
      setInsightsData(data)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to load insights")
    } finally {
      if (opts.background) setRefreshing(false)
      else setInitialLoading(false)
    }
  }

  useEffect(() => {
    if (userId) fetchInsights(selectedTimeframe)
  }, [userId, selectedTimeframe])

  // Light polling only for "day"
  useEffect(() => {
    if (!userId || selectedTimeframe !== "day") return
    let ticks = 0
    const poll = () => {
      if (document.visibilityState === "visible") {
        fetchInsights(selectedTimeframe, { background: true })
        ticks += 1
        if (ticks >= 60) clearInterval(id)
      }
    }
    const id = setInterval(poll, 5000)
    window.addEventListener("focus", poll)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", poll)
    }
  }, [userId, selectedTimeframe])

  const getEmotionColor = (emotion: string) => {
    const map: Record<string, string> = {
      happy: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300",
      sad: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300",
      angry: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300",
      anxious: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300",
      excited: "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-900/30 dark:text-pink-300",
      peaceful: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300",
      stressed: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300",
      curious: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300",
      grateful: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300",
      frustrated: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300",
      neutral: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300",
    }
    return map[emotion.toLowerCase()] || map.neutral
  }

  // ---------- UI states ----------
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

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-display text-clay-700 dark:text-sand-200 mb-2">Unable to Load Insights</h2>
              <p className="text-clay-500 dark:text-sand-400 mb-4">{error}</p>
              <Button onClick={() => fetchInsights(selectedTimeframe)} className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 text-white">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!insightsData) return null

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
              <BarChart3 className="w-6 h-6" />
              Session Insights
              {user && <span className="text-sm text-clay-500 dark:text-sand-400">- {user.firstName}'s analytics</span>}
            </motion.h1>

            <div className="flex items-center gap-3">
              {/* timeframe buttons */}
              <div className="flex bg-white/50 dark:bg-gray-800/50 rounded-xl p-1 border border-sage-200/50 dark:border-gray-700/50">
                {timeframes.map((t) => (
                  <Button
                    key={t.id}
                    onClick={() => setSelectedTimeframe(t.id)}
                    variant={selectedTimeframe === t.id ? "default" : "ghost"}
                    size="sm"
                    className={`rounded-lg text-xs ${
                      selectedTimeframe === t.id
                        ? "bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 text-white"
                        : "text-clay-600 hover:text-clay-700 dark:text-sand-300 dark:hover:text-sand-200 hover:bg-sage-100 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>

              {/* period label */}
              <Badge variant="secondary" className="bg-sage-100 text-sage-700 dark:bg-gray-800 dark:text-sand-300 border-sage-200 dark:border-gray-700">
                {formatHeaderPeriod()}
              </Badge>

              {/* background refresh spinner */}
              {refreshing && <Loader2 className="w-4 h-4 animate-spin text-sage-600 dark:text-sand-300" />}

              <ThemeToggle />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Current Session Overview */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        {selectedTimeframe === "day"
                          ? "Today's Activity"
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
                          {insightsData.currentSession.duration}
                        </div>
                        <div className="text-sm text-clay-500 dark:text-sand-400">
                          {selectedTimeframe === "day" ? "Duration" : "Total Time"}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-clay-700 dark:text-sand-200">
                          {insightsData.currentSession.messagesExchanged}
                        </div>
                        <div className="text-sm text-clay-500 dark:text-sand-400">Messages</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-clay-700 dark:text-sand-200 flex items-center justify-center gap-1">
                          {insightsData.currentSession.fruit}
                          {insightsData.currentSession.emotionIntensity}/10
                        </div>
                        <div className="text-sm text-clay-500 dark:text-sand-400 capitalize">
                          {insightsData.currentSession.dominantEmotion}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-clay-700 dark:text-sand-200">
                          {insightsData.currentSession.topics.length}
                        </div>
                        <div className="text-sm text-clay-500 dark:text-sand-400">Topics</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Trends */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      {selectedTimeframe === "day"
                        ? "Today's Mood"
                        : selectedTimeframe === "week"
                        ? "Weekly Mood Trends"
                        : selectedTimeframe === "month"
                        ? "Monthly Mood Trends"
                        : "Yearly Mood Trends"}
                    </h3>

                    <div className="flex items-end justify-between h-40 gap-2">
                      {insightsData.weeklyTrends.map((t) => (
                        <div key={t.date} className="flex flex-col items-center flex-1">
                          <div
                            className="w-full bg-gradient-to-t from-sage-400 to-clay-500 dark:from-sage-600 dark:to-clay-600 rounded-t-lg transition-all duration-300 hover:from-sage-500 hover:to-clay-600 dark:hover:from-sage-700 dark:hover:to-clay-700 cursor-pointer"
                            style={{ height: `${(t.mood / 10) * 100}%` }}
                            title={`${t.day}: Mood ${t.mood}/10, ${t.sessions} sessions`}
                          />
                          <div className="text-xs text-clay-500 dark:text-sand-400 mt-2">{t.day}</div>
                          <div className="text-xs text-clay-600 dark:text-sand-300 font-medium">{t.mood}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Breakdown & Insights */}
              <div className="grid md:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
                  <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                    <CardContent className="p-6">
                      <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4 flex items-center gap-2">
                        <Heart className="w-5 h-5" />
                        Emotion Breakdown
                      </h3>
                      <div className="space-y-3">
                        {insightsData.emotionBreakdown.map((emotion) => (
                          <div key={emotion.emotion} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Badge className={`text-xs border ${getEmotionColor(emotion.emotion)}`}>{emotion.emotion}</Badge>
                              <span className="text-sm text-clay-600 dark:text-sand-300">{emotion.count} times</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-sage-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-sage-400 to-clay-500 dark:from-sage-500 dark:to-clay-600 rounded-full transition-all duration-300"
                                  style={{ width: `${emotion.percentage}%` }}
                                />
                              </div>
                              <span className="text-xs text-clay-500 dark:text-sand-400 w-8">{emotion.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
                  <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                    <CardContent className="p-6">
                      <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4 flex items-center gap-2">
                        <Brain className="w-5 h-5" />
                        Key Insights
                      </h3>
                      <div className="space-y-4">
                        {insightsData.insights.map((insight, idx) => {
                          const Icon = iconMap[insight.icon] || Brain
                          return (
                            <div key={`${insight.title}-${idx}`} className="flex items-start gap-3">
                              <div
                                className={`w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center ${
                                  insight.trend === "positive"
                                    ? "from-green-400 to-green-500"
                                    : insight.trend === "negative"
                                    ? "from-red-400 to-red-500"
                                    : "from-sage-400 to-clay-500"
                                }`}
                              >
                                <Icon className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium text-clay-700 dark:text-sand-200 mb-1">{insight.title}</h4>
                                <p className="text-sm text-clay-500 dark:text-sand-400 leading-relaxed">
                                  {insight.description}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              {/* Topics */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">
                      {selectedTimeframe === "day" ? "Today's Topics" : "Recent Topics Discussed"}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {insightsData.currentSession.topics.length > 0 ? (
                        insightsData.currentSession.topics.map((topic) => (
                          <Badge key={topic} variant="secondary" className="bg-sage-100 dark:bg-gray-800 text-clay-600 dark:text-sand-300">
                            {topic}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-clay-500 dark:text-sand-400 text-sm">No topics identified yet.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Quick Actions (restored) */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.6 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 border border-sage-100/30 dark:border-gray-700/30">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">Quick Actions</h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={() => (window.location.href = "/chat")}
                        className="flex-1 bg-gradient-to-r from-sage-600 via-clay-600 to-sand-600 hover:from-sage-700 hover:via-clay-700 hover:to-sand-700 text-white"
                      >
                        Start Chat
                      </Button>
                      <Button
                        onClick={() => (window.location.href = "/journal")}
                        variant="outline"
                        className="flex-1 border-sage-200/50 dark:border-gray-600/50 hover:bg-sage-100 dark:hover:bg-gray-700 text-clay-600 dark:text-sand-300 bg-white/60 dark:bg-gray-700/60"
                      >
                        Write Journal
                      </Button>
                      <Button
                        onClick={() => (window.location.href = "/calendar")}
                        variant="outline"
                        className="flex-1 border-sage-200/50 dark:border-gray-600/50 hover:bg-sage-100 dark:hover:bg-gray-700 text-clay-600 dark:text-sand-300 bg-white/60 dark:bg-gray-700/60"
                      >
                        Open Calendar
                      </Button>
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
