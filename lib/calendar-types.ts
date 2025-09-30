// lib/calendar-types.ts
import { iconForEmotion } from "@/lib/insights-types" // or "@/lib/moodFruits" if that's your universal map

export interface DailyMoodData {
  emotion: string
  intensity: number // 1..10
  fruit?: string    // optional; we derive from emotion if missing
  notes?: string
  createdAtISO?: string
}

export interface ChatSession {
  id: string
  duration: string
  messagesCount: number
  dominantEmotion: string
  timestamp: string
}

export interface JournalEntry {
  id: string
  title?: string
  mood?: string
  tags: string[]
  preview: string
}

export interface CalendarData {
  // Support both legacy single mood and new multi-mood
  mood?: DailyMoodData
  moods?: DailyMoodData[]
  journals?: JournalEntry[]
  chatSessions?: ChatSession[]
}

export interface CalendarStats {
  daysTracked: number
  averageMood: number
  journalEntries: number
  chatSessions: number
  bestDay?: DailyMoodData & { date: string }
  emotionDistribution: Record<string, number>
}

// Helpers
export const monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
]
export const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

export const formatDateKey = (y: number, m0: number, d: number) =>
  `${y}-${String(m0+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`

export const getMoodColor = (intensity: number) => {
  if (intensity >= 8)
    return "bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300"
  if (intensity >= 6)
    return "bg-yellow-100 border-yellow-300 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-300"
  if (intensity >= 4)
    return "bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-300"
  return "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300"
}

/** Always returns an array, handling legacy {mood} shape. */
export function getDayMoods(dayData?: CalendarData | null): DailyMoodData[] {
  if (!dayData) return []
  if (Array.isArray(dayData.moods) && dayData.moods.length) return dayData.moods
  if (dayData.mood) return [dayData.mood]
  return []
}

/** map emotion -> icon path (png/ico in /public) */
export function iconForEmotionSafe(emotion: string): string {
  return iconForEmotion(emotion) // your universal mapping
}
