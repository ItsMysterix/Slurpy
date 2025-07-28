"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  TrendingUp,
  Sun,
  Moon,
  Plus,
  BookOpen,
  Edit3,
  Trash2,
  MessageCircle,
  Heart,
  X,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth } from "@clerk/nextjs"
import { toast } from "sonner"
import SlideDrawer from "@/components/slide-drawer"

// Types
interface DailyMoodData {
  emotion: string
  intensity: number
  fruit: string
  notes?: string
}

interface ChatSession {
  id: string
  duration: string
  messagesCount: number
  dominantEmotion: string
  timestamp: string
}

interface JournalEntry {
  id: string
  title?: string
  mood?: string
  tags: string[]
  preview: string
}

interface CalendarData {
  mood?: DailyMoodData
  journals?: JournalEntry[]
  chatSessions?: ChatSession[]
}

interface CalendarStats {
  daysTracked: number
  averageMood: number
  journalEntries: number
  chatSessions: number
  bestDay?: DailyMoodData & { date: string }
  emotionDistribution: Record<string, number>
}

// Emotion options for the mood selector
const EMOTIONS = [
  { value: "happy", label: "Happy", fruit: "🍊" },
  { value: "joyful", label: "Joyful", fruit: "🍓" },
  { value: "excited", label: "Excited", fruit: "🍍" },
  { value: "content", label: "Content", fruit: "🍇" },
  { value: "calm", label: "Calm", fruit: "🥝" },
  { value: "peaceful", label: "Peaceful", fruit: "🫐" },
  { value: "relaxed", label: "Relaxed", fruit: "🍑" },
  { value: "neutral", label: "Neutral", fruit: "🍎" },
  { value: "okay", label: "Okay", fruit: "🥭" },
  { value: "tired", label: "Tired", fruit: "😴" },
  { value: "stressed", label: "Stressed", fruit: "🥔" },
  { value: "anxious", label: "Anxious", fruit: "🍑" },
  { value: "worried", label: "Worried", fruit: "🍐" },
  { value: "sad", label: "Sad", fruit: "🌰" },
  { value: "frustrated", label: "Frustrated", fruit: "🍋" },
  { value: "angry", label: "Angry", fruit: "🔥" },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 rounded-lg transition-colors opacity-0"
      >
        <Sun className="w-5 h-5" />
      </Button>
    )
  }

  return (
    <Button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 rounded-lg transition-colors"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  )
}

