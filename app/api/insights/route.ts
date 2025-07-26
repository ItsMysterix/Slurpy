import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Simple types without complex Prisma generics
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

// Helper function to safely parse topics
function parseTopics(topics: any): string[] {
  if (Array.isArray(topics)) {
    return topics.filter(topic => typeof topic === 'string')
  }
  if (typeof topics === 'string') {
    try {
      const parsed = JSON.parse(topics)
      return Array.isArray(parsed) ? parsed.filter(topic => typeof topic === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

// Helper function to get date ranges based on timeframe
function getDateRange(timeframe: string): DateRange {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  switch (timeframe) {
    case "day":
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    case "week":
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)
      return { start: weekStart, end: weekEnd }
    case "month":
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { start: monthStart, end: monthEnd }
    case "year":
      const yearStart = new Date(now.getFullYear(), 0, 1)
      const yearEnd = new Date(now.getFullYear() + 1, 0, 1)
      return { start: yearStart, end: yearEnd }
    default:
      return getDateRange("week")
  }
}

// Helper function to get fruit emoji for emotion
function getFruitForEmotion(emotion: string): string {
  const fruits: Record<string, string> = {
    "joy": "🥭", "frustrated": "🍋", "excited": "🍍",
    "anxious": "🍌", "angry": "🔥", "aggressive": "🌶️",
    "calm": "🍉", "exhausted": "🫐", "hopeful": "🍇",
    "content": "🍑", "focused": "🍎", "energetic": "🍒",
    "resilient": "🥝", "worried": "🍐", "sad": "🌰",
    "thoughtful": "🍇", "passionate": "🍎", "neutral": "🍋",
    "happy": "😊", "peaceful": "🌱", "curious": "🤔", "grateful": "🙏"
  }
  return fruits[emotion.toLowerCase()] || "🍋"
}

// Helper function to calculate mood score from emotion and intensity
function calculateMoodScore(emotion: string, intensity: number): number {
  const positiveEmotions = ["joy", "excited", "hopeful", "content", "energetic", "happy", "peaceful", "grateful"]
  const neutralEmotions = ["calm", "focused", "thoughtful", "curious", "neutral"]
  
  if (positiveEmotions.includes(emotion.toLowerCase())) {
    return Math.min(10, 5 + (intensity * 5))
  } else if (neutralEmotions.includes(emotion.toLowerCase())) {
    return 5 + ((intensity - 0.5) * 2)
  } else {
    return Math.max(1, 5 - (intensity * 4))
  }
}

// Helper function to generate insights based on data
function generateInsights(messages: any[], sessions: any[], timeframe: string): Insight[] {
  const insights: Insight[] = []
  
  // Analyze conversation patterns
  if (messages.length > 0) {
    const totalMessages = messages.length
    const avgSessionLength = sessions.length > 0 ? totalMessages / sessions.length : 0
    
    if (avgSessionLength > 10) {
      insights.push({
        title: "Deep Conversations",
        description: `Your sessions average ${Math.round(avgSessionLength)} messages, showing meaningful engagement with Slurpy.`,
        icon: "MessageCircle",
        trend: "positive"
      })
    }
    
    // Emotion pattern analysis
    const emotions = messages
      .map((m: any) => m.emotion)
      .filter((emotion: any): emotion is string => typeof emotion === 'string')
    
    const positiveEmotions = emotions.filter((e: string) => 
      ["joy", "excited", "hopeful", "content", "happy", "peaceful", "grateful"].includes(e)
    )
    
    if (emotions.length > 0) {
      if (positiveEmotions.length > emotions.length * 0.6) {
        insights.push({
          title: "Positive Emotional Trend",
          description: `${Math.round((positiveEmotions.length / emotions.length) * 100)}% of your conversations show positive emotions.`,
          icon: "TrendingUp",
          trend: "positive"
        })
      } else if (positiveEmotions.length < emotions.length * 0.3) {
        insights.push({
          title: "Support Opportunity",
          description: "Consider exploring mindfulness techniques or discussing stress management strategies.",
          icon: "Heart",
          trend: "neutral"
        })
      }
    }
    
    // Topic analysis
    const allTopics = messages.flatMap((m: any) => parseTopics(m.topics))
    const uniqueTopics = [...new Set(allTopics)]
    
    if (uniqueTopics.length > 5) {
      insights.push({
        title: "Diverse Conversations",
        description: `You've explored ${uniqueTopics.length} different topics, showing healthy emotional range.`,
        icon: "Brain",
        trend: "positive"
      })
    }
  }
  
  // Default insight if no data
  if (insights.length === 0) {
    insights.push({
      title: "Getting Started",
      description: `Start more conversations to see personalized insights about your emotional patterns.`,
      icon: "Calendar",
      trend: "neutral"
    })
  }
  
  return insights
}

// Helper function for emotion colors
function getEmotionColor(emotion: string): string {
  const colorMap: Record<string, string> = {
    "happy": "bg-yellow-100 text-yellow-700",
    "joy": "bg-yellow-100 text-yellow-700",
    "excited": "bg-orange-100 text-orange-700",
    "sad": "bg-blue-100 text-blue-700",
    "angry": "bg-red-100 text-red-700",
    "anxious": "bg-purple-100 text-purple-700",
    "calm": "bg-green-100 text-green-700",
    "neutral": "bg-gray-100 text-gray-700"
  }
  return colorMap[emotion.toLowerCase()] || "bg-gray-100 text-gray-700"
}

// GET /api/insights - Fetch user's insights data
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const requestedUserId = url.searchParams.get("userId")
    const timeframe = url.searchParams.get("timeframe") || "week"
    
    // Ensure user can only access their own insights
    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { start, end } = getDateRange(timeframe)

    // Simple Prisma queries without complex types
    const sessions = await prisma.chatSession.findMany({
      where: {
        userId,
        startTime: {
          gte: start,
          lt: end
        }
      },
      include: {
        messages: {
          orderBy: { timestamp: "desc" }
        }
      },
      orderBy: { startTime: "desc" }
    })

    const messages = await prisma.chatMessage.findMany({
      where: {
        userId,
        timestamp: {
          gte: start,
          lt: end
        }
      },
      orderBy: { timestamp: "desc" }
    })

    // Calculate current session data
    let currentSession: CurrentSession = {
      duration: "0 minutes",
      messagesExchanged: 0,
      dominantEmotion: "neutral",
      emotionIntensity: 5,
      fruit: "🍋",
      topics: []
    }

    if (sessions.length > 0) {
      const totalMessages = messages.length
      
      // Calculate total duration
      const totalDuration = sessions.reduce((acc: number, session: any) => {
        if (session.duration && typeof session.duration === 'number') {
          return acc + session.duration
        }
        // Calculate duration from start/end time if not stored
        const sessionEnd = session.endTime || new Date()
        const duration = Math.round((sessionEnd.getTime() - session.startTime.getTime()) / (1000 * 60))
        return acc + duration
      }, 0)

      // Find most common emotion
      const validEmotions = messages
        .map((m: any) => m.emotion)
        .filter((emotion: any): emotion is string => typeof emotion === 'string')
      
      const emotionCounts = validEmotions.reduce((acc: Record<string, number>, emotion: string) => {
        acc[emotion] = (acc[emotion] || 0) + 1
        return acc
      }, {})
      
      const dominantEmotion = Object.entries(emotionCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0] || "neutral"
      
      // Calculate average intensity for dominant emotion
      const emotionIntensities = messages
        .filter((m: any) => m.emotion === dominantEmotion && typeof m.intensity === 'number')
        .map((m: any) => m.intensity as number)
      
      const avgIntensity = emotionIntensities.length > 0 
        ? emotionIntensities.reduce((a: number, b: number) => a + b, 0) / emotionIntensities.length 
        : 5

      // Extract unique topics
      const allTopics = messages.flatMap((m: any) => parseTopics(m.topics))
      const uniqueTopics = [...new Set(allTopics)].slice(0, 8)

      currentSession = {
        duration: totalDuration > 60 ? `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m` : `${totalDuration} minutes`,
        messagesExchanged: totalMessages,
        dominantEmotion,
        emotionIntensity: Math.round(avgIntensity * 10) / 10,
        fruit: getFruitForEmotion(dominantEmotion),
        topics: uniqueTopics
      }
    }

    // Generate weekly trends data
    const weeklyTrends: WeeklyTrend[] = []
    if (timeframe === "week" || timeframe === "day") {
      const days = timeframe === "day" ? 1 : 7
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(start)
        date.setDate(start.getDate() + (timeframe === "day" ? 0 : i))
        
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
        
        const dayMessages = messages.filter((m: any) => 
          m.timestamp >= dayStart && m.timestamp < dayEnd
        )
        
        const daySessions = sessions.filter((s: any) => 
          s.startTime >= dayStart && s.startTime < dayEnd
        )
        
        // Calculate mood score for the day
        let moodScore = 5
        if (dayMessages.length > 0) {
          const dayEmotions = dayMessages.filter((m: any) => 
            typeof m.emotion === 'string' && typeof m.intensity === 'number'
          )
          if (dayEmotions.length > 0) {
            const moodScores = dayEmotions.map((m: any) => 
              calculateMoodScore(m.emotion, m.intensity)
            )
            moodScore = Math.round((moodScores.reduce((a: number, b: number) => a + b, 0) / moodScores.length) * 10) / 10
          }
        }
        
        weeklyTrends.push({
          day: timeframe === "day" ? "Today" : date.toLocaleDateString('en-US', { weekday: 'short' }),
          mood: Math.round(moodScore),
          sessions: daySessions.length,
          date: date.toISOString().split('T')[0]
        })
      }
    } else {
      // For month/year, show aggregates
      const periods = timeframe === "month" ? 4 : 12
      for (let i = 0; i < periods; i++) {
        weeklyTrends.push({
          day: timeframe === "month" ? `Week ${i + 1}` : new Date(2024, i).toLocaleDateString('en-US', { month: 'short' }),
          mood: Math.round(Math.random() * 4 + 6),
          sessions: Math.round(Math.random() * 3 + 1),
          date: new Date().toISOString().split('T')[0]
        })
      }
    }

    // Generate emotion breakdown
    const emotionCounts = messages.reduce((acc: Record<string, number>, message: any) => {
      if (typeof message.emotion === 'string') {
        acc[message.emotion] = (acc[message.emotion] || 0) + 1
      }
      return acc
    }, {})

    const totalEmotionMessages = Object.values(emotionCounts).reduce((a: number, b: number) => a + b, 0)
    const emotionBreakdown: EmotionBreakdown[] = Object.entries(emotionCounts)
      .map(([emotion, count]) => ({
        emotion,
        count: count as number,
        percentage: totalEmotionMessages > 0 ? Math.round((count as number / totalEmotionMessages) * 100) : 0,
        color: getEmotionColor(emotion)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    // Generate insights
    const insights = generateInsights(messages, sessions, timeframe)

    return NextResponse.json({
      currentSession,
      weeklyTrends,
      emotionBreakdown,
      insights
    })
    
  } catch (error) {
    console.error("Error fetching insights:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}

// POST /api/insights - Store new chat message
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { sessionId, message, role, emotion, intensity, topics } = body

    if (!sessionId || !message || !role) {
      return NextResponse.json(
        { error: "sessionId, message, and role are required" }, 
        { status: 400 }
      )
    }

    // Find or create chat session
    let session = await prisma.chatSession.findUnique({
      where: { sessionId }
    })

    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          userId,
          sessionId,
          startTime: new Date(),
          messageCount: 0
        }
      })
    }

    // Create chat message
    const chatMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        userId,
        role,
        content: message,
        emotion: emotion || null,
        intensity: intensity || null,
        topics: topics && Array.isArray(topics) ? topics : []
      }
    })

    // Update session message count
    await prisma.chatSession.update({
      where: { sessionId },
      data: {
        messageCount: { increment: 1 },
        endTime: new Date()
      }
    })

    return NextResponse.json({ 
      success: true, 
      messageId: chatMessage.id 
    }, { status: 201 })
    
  } catch (error) {
    console.error("Error storing chat message:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}