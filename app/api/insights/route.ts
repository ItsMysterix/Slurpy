// app/api/insights/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PrismaClient } from "@prisma/client"
import { notifyInsightsUpdate } from "@/lib/sse-bus"

// Use a singleton Prisma client in dev to avoid too many connections
const g = global as unknown as { __PRISMA__?: PrismaClient }
export const prisma = g.__PRISMA__ ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") g.__PRISMA__ = prisma

// -------------------------------
// Types (simple, runtime-friendly)
// -------------------------------
interface DateRange {
  start: Date
  end: Date
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
  trend: "positive" | "neutral" | "negative"
}

interface CurrentSession {
  duration: string
  messagesExchanged: number
  dominantEmotion: string
  emotionIntensity: number
  fruit: string
  topics: string[]
}

// -----------------------------------------
// Helpers
// -----------------------------------------
function parseTopics(topics: unknown): string[] {
  if (Array.isArray(topics)) {
    return topics.filter((t) => typeof t === "string")
  }
  if (typeof topics === "string") {
    try {
      const parsed = JSON.parse(topics)
      return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : []
    } catch {
      return []
    }
  }
  return []
}

function getDateRange(timeframe: string): DateRange {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (timeframe) {
    case "day":
      return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
    case "week": {
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)
      return { start: weekStart, end: weekEnd }
    }
    case "month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { start: monthStart, end: monthEnd }
    }
    case "year": {
      const yearStart = new Date(now.getFullYear(), 0, 1)
      const yearEnd = new Date(now.getFullYear() + 1, 0, 1)
      return { start: yearStart, end: yearEnd }
    }
    default:
      return getDateRange("week")
  }
}

function getFruitForEmotion(emotion: string): string {
  const fruits: Record<string, string> = {
    joy: "🥭",
    frustrated: "🍋",
    excited: "🍍",
    anxious: "🍌",
    angry: "🔥",
    aggressive: "🌶️",
    calm: "🍉",
    exhausted: "🫐",
    hopeful: "🍇",
    content: "🍑",
    focused: "🍎",
    energetic: "🍒",
    resilient: "🥝",
    worried: "🍐",
    sad: "🌰",
    thoughtful: "🍇",
    passionate: "🍎",
    neutral: "🍋",
    happy: "😊",
    peaceful: "🌱",
    curious: "🤔",
    grateful: "🙏",
  }
  return fruits[emotion?.toLowerCase()] || "🍋"
}

function calculateMoodScore(emotion: string, intensity: number): number {
  const positive = ["joy", "excited", "hopeful", "content", "energetic", "happy", "peaceful", "grateful"]
  const neutral = ["calm", "focused", "thoughtful", "curious", "neutral"]

  if (positive.includes((emotion || "").toLowerCase())) {
    return Math.min(10, 5 + intensity * 5)
  } else if (neutral.includes((emotion || "").toLowerCase())) {
    return 5 + (intensity - 0.5) * 2
  } else {
    return Math.max(1, 5 - intensity * 4)
  }
}

function getEmotionColor(emotion: string): string {
  const colorMap: Record<string, string> = {
    happy: "bg-yellow-100 text-yellow-700",
    joy: "bg-yellow-100 text-yellow-700",
    excited: "bg-orange-100 text-orange-700",
    sad: "bg-blue-100 text-blue-700",
    angry: "bg-red-100 text-red-700",
    anxious: "bg-purple-100 text-purple-700",
    calm: "bg-green-100 text-green-700",
    neutral: "bg-gray-100 text-gray-700",
  }
  return colorMap[emotion?.toLowerCase()] || "bg-gray-100 text-gray-700"
}

