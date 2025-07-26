"use client"

import React from "react"
import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, Heart, Brain, Calendar, Sun, Moon, Activity, Loader2 } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth, useUser } from "@clerk/nextjs"
import SlideDrawer from "@/components/slide-drawer"

// Types for our real data
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
  icon: any
  trend: "positive" | "negative" | "neutral"
}

interface InsightsData {
  currentSession: SessionData
  weeklyTrends: WeeklyTrend[]
  emotionBreakdown: EmotionBreakdown[]
  insights: Insight[]
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <Button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-sage-600 hover:text-sage-500 dark:text-sage-400 dark:hover:text-sage-300 p-2 rounded-lg"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  )
}

export default function InsightsPage() {
  const { userId } = useAuth()
  const { user } = useUser()
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedTimeframe, setSelectedTimeframe] = useState("week")
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const timeframes = [
    { id: "day", label: "Today" },
    { id: "week", label: "This Week" },
    { id: "month", label: "This Month" },
    { id: "year", label: "This Year" },
  ]

  // Fetch insights data based on timeframe
  const fetchInsights = async (timeframe: string) => {
    if (!userId) return
    
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/insights?userId=${userId}&timeframe=${timeframe}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch insights: ${response.status}`)
      }
      
      const data = await response.json()
      setInsightsData(data)
      
    } catch (err) {
      console.error("Error fetching insights:", err)
      setError(err instanceof Error ? err.message : "Failed to load insights")
    } finally {
      setLoading(false)
    }
  }

  // Load insights when component mounts or timeframe changes
  useEffect(() => {
    if (userId) {
      fetchInsights(selectedTimeframe)
    }
  }, [userId, selectedTimeframe])

  // Handle timeframe change
  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe)
    // fetchInsights will be called automatically by useEffect
  }

  // Get emotion color styling
  const getEmotionColor = (emotion: string) => {
    const emotionColors: { [key: string]: string } = {
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
      neutral: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300"
    }
    return emotionColors[emotion.toLowerCase()] || emotionColors.neutral
  }

  // Format duration for display
  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} minutes`
    }
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-sand-50 dark:bg-sand-900 transition-all duration-500">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-sage-500" />
              <p className="text-sage-500 dark:text-sage-400">Loading your insights...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-sand-50 dark:bg-sand-900 transition-all duration-500">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-display text-sage-600 dark:text-sage-200 mb-2">Unable to Load Insights</h2>
              <p className="text-sage-500 dark:text-sage-400 mb-4">{error}</p>
              <Button 
                onClick={() => fetchInsights(selectedTimeframe)}
                className="bg-sage-500 hover:bg-sage-400 text-white"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No data state
  if (!insightsData) {
    return (
      <div className="min-h-screen bg-sand-50 dark:bg-sand-900 transition-all duration-500">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 text-sage-300 dark:text-sage-600 mx-auto mb-4" />
              <h2 className="text-xl font-display text-sage-600 dark:text-sage-200 mb-2">No Insights Available</h2>
              <p className="text-sage-500 dark:text-sage-400 mb-4">Start chatting with Slurpy to see your insights!</p>
              <Button 
                onClick={() => window.location.href = '/chat'}
                className="bg-sage-500 hover:bg-sage-400 text-white"
              >
                Start Chatting
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sand-50 dark:bg-sand-900 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-sand-200 dark:border-sage-700">
            <motion.h1
              className="text-2xl font-display font-medium text-sage-700 dark:text-sage-300 flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <BarChart3 className="w-6 h-6" />
              Session Insights
              {user && (
                <span className="text-sm font-sans text-sage-500 dark:text-sage-400">
                  - {user.firstName}'s analytics
                </span>
              )}
            </motion.h1>
            <div className="flex items-center gap-3">
              <div className="flex bg-white/50 dark:bg-sage-800/50 rounded-xl p-1 border border-sand-200 dark:border-sage-700">
                {timeframes.map((timeframe) => (
                  <Button
                    key={timeframe.id}
                    onClick={() => handleTimeframeChange(timeframe.id)}
                    variant={selectedTimeframe === timeframe.id ? "default" : "ghost"}
                    size="sm"
                    className={`rounded-lg text-xs transition-all duration-200 ${
                      selectedTimeframe === timeframe.id
                        ? "bg-sage-500 text-white shadow-sm"
                        : "text-sage-600 hover:text-sage-700 dark:text-sage-300 dark:hover:text-sage-200 hover:bg-sage-100 dark:hover:bg-sage-700/50"
                    }`}
                  >
                    {timeframe.label}
                  </Button>
                ))}
              </div>
              <ThemeToggle />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Current Session Overview */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        {selectedTimeframe === "day" ? "Today's Activity" : 
                         selectedTimeframe === "week" ? "This Week's Summary" :
                         selectedTimeframe === "month" ? "This Month's Summary" : "This Year's Summary"}
                      </h3>
                      <Badge className="bg-sage-100 text-sage-600 border-sage-300 dark:bg-sage-800 dark:text-sage-300">
                        {selectedTimeframe === "day" ? "Active" : "Summary"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-sage-700 dark:text-sage-200">
                          {insightsData.currentSession.duration}
                        </div>
                        <div className="text-sm text-sage-500 dark:text-sage-400 font-sans">
                          {selectedTimeframe === "day" ? "Duration" : "Total Time"}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-sage-700 dark:text-sage-200">
                          {insightsData.currentSession.messagesExchanged}
                        </div>
                        <div className="text-sm text-sage-500 dark:text-sage-400 font-sans">Messages</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-sage-700 dark:text-sage-200 flex items-center justify-center gap-1">
                          {insightsData.currentSession.fruit}
                          {insightsData.currentSession.emotionIntensity}/10
                        </div>
                        <div className="text-sm text-sage-500 dark:text-sage-400 font-sans capitalize">
                          {insightsData.currentSession.dominantEmotion}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-sage-700 dark:text-sage-200">
                          {insightsData.currentSession.topics.length}
                        </div>
                        <div className="text-sm text-sage-500 dark:text-sage-400 font-sans">Topics</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Weekly Mood Trends */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      {selectedTimeframe === "day" ? "Today's Mood" :
                       selectedTimeframe === "week" ? "Weekly Mood Trends" :
                       selectedTimeframe === "month" ? "Monthly Mood Trends" : "Yearly Mood Trends"}
                    </h3>

                    <div className="flex items-end justify-between h-40 gap-2">
                      {insightsData.weeklyTrends.map((day, index) => (
                        <div key={day.day || index} className="flex flex-col items-center flex-1">
                          <div
                            className="w-full bg-gradient-to-t from-sage-400 to-sage-500 rounded-t-lg transition-all duration-300 hover:from-sage-500 hover:to-sage-600 cursor-pointer"
                            style={{ height: `${(day.mood / 10) * 100}%` }}
                            title={`${day.day}: Mood ${day.mood}/10, ${day.sessions} sessions`}
                          />
                          <div className="text-xs text-sage-500 dark:text-sage-400 mt-2 font-sans">{day.day}</div>
                          <div className="text-xs text-sage-600 dark:text-sage-300 font-medium">{day.mood}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Emotion Breakdown & Insights */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Emotion Breakdown */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                    <CardContent className="p-6">
                      <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 mb-4 flex items-center gap-2">
                        <Heart className="w-5 h-5" />
                        Emotion Breakdown
                      </h3>

                      <div className="space-y-3">
                        {insightsData.emotionBreakdown.map((emotion) => (
                          <div key={emotion.emotion} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Badge className={`text-xs border ${getEmotionColor(emotion.emotion)}`}>
                                {emotion.emotion}
                              </Badge>
                              <span className="text-sm text-sage-600 dark:text-sage-300 font-sans">
                                {emotion.count} times
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-sand-200 dark:bg-sage-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-sage-400 rounded-full transition-all duration-300"
                                  style={{ width: `${emotion.percentage}%` }}
                                />
                              </div>
                              <span className="text-xs text-sage-500 dark:text-sage-400 font-sans w-8">
                                {emotion.percentage}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Key Insights */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                    <CardContent className="p-6">
                      <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 mb-4 flex items-center gap-2">
                        <Brain className="w-5 h-5" />
                        Key Insights
                      </h3>

                      <div className="space-y-4">
                        {insightsData.insights.map((insight, index) => {
                          const Icon = insight.icon
                          return (
                            <div key={index} className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 ${
                                insight.trend === "positive" ? "from-green-400 to-green-500" :
                                insight.trend === "negative" ? "from-red-400 to-red-500" :
                                "from-sage-400 to-sage-500"
                              }`}>
                                <Icon className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium text-sage-600 dark:text-sage-200 font-sans mb-1">
                                  {insight.title}
                                </h4>
                                <p className="text-sm text-sage-500 dark:text-sage-400 font-sans leading-relaxed">
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

              {/* Topics Discussed */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 mb-4">
                      {selectedTimeframe === "day" ? "Today's Topics" : "Recent Topics Discussed"}
                    </h3>

                    <div className="flex flex-wrap gap-2">
                      {insightsData.currentSession.topics.length > 0 ? (
                        insightsData.currentSession.topics.map((topic, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="bg-sand-100 dark:bg-sage-800 text-sage-600 dark:text-sage-300"
                          >
                            {topic}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sage-500 dark:text-sage-400 font-sans text-sm">
                          No topics identified yet. Start a conversation to see insights!
                        </p>
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