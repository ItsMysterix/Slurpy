import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// --- Date helpers (UTC-normalized) ---
const toUTCStartOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const fromISO = (iso: string) => new Date(iso)
const dateKeyUTC = (d: Date) => {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Month range in UTC
const monthRangeUTC = (year: number, month: number) => {
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
  return { start, end }
}

// Fruit mapping
function getFruitForEmotion(emotion: string): string {
  const fruits: Record<string, string> = {
    "happy": "🍊", "joyful": "🍓", "excited": "🍍", "content": "🍇",
    "calm": "🥝", "peaceful": "🫐", "relaxed": "🍑",
    "sad": "🌰", "depressed": "🥀", "lonely": "🍂",
    "anxious": "🍑", "worried": "🍐", "nervous": "🍌",
    "angry": "🔥", "frustrated": "🍋", "irritated": "🌶️",
    "stressed": "🥔", "overwhelmed": "🌊", "tired": "😴",
    "neutral": "🍎", "okay": "🥭", "fine": "🍈"
  }
  return fruits[emotion.toLowerCase()] || "🍎"
}

// --- GET /api/calendar ---
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get("year") || new Date().getUTCFullYear().toString())
    const month = parseInt(url.searchParams.get("month") || new Date().getUTCMonth().toString())

    const { start, end } = monthRangeUTC(year, month)

    // 1) Daily moods (already UTC-safe)
    const dailyMoods = await prisma.dailyMood.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: "asc" }
    })

    // 2) Journals
    const journalEntries = await prisma.journalEntry.findMany({
      where: { userId, date: { gte: start, lte: end } },
      select: { id: true, title: true, date: true, mood: true, tags: true, content: true },
      orderBy: { date: "asc" }
    })

    // 3) Chat sessions (include messages for emotion)
    const sessions = await prisma.chatSession.findMany({
      where: { userId, startTime: { gte: start, lte: end } },
      include: {
        messages: {
          select: { emotion: true, intensity: true, timestamp: true },
          orderBy: { timestamp: "asc" }
        }
      },
      orderBy: { startTime: "asc" }
    })

    // Build calendarData map
    const calendarData: Record<string, any> = {}

    // moods -> keyed by UTC date
    for (const mood of dailyMoods) {
      const key = dateKeyUTC(mood.date)
      calendarData[key] = {
        ...calendarData[key],
        mood: {
          emotion: mood.emotion,
          intensity: mood.intensity,  // 1..10 (you save 1..10)
          fruit: mood.fruit,
          notes: mood.notes
        }
      }
    }

    // journals
    for (const entry of journalEntries) {
      const key = dateKeyUTC(entry.date)
      if (!calendarData[key]) calendarData[key] = {}
      if (!calendarData[key].journals) calendarData[key].journals = []
      calendarData[key].journals.push({
        id: entry.id,
        title: entry.title,
        mood: entry.mood,
        tags: entry.tags,
        preview: entry.content.substring(0, 100) + (entry.content.length > 100 ? "..." : "")
      })
    }

    // chat sessions -> summarize per session and put under day of startTime
    for (const s of sessions) {
      const key = dateKeyUTC(s.startTime)
      if (!calendarData[key]) calendarData[key] = {}
      if (!calendarData[key].chatSessions) calendarData[key].chatSessions = []

      const msgs = s.messages || []
      const messagesCount = msgs.length

      // dominant emotion from messages
      const counts: Record<string, number> = {}
      for (const m of msgs) {
        if (m?.emotion) counts[m.emotion] = (counts[m.emotion] || 0) + 1
      }
      const dominantEmotion =
        Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] || "neutral"

      // duration in minutes: prefer stored duration, else compute
      const endTime = s.endTime ?? new Date()
      const minutes =
        typeof s.duration === "number"
          ? s.duration
          : Math.max(0, Math.round((endTime.getTime() - s.startTime.getTime()) / 60000))

      const fmt =
        minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`

      calendarData[key].chatSessions.push({
        id: s.id,
        duration: fmt,
        messagesCount,
        dominantEmotion,
        timestamp: s.startTime.toISOString()
      })
    }

    // Stats
    const stats = {
      daysTracked: dailyMoods.length,
      averageMood:
        dailyMoods.length > 0
          ? Math.round(
              (dailyMoods.reduce((sum, m) => sum + m.intensity, 0) / dailyMoods.length) * 10
            ) / 10
          : 0,
      journalEntries: journalEntries.length,
      chatSessions: sessions.length,
      bestDay:
        dailyMoods.length > 0
          ? (() => {
              const best = dailyMoods.reduce((b, c) => (c.intensity > b.intensity ? c : b))
              return {
                date: best.date.toISOString(),
                emotion: best.emotion,
                intensity: best.intensity,
                fruit: best.fruit,
                notes: best.notes ?? undefined
              }
            })()
          : null,
      emotionDistribution: dailyMoods.reduce((acc: Record<string, number>, m) => {
        acc[m.emotion] = (acc[m.emotion] || 0) + 1
        return acc
      }, {})
    }

    return NextResponse.json({ calendarData, stats })
  } catch (error) {
    console.error("Error fetching calendar data:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// --- POST /api/calendar (UTC-normalized) ---
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { date, emotion, intensity, notes } = body

    if (!date || !emotion || !intensity) {
      return NextResponse.json({ error: "date, emotion, and intensity are required" }, { status: 400 })
    }
    if (intensity < 1 || intensity > 10) {
      return NextResponse.json({ error: "intensity must be between 1 and 10" }, { status: 400 })
    }

    const d = fromISO(date)
    const normalized = toUTCStartOfDay(d)
    const fruit = getFruitForEmotion(emotion)

    const dailyMood = await prisma.dailyMood.upsert({
      where: { userId_date: { userId, date: normalized } },
      update: { emotion, intensity, fruit, notes: notes || null, updatedAt: new Date() },
      create: { userId, date: normalized, emotion, intensity, fruit, notes: notes || null }
    })

    return NextResponse.json({
      success: true,
      mood: {
        id: dailyMood.id,
        date: dailyMood.date,
        emotion: dailyMood.emotion,
        intensity: dailyMood.intensity,
        fruit: dailyMood.fruit,
        notes: dailyMood.notes
      }
    })
  } catch (error) {
    console.error("Error saving daily mood:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// --- DELETE /api/calendar (UTC-normalized) ---
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const url = new URL(req.url)
    const date = url.searchParams.get("date")
    if (!date) return NextResponse.json({ error: "date parameter is required" }, { status: 400 })

    const d = fromISO(date)
    const normalized = toUTCStartOfDay(d)

    await prisma.dailyMood.deleteMany({ where: { userId, date: normalized } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting daily mood:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