function RightSidePanel({
  isOpen,
  onClose,
  selectedDate,
  dayData,
  onDataUpdate,
}: {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date | null
  dayData: CalendarData | null
  onDataUpdate: () => void
}) {
  const [activeTab, setActiveTab] = useState<"mood" | "journal" | "chat">("mood")
  const [isLoading, setIsLoading] = useState(false)

  // Mood form state
  const [emotion, setEmotion] = useState(dayData?.mood?.emotion || "")
  const [intensity, setIntensity] = useState(dayData?.mood?.intensity?.toString() || "5")
  const [notes, setNotes] = useState(dayData?.mood?.notes || "")

  // Update form when dayData changes
  useEffect(() => {
    if (dayData?.mood) {
      setEmotion(dayData.mood.emotion)
      setIntensity(dayData.mood.intensity.toString())
      setNotes(dayData.mood.notes || "")
    } else {
      setEmotion("")
      setIntensity("5")
      setNotes("")
    }
  }, [dayData])

  const handleSaveMood = async () => {
    if (!selectedDate || !emotion || !intensity) return

    setIsLoading(true)
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate.toISOString(),
          emotion,
          intensity: parseInt(intensity),
          notes: notes.trim() || null,
        }),
      })

      if (response.ok) {
        toast.success("Mood saved successfully!")
        onDataUpdate()
      } else {
        throw new Error("Failed to save mood")
      }
    } catch (error) {
      toast.error("Failed to save mood")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteMood = async () => {
    if (!selectedDate) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/calendar?date=${selectedDate.toISOString()}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("Mood deleted successfully!")
        onDataUpdate()
        setEmotion("")
        setIntensity("5")
        setNotes("")
      } else {
        throw new Error("Failed to delete mood")
      }
    } catch (error) {
      toast.error("Failed to delete mood")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const selectedEmotion = EMOTIONS.find((e) => e.value === emotion)

  if (!isOpen || !selectedDate) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="fixed right-0 top-0 h-full w-96 bg-gradient-to-br from-white/95 via-sage-50/90 to-sand-50/95 dark:from-gray-900/95 dark:via-gray-800/90 dark:to-gray-900/95 backdrop-blur-xl border-l border-sage-100/50 dark:border-gray-700/50 shadow-2xl z-50"
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-sage-100/50 dark:border-gray-700/50">
            <div>
              <h3 className="font-display text-lg text-clay-700 dark:text-sand-200">
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h3>
              <p className="text-sm text-clay-500 dark:text-sand-400">{selectedDate.getFullYear()}</p>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-sage-100/50 dark:border-gray-700/50">
            <button
              onClick={() => setActiveTab("mood")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                activeTab === "mood"
                  ? "text-clay-700 dark:text-sand-200 border-b-2 border-sage-500"
                  : "text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
              }`}
            >
              <Heart className="w-4 h-4" />
              Mood
            </button>
            <button
              onClick={() => setActiveTab("journal")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                activeTab === "journal"
                  ? "text-clay-700 dark:text-sand-200 border-b-2 border-sage-500"
                  : "text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Journal
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                activeTab === "chat"
                  ? "text-clay-700 dark:text-sand-200 border-b-2 border-sage-500"
                  : "text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              Chat
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "mood" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div>
                  <Label className="text-clay-600 dark:text-sand-300 text-sm font-medium">How are you feeling?</Label>
                  <Select value={emotion} onValueChange={setEmotion}>
                    <SelectTrigger className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm">
                      <SelectValue placeholder="Select your mood">
                        {selectedEmotion && (
                          <span className="flex items-center gap-2">
                            <span>{selectedEmotion.fruit}</span>
                            <span>{selectedEmotion.label}</span>
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {EMOTIONS.map((emo) => (
                        <SelectItem key={emo.value} value={emo.value}>
                          <span className="flex items-center gap-2">
                            <span>{emo.fruit}</span>
                            <span>{emo.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-clay-600 dark:text-sand-300 text-sm font-medium">Intensity (1-10)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={intensity}
                    onChange={(e) => setIntensity(e.target.value)}
                    placeholder="5"
                    className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm"
                  />
                </div>

                <div>
                  <Label className="text-clay-600 dark:text-sand-300 text-sm font-medium">Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="How was your day? Any thoughts or reflections..."
                    rows={4}
                    className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleSaveMood}
                    disabled={isLoading || !emotion}
                    className="flex-1 bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white"
                  >
                    {isLoading ? "Saving..." : dayData?.mood ? "Update Mood" : "Save Mood"}
                  </Button>
                  {dayData?.mood && (
                    <Button
                      variant="outline"
                      onClick={handleDeleteMood}
                      disabled={isLoading}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "journal" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {dayData?.journals && dayData.journals.length > 0 ? (
                  <>
                    <h4 className="font-medium text-clay-700 dark:text-sand-200">Journal Entries</h4>
                    <div className="space-y-3">
                      {dayData.journals.map((journal) => (
                        <Card
                          key={journal.id}
                          className="bg-white/50 dark:bg-gray-800/50 border-sage-200/50 dark:border-gray-600/50"
                        >
                          <CardContent className="p-3">
                            <h5 className="font-medium text-clay-700 dark:text-sand-200 text-sm mb-1">
                              {journal.title || "Untitled Entry"}
                            </h5>
                            <p className="text-xs text-clay-600 dark:text-sand-300 mb-2">{journal.preview}</p>
                            <div className="flex flex-wrap gap-1">
                              {journal.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  #{tag}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="w-8 h-8 text-clay-300 dark:text-sand-600 mx-auto mb-2" />
                    <p className="text-sm text-clay-500 dark:text-sand-400 mb-3">No journal entries for this day</p>
                    <Button
                      onClick={() => (window.location.href = "/journal")}
                      size="sm"
                      className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Write Entry
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "chat" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {dayData?.chatSessions && dayData.chatSessions.length > 0 ? (
                  <>
                    <h4 className="font-medium text-clay-700 dark:text-sand-200">Chat Sessions</h4>
                    <div className="space-y-3">
                      {dayData.chatSessions.map((session) => (
                        <Card
                          key={session.id}
                          className="bg-white/50 dark:bg-gray-800/50 border-sage-200/50 dark:border-gray-600/50"
                        >
                          <CardContent className="p-3">
                            <div className="flex justify-between items-start mb-2">
                              <h5 className="font-medium text-clay-700 dark:text-sand-200 text-sm">Chat Session</h5>
                              <span className="text-xs text-clay-500 dark:text-sand-400">{session.duration}</span>
                            </div>
                            <div className="flex justify-between text-xs text-clay-600 dark:text-sand-300">
                              <span>{session.messagesCount} messages</span>
                              <span className="capitalize">{session.dominantEmotion}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <MessageCircle className="w-8 h-8 text-clay-300 dark:text-sand-600 mx-auto mb-2" />
                    <p className="text-sm text-clay-500 dark:text-sand-400 mb-3">No chat sessions for this day</p>
                    <Button
                      onClick={() => (window.location.href = "/chat")}
                      size="sm"
                      className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Start Chat
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [calendarData, setCalendarData] = useState<Record<string, CalendarData>>({})
  const [stats, setStats] = useState<CalendarStats>({
    daysTracked: 0,
    averageMood: 0,
    journalEntries: 0,
    chatSessions: 0,
    emotionDistribution: {},
  })
  const [isLoading, setIsLoading] = useState(true)

  const { isSignedIn } = useAuth()

  const today = new Date()
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // Fetch calendar data
  const fetchCalendarData = async () => {
    if (!isSignedIn) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/calendar?year=${currentYear}&month=${currentMonth}`)

      if (response.ok) {
        const data = await response.json()
        setCalendarData(data.calendarData)
        setStats(data.stats)
      } else {
        toast.error("Failed to load calendar data")
      }
    } catch (error) {
      toast.error("Failed to load calendar data")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCalendarData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, currentYear, isSignedIn])

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentYear, currentMonth + direction, 1))
  }

  const formatDateKey = (day: number) => {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  const getMoodColor = (intensity: number) => {
    if (intensity >= 8)
      return "bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300"
    if (intensity >= 6)
      return "bg-yellow-100 border-yellow-300 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-300"
    if (intensity >= 4)
      return "bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-300"
    return "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300"
  }

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(currentYear, currentMonth, day)
    setSelectedDate(clickedDate)
    setRightPanelOpen(true)
  }

  const handleCloseRightPanel = () => {
    setRightPanelOpen(false)
    setSelectedDate(null)
  }

  // Calculate calendar grid
  const calendarDays: (number | null)[] = []

  // Empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null)
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day)
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
        <Card className="p-6 text-center bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30">
          <CardContent>
            <h2 className="text-xl font-semibold mb-2 text-clay-700 dark:text-sand-200">Please sign in</h2>
            <p className="text-clay-600 dark:text-sand-400">Sign in to track your moods and view your calendar.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div
        className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"} ${
          rightPanelOpen ? "mr-96" : "mr-0"
        }`}
      >
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm border-b border-sage-100/50 dark:border-gray-800/50">
            <motion.h1
              className="text-2xl font-display font-medium text-clay-700 dark:text-sand-200 flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <CalendarIcon className="w-6 h-6" />
              Mood Calendar
            </motion.h1>
            <ThemeToggle />
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Calendar Header */}
              <motion.div
                className="flex items-center justify-between"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="flex items-center gap-4">
                  <Button
                    onClick={() => navigateMonth(-1)}
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-sage-200/50 dark:border-gray-600/50 hover:bg-sage-100 dark:hover:bg-gray-700 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <h2 className="text-3xl font-display text-clay-700 dark:text-sand-200">
                    {monthNames[currentMonth]} {currentYear}
                  </h2>
                  <Button
                    onClick={() => navigateMonth(1)}
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-sage-200/50 dark:border-gray-600/50 hover:bg-sage-100 dark:hover:bg-gray-700 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-sage-100 text-sage-600 dark:bg-gray-800 dark:text-sand-300 border-sage-200 dark:border-gray-600"
                  >
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Track Progress
                  </Badge>
                </div>
              </motion.div>

              {/* Calendar Grid */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                  <CardContent className="p-6">
                    {/* Day Headers */}
                    <div className="grid grid-cols-7 gap-2 mb-4">
                      {dayNames.map((day) => (
                        <div key={day} className="text-center text-sm font-medium text-clay-500 dark:text-sand-400 py-2">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-2">
                      {calendarDays.map((day, index) => {
                        // Use explicit null check to avoid treating day=0 as falsy if ever used
                        if (day === null) {
                          return <div key={`pad-${currentYear}-${currentMonth}-${index}`} className="h-24" />
                        }

                        const dateKey = formatDateKey(day)
                        const dayData = calendarData[dateKey]
                        const moodInfo = dayData?.mood
                        const journals = dayData?.journals || []
                        const chatSessions = dayData?.chatSessions || []
                        const isToday =
                          day === today.getDate() &&
                          currentMonth === today.getMonth() &&
                          currentYear === today.getFullYear()

                        return (
                          <motion.div
                            key={`day-${dateKey}`} // ✅ unique & stable per cell
                            className={`h-24 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${
                              isToday
                                ? "border-sage-400 bg-sage-50 dark:border-sand-400 dark:bg-gray-800/70"
                                : moodInfo
                                  ? getMoodColor(moodInfo.intensity)
                                  : "border-sage-200/50 dark:border-gray-600/50 bg-white/50 dark:bg-gray-800/50 hover:border-sage-300 dark:hover:border-sand-400"
                            }`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleDateClick(day)}
                          >
                            <div className="p-2 h-full flex flex-col justify-between">
                              <div className="flex justify-between items-start">
                                <span
                                  className={`text-sm font-medium ${
                                    isToday ? "text-clay-700 dark:text-sand-200" : "text-clay-600 dark:text-sand-300"
                                  }`}
                                >
                                  {day}
                                </span>
                                {/* Activity Icons */}
                                <div className="flex flex-col gap-1">
                                  {moodInfo && (
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sage-400 to-clay-500 flex items-center justify-center">
                                      <Heart className="w-3 h-3 text-white" />
                                    </div>
                                  )}
                                  {journals.length > 0 && (
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-clay-400 to-sand-500 flex items-center justify-center">
                                      <BookOpen className="w-3 h-3 text-white" />
                                    </div>
                                  )}
                                  {chatSessions.length > 0 && (
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sand-400 to-sage-500 flex items-center justify-center">
                                      <MessageCircle className="w-3 h-3 text-white" />
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1">
                                {moodInfo && (
                                  <div className="text-xs text-center capitalize font-medium text-clay-600 dark:text-sand-300">
                                    {moodInfo.emotion}
                                  </div>
                                )}
                                <div className="flex justify-center gap-1 text-xs text-clay-500 dark:text-sand-400">
                                  {journals.length > 0 && <span>{journals.length}j</span>}
                                  {chatSessions.length > 0 && <span>{chatSessions.length}c</span>}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Stats and Legend */}
              <motion.div
                className="grid md:grid-cols-2 gap-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">Activity Legend</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sage-400 to-clay-500 flex items-center justify-center">
                          <Heart className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Mood tracked</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-clay-400 to-sand-500 flex items-center justify-center">
                          <BookOpen className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Journal entries</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sand-400 to-sage-500 flex items-center justify-center">
                          <MessageCircle className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Chat sessions</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-sage-200/50 dark:border-gray-700/50">
                      <p className="text-xs text-clay-500 dark:text-sand-400">Click on any day to view details and add activities</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">This Month</h3>
                    {isLoading ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-sage-200 dark:bg-gray-700 rounded animate-pulse" />
                        <div className="h-4 bg-sage-200 dark:bg-gray-700 rounded animate-pulse" />
                        <div className="h-4 bg-sage-200 dark:bg-gray-700 rounded animate-pulse" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Days tracked</span>
                          <span className="font-medium text-clay-700 dark:text-sand-200">{stats.daysTracked}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Average mood</span>
                          <span className="font-medium text-clay-700 dark:text-sand-200">
                            {stats.averageMood > 0 ? stats.averageMood.toFixed(1) : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Journal entries</span>
                          <span className="font-medium text-clay-700 dark:text-sand-200">{stats.journalEntries}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Chat sessions</span>
                          <span className="font-medium text-clay-700 dark:text-sand-200">{stats.chatSessions}</span>
                        </div>
                        {stats.bestDay && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Best day</span>
                            <span className="font-medium text-clay-700 dark:text-sand-200 flex items-center gap-1">
                              {new Date(stats.bestDay.date).getDate()}
                              {stats.bestDay.fruit}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Quick Actions */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.6 }}>
                <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">Quick Actions</h3>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => {
                          setSelectedDate(new Date())
                          setRightPanelOpen(true)
                        }}
                        className="flex-1 bg-gradient-to-r from-sage-600 via-clay-600 to-sand-600 hover:from-sage-700 hover:via-clay-700 hover:to-sand-700 text-white"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Today's Mood
                      </Button>
                      <Button
                        onClick={() => (window.location.href = "/journal")}
                        variant="outline"
                        className="flex-1 border-sage-200/50 dark:border-gray-600/50 hover:bg-sage-100 dark:hover:bg-gray-700 text-clay-600 dark:text-sand-300 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm"
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Write Journal
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side Panel */}
      <RightSidePanel
        isOpen={rightPanelOpen}
        onClose={handleCloseRightPanel}
        selectedDate={selectedDate}
        dayData={selectedDate ? calendarData[formatDateKey(selectedDate.getDate())] : null}
        onDataUpdate={fetchCalendarData}
      />
    </div>
  )
}