function generateInsights(messages: any[], sessions: any[], _timeframe: string): Insight[] {
  const insights: Insight[] = []

  if (messages.length > 0) {
    const totalMessages = messages.length
    const avgSessionLength = sessions.length > 0 ? totalMessages / sessions.length : 0

    if (avgSessionLength > 10) {
      insights.push({
        title: "Deep Conversations",
        description: `Your sessions average ${Math.round(avgSessionLength)} messages, showing meaningful engagement with Slurpy.`,
        icon: "MessageCircle",
        trend: "positive",
      })
    }

    const emotions = messages.map((m: any) => m.emotion).filter((e: any): e is string => typeof e === "string")
    const positive = emotions.filter((e) =>
      ["joy", "excited", "hopeful", "content", "happy", "peaceful", "grateful"].includes(e),
    )

    if (emotions.length > 0) {
      if (positive.length > emotions.length * 0.6) {
        insights.push({
          title: "Positive Emotional Trend",
          description: `${Math.round((positive.length / emotions.length) * 100)}% of your conversations show positive emotions.`,
          icon: "TrendingUp",
          trend: "positive",
        })
      } else if (positive.length < emotions.length * 0.3) {
        insights.push({
          title: "Support Opportunity",
          description: "Consider exploring mindfulness techniques or discussing stress management strategies.",
          icon: "Heart",
          trend: "neutral",
        })
      }
    }

    const allTopics = messages.flatMap((m: any) => parseTopics(m.topics))
    const uniqueTopics = [...new Set(allTopics)]
    if (uniqueTopics.length > 5) {
      insights.push({
        title: "Diverse Conversations",
        description: `You've explored ${uniqueTopics.length} different topics, showing healthy emotional range.`,
        icon: "Brain",
        trend: "positive",
      })
    }
  }

  if (insights.length === 0) {
    insights.push({
      title: "Getting Started",
      description: `Start more conversations to see personalized insights about your emotional patterns.`,
      icon: "Calendar",
      trend: "neutral",
    })
  }

  return insights
}

