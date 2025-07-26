import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Helper function to normalize date to start of day
function normalizeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Helper function to get fruit emoji for emotion
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

// GET /api/calendar - Fetch calendar data for a specific month
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(url.searchParams.get("month") || new Date().getMonth().toString())

    // Get start and end of month
    const startOfMonth = new Date(year, month, 1)
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59)

    // Fetch daily moods for the month
    const dailyMoods = await prisma.dailyMood.findMany({
      where: {
        userId,
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      orderBy: { date: "asc" }
    })

    // Fetch journal entries for the month
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        userId,
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      select: {
        id: true,
        title: true,
        date: true,
        mood: true,
        tags: true,
        content: true // Include content preview
      },
      orderBy: { date: "asc" }
    })

    // Organize data by date
    const calendarData: Record<string, any> = {}

    // Add mood data
    dailyMoods.forEach(mood => {
      const dateKey = mood.date.toISOString().split('T')[0]
      calendarData[dateKey] = {
        ...calendarData[dateKey],
        mood: {
          emotion: mood.emotion,
          intensity: mood.intensity,
          fruit: mood.fruit,
          notes: mood.notes
        }
      }
    })

    // Add journal data
    journalEntries.forEach(entry => {
      const dateKey = entry.date.toISOString().split('T')[0]
      if (!calendarData[dateKey]) {
        calendarData[dateKey] = {}
      }
      if (!calendarData[dateKey].journals) {
        calendarData[dateKey].journals = []
      }
      calendarData[dateKey].journals.push({
        id: entry.id,
        title: entry.title,
        mood: entry.mood,
        tags: entry.tags,
        preview: entry.content.substring(0, 100) + (entry.content.length > 100 ? "..." : "")
      })
    })

    // Calculate month statistics
    const stats = {
      daysTracked: dailyMoods.length,
      averageMood: dailyMoods.length > 0 
        ? Math.round((dailyMoods.reduce((sum, mood) => sum + mood.intensity, 0) / dailyMoods.length) * 10) / 10
        : 0,
      journalEntries: journalEntries.length,
      bestDay: dailyMoods.length > 0 
        ? dailyMoods.reduce((best, current) => 
            current.intensity > best.intensity ? current : best
          )
        : null,
      emotionDistribution: dailyMoods.reduce((acc: Record<string, number>, mood) => {
        acc[mood.emotion] = (acc[mood.emotion] || 0) + 1
        return acc
      }, {})
    }

    return NextResponse.json({
      calendarData,
      stats
    })

  } catch (error) {
    console.error("Error fetching calendar data:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}

// POST /api/calendar - Add or update daily mood
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { date, emotion, intensity, notes } = body

    // Validation
    if (!date || !emotion || !intensity) {
      return NextResponse.json(
        { error: "date, emotion, and intensity are required" }, 
        { status: 400 }
      )
    }

    if (intensity < 1 || intensity > 10) {
      return NextResponse.json(
        { error: "intensity must be between 1 and 10" }, 
        { status: 400 }
      )
    }

    // Normalize the date to start of day
    const normalizedDate = normalizeDate(new Date(date))
    const fruit = getFruitForEmotion(emotion)

    // Upsert daily mood (update if exists, create if not)
    const dailyMood = await prisma.dailyMood.upsert({
      where: {
        userId_date: {
          userId,
          date: normalizedDate
        }
      },
      update: {
        emotion,
        intensity,
        fruit,
        notes: notes || null,
        updatedAt: new Date()
      },
      create: {
        userId,
        date: normalizedDate,
        emotion,
        intensity,
        fruit,
        notes: notes || null
      }
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
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}

// DELETE /api/calendar - Remove daily mood
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const date = url.searchParams.get("date")

    if (!date) {
      return NextResponse.json(
        { error: "date parameter is required" }, 
        { status: 400 }
      )
    }

    const normalizedDate = normalizeDate(new Date(date))

    await prisma.dailyMood.deleteMany({
      where: {
        userId,
        date: normalizedDate
      }
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error("Error deleting daily mood:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}