// -----------------------------------------
// GET /api/insights
// -----------------------------------------
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const requestedUserId = url.searchParams.get("userId")
    const timeframe = url.searchParams.get("timeframe") || "week"

    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { start, end } = getDateRange(timeframe)

    const sessions = await prisma.chatSession.findMany({
      where: { userId, startTime: { gte: start, lt: end } },
      include: { messages: { orderBy: { timestamp: "desc" } } },
      orderBy: { startTime: "desc" },
    })

    const messages = await prisma.chatMessage.findMany({
      where: { userId, timestamp: { gte: start, lt: end } },
      orderBy: { timestamp: "desc" },
    })

    // Current session summary
    let currentSession: CurrentSession = {
      duration: "0 minutes",
      messagesExchanged: 0,
      dominantEmotion: "neutral",
      emotionIntensity: 5,
      fruit: "🍋",
      topics: [],
    }

    if (sessions.length > 0) {
      const totalMessages = messages.length

      const totalDuration = sessions.reduce((acc: number, session: any) => {
        if (typeof session.duration === "number") return acc + session.duration
        const endTime = session.endTime || new Date()
        const mins = Math.max(0, Math.round((endTime.getTime() - session.startTime.getTime()) / (1000 * 60)))
        return acc + mins
      }, 0)

      const validEmotions = messages.map((m: any) => m.emotion).filter((e: any): e is string => typeof e === "string")

      const emotionCounts = validEmotions.reduce((acc: Record<string, number>, e: string) => {
        acc[e] = (acc[e] || 0) + 1
        return acc
      }, {})

      const dominantEmotion =
        Object.entries(emotionCounts).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || "neutral"

      const intensities = messages
        .filter((m: any) => m.emotion === dominantEmotion && typeof m.intensity === "number")
        .map((m: any) => m.intensity as number)

      const avgIntensity = intensities.length ? intensities.reduce((a, b) => a + b, 0) / intensities.length : 0.5

      const allTopics = messages.flatMap((m: any) => parseTopics(m.topics))
      const uniqueTopics = [...new Set(allTopics)].slice(0, 8)

      currentSession = {
        duration: totalDuration > 60 ? `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m` : `${totalDuration} minutes`,
        messagesExchanged: totalMessages,
        dominantEmotion,
        emotionIntensity: Math.round(avgIntensity * 10) / 10,
        fruit: getFruitForEmotion(dominantEmotion),
        topics: uniqueTopics,
      }
    }

    // Weekly trends
    const weeklyTrends: WeeklyTrend[] = []
    if (timeframe === "week" || timeframe === "day") {
      const days = timeframe === "day" ? 1 : 7
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(start)
        date.setDate(start.getDate() + (timeframe === "day" ? 0 : i))

        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

        const dayMessages = messages.filter((m: any) => m.timestamp >= dayStart && m.timestamp < dayEnd)
        const daySessions = sessions.filter((s: any) => s.startTime >= dayStart && s.startTime < dayEnd)

        let moodScore = 5
        if (dayMessages.length > 0) {
          const dayEmotions = dayMessages.filter(
            (m: any) => typeof m.emotion === "string" && typeof m.intensity === "number",
          )
          if (dayEmotions.length > 0) {
            const scores = dayEmotions.map((m: any) => calculateMoodScore(m.emotion, m.intensity))
            moodScore = Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
          }
        }

        weeklyTrends.push({
          day: timeframe === "day" ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" }),
          mood: Math.round(moodScore),
          sessions: daySessions.length,
          date: date.toISOString().split("T")[0],
        })
      }
    } else {
      // Month/year — coarse aggregates (placeholder)
      const periods = timeframe === "month" ? 4 : 12
      for (let i = 0; i < periods; i++) {
        weeklyTrends.push({
          day: timeframe === "month" ? `Week ${i + 1}` : new Date(2024, i).toLocaleDateString("en-US", { month: "short" }),
          mood: Math.round(Math.random() * 4 + 6),
          sessions: Math.round(Math.random() * 3 + 1),
          date: new Date().toISOString().split("T")[0],
        })
      }
    }

    // Emotion breakdown
    const emotionCounts = messages.reduce((acc: Record<string, number>, m: any) => {
      if (typeof m.emotion === "string") acc[m.emotion] = (acc[m.emotion] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const totalEmotionMessages = Object.values(emotionCounts).reduce((a, b) => a + b, 0)
    const emotionBreakdown: EmotionBreakdown[] = Object.entries(emotionCounts)
      .map(([emotion, count]) => ({
        emotion,
        count: count as number,
        percentage: totalEmotionMessages > 0 ? Math.round(((count as number) / totalEmotionMessages) * 100) : 0,
        color: getEmotionColor(emotion),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    const insights = generateInsights(messages, sessions, timeframe)

    return NextResponse.json({ currentSession, weeklyTrends, emotionBreakdown, insights })
  } catch (error) {
    console.error("Error fetching insights:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// -----------------------------------------
// POST /api/insights
// Stores a single chat message
// Accepts optional `assistantReaction`
// Supports service ingestion with x-slurpy-key / x-api-key
// -----------------------------------------
export async function POST(req: NextRequest) {
  try {
    // Optional service key to bypass Clerk when ingesting from a backend
    const headerKey = req.headers.get("x-slurpy-key") || req.headers.get("x-api-key")
    const secret = process.env.SLURPY_API_KEY || process.env.NEXT_PUBLIC_SLURPY_API_KEY
    const hasServiceKey = Boolean(headerKey && secret && headerKey === secret)

    const { userId: clerkUserId } = await auth()
    if (!hasServiceKey && !clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const {
      sessionId,
      message,
      role,
      emotion,
      intensity,
      topics,
      assistantReaction, // optional
      userId: bodyUserId, // used only when service key is present
    } = body ?? {}

    if (!sessionId || !message || !role) {
      return NextResponse.json({ error: "sessionId, message, and role are required" }, { status: 400 })
    }

    const effectiveUserId = (hasServiceKey ? bodyUserId : clerkUserId) as string
    if (!effectiveUserId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    // Ensure session exists
    let session = await prisma.chatSession.findUnique({ where: { sessionId } })
    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          userId: effectiveUserId,
          sessionId,
          startTime: new Date(),
          messageCount: 0,
        },
      })
    }

    // Fallback: if assistant message and assistantReaction missing, reuse emotion as reaction
    const reactionToStore: string | null =
      typeof assistantReaction === "string"
        ? assistantReaction
        : role === "assistant" && typeof emotion === "string"
          ? emotion
          : null

    // Store message
    const chatMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        userId: effectiveUserId,
        role,
        content: message,
        emotion: typeof emotion === "string" ? emotion : null,
        intensity: typeof intensity === "number" ? intensity : null, // expected 0..1
        topics: Array.isArray(topics) ? topics.filter((t: any) => typeof t === "string") : [],
        assistantReaction: reactionToStore,
      },
    })

    // Update session counters + set end time
    await prisma.chatSession.update({
      where: { sessionId },
      data: { messageCount: { increment: 1 }, endTime: new Date() },
    })

    // Notify live dashboards via SSE
    try {
      notifyInsightsUpdate({ userId: effectiveUserId, reason: "message:created", timeframe: "week" })
    } catch (e) {
      // do not fail request if SSE notify throws
      console.warn("SSE notify failed:", e)
    }

    return NextResponse.json({ success: true, messageId: chatMessage.id }, { status: 201 })
  } catch (error) {
    console.error("Error storing chat message:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
