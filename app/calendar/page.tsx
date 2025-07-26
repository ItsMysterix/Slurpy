"use client"

import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight, CalendarIcon, TrendingUp, Sun, Moon, Plus, BookOpen, Edit3, Trash2 } from "lucide-react"
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
}

interface CalendarStats {
  daysTracked: number
  averageMood: number
  journalEntries: number
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

function MoodDialog({ 
  isOpen, 
  onOpenChange, 
  selectedDate, 
  existingMood, 
  onMoodSaved 
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  selectedDate: Date | null
  existingMood?: DailyMoodData
  onMoodSaved: () => void
}) {
  const [emotion, setEmotion] = useState(existingMood?.emotion || "")
  const [intensity, setIntensity] = useState(existingMood?.intensity?.toString() || "5")
  const [notes, setNotes] = useState(existingMood?.notes || "")
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
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
          notes: notes.trim() || null
        })
      })

      if (response.ok) {
        toast.success("Mood saved successfully!")
        onMoodSaved()
        onOpenChange(false)
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

  const handleDelete = async () => {
    if (!selectedDate) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/calendar?date=${selectedDate.toISOString()}`, {
        method: "DELETE"
      })

      if (response.ok) {
        toast.success("Mood deleted successfully!")
        onMoodSaved()
        onOpenChange(false)
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

  const selectedEmotion = EMOTIONS.find(e => e.value === emotion)

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            {selectedDate ? selectedDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            }) : "Add Mood"}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label>How are you feeling?</Label>
            <Select value={emotion} onValueChange={setEmotion}>
              <SelectTrigger>
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
                {EMOTIONS.map(emotion => (
                  <SelectItem key={emotion.value} value={emotion.value}>
                    <span className="flex items-center gap-2">
                      <span>{emotion.fruit}</span>
                      <span>{emotion.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Intensity (1-10)</Label>
            <Input
              type="number"
              min="1"
              max="10"
              value={intensity}
              onChange={(e) => setIntensity(e.target.value)}
              placeholder="5"
            />
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How was your day? Any thoughts or reflections..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={isLoading || !emotion} className="flex-1">
              {isLoading ? "Saving..." : existingMood ? "Update Mood" : "Save Mood"}
            </Button>
            {existingMood && (
              <Button 
                variant="outline" 
                onClick={handleDelete} 
                disabled={isLoading}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [calendarData, setCalendarData] = useState<Record<string, CalendarData>>({})
  const [stats, setStats] = useState<CalendarStats>({
    daysTracked: 0,
    averageMood: 0,
    journalEntries: 0,
    emotionDistribution: {}
  })
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isMoodDialogOpen, setIsMoodDialogOpen] = useState(false)
  
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
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // Fetch calendar data
  const fetchCalendarData = async () => {
    if (!isSignedIn) return

    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/calendar?year=${currentYear}&month=${currentMonth}`
      )
      
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
  }, [currentMonth, currentYear, isSignedIn])

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentYear, currentMonth + direction, 1))
  }

  const formatDateKey = (day: number) => {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  const getMoodColor = (intensity: number) => {
    if (intensity >= 8) return "bg-green-100 border-green-300 text-green-700"
    if (intensity >= 6) return "bg-yellow-100 border-yellow-300 text-yellow-700"
    if (intensity >= 4) return "bg-orange-100 border-orange-300 text-orange-700"
    return "bg-red-100 border-red-300 text-red-700"
  }

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(currentYear, currentMonth, day)
    setSelectedDate(clickedDate)
    setIsMoodDialogOpen(true)
  }

  const handleJournalClick = (journalId: string) => {
    // Navigate to journal entry
    window.location.href = `/journal?entry=${journalId}`
  }

  // Calculate calendar grid
  const calendarDays = []

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
      <div className="min-h-screen bg-sand-50 dark:bg-sand-900 flex items-center justify-center">
        <Card className="p-6 text-center">
          <CardContent>
            <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
            <p className="text-sage-600 dark:text-sage-400">
              Sign in to track your moods and view your calendar.
            </p>
          </CardContent>
        </Card>
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
                    className="rounded-xl border-sage-200 hover:bg-sage-100"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <h2 className="text-3xl font-display text-sage-600 dark:text-sage-200">
                    {monthNames[currentMonth]} {currentYear}
                  </h2>
                  <Button
                    onClick={() => navigateMonth(1)}
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-sage-200 hover:bg-sage-100"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-sage-100 text-sage-600">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Track Progress
                  </Badge>
                </div>
              </motion.div>

              {/* Calendar Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                  <CardContent className="p-6">
                    {/* Day Headers */}
                    <div className="grid grid-cols-7 gap-2 mb-4">
                      {dayNames.map((day) => (
                        <div
                          key={day}
                          className="text-center text-sm font-medium text-sage-500 dark:text-sage-400 py-2"
                        >
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-2">
                      {calendarDays.map((day, index) => {
                        if (!day) {
                          return <div key={index} className="h-24" />
                        }

                        const dateKey = formatDateKey(day)
                        const dayData = calendarData[dateKey]
                        const moodInfo = dayData?.mood
                        const journals = dayData?.journals || []
                        const isToday =
                          day === today.getDate() &&
                          currentMonth === today.getMonth() &&
                          currentYear === today.getFullYear()

                        return (
                          <motion.div
                            key={day}
                            className={`h-24 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${
                              isToday
                                ? "border-sage-400 bg-sage-50 dark:bg-sage-800"
                                : moodInfo
                                  ? getMoodColor(moodInfo.intensity)
                                  : "border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50 hover:border-sage-300"
                            }`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleDateClick(day)}
                          >
                            <div className="p-2 h-full flex flex-col justify-between">
                              <div className="flex justify-between items-start">
                                <span
                                  className={`text-sm font-medium ${
                                    isToday ? "text-sage-700 dark:text-sage-200" : "text-sage-600 dark:text-sage-300"
                                  }`}
                                >
                                  {day}
                                </span>
                                <div className="flex items-center gap-1">
                                  {moodInfo && <span className="text-lg">{moodInfo.fruit}</span>}
                                  {journals.length > 0 && (
                                    <BookOpen className="w-3 h-3 text-sage-500" />
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1">
                                {moodInfo && (
                                  <div className="text-xs text-center capitalize font-medium">
                                    {moodInfo.emotion}
                                  </div>
                                )}
                                {journals.length > 0 && (
                                  <div className="text-xs text-center text-sage-500">
                                    {journals.length} journal{journals.length > 1 ? 's' : ''}
                                  </div>
                                )}
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
                <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 mb-4">Mood Legend</h3>
                    <div className="space-y-3">
                      {[
                        { range: "8-10", label: "Great", color: "bg-green-100 border-green-300" },
                        { range: "6-7", label: "Good", color: "bg-yellow-100 border-yellow-300" },
                        { range: "4-5", label: "Okay", color: "bg-orange-100 border-orange-300" },
                        { range: "1-3", label: "Difficult", color: "bg-red-100 border-red-300" },
                      ].map((item) => (
                        <div key={item.range} className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded border-2 ${item.color}`} />
                          <span className="text-sm text-sage-600 dark:text-sage-300 font-sans">
                            {item.label} ({item.range})
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-sand-200 dark:border-sage-700">
                      <div className="flex items-center gap-2 text-sm text-sage-600 dark:text-sage-300">
                        <BookOpen className="w-4 h-4" />
                        <span>Journal entries</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 mb-4">This Month</h3>
                    {isLoading ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-sage-200 dark:bg-sage-700 rounded animate-pulse" />
                        <div className="h-4 bg-sage-200 dark:bg-sage-700 rounded animate-pulse" />
                        <div className="h-4 bg-sage-200 dark:bg-sage-700 rounded animate-pulse" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-sage-600 dark:text-sage-300 font-sans">Days tracked</span>
                          <span className="font-medium text-sage-700 dark:text-sage-200">{stats.daysTracked}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-sage-600 dark:text-sage-300 font-sans">Average mood</span>
                          <span className="font-medium text-sage-700 dark:text-sage-200">
                            {stats.averageMood > 0 ? stats.averageMood : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-sage-600 dark:text-sage-300 font-sans">Journal entries</span>
                          <span className="font-medium text-sage-700 dark:text-sage-200">{stats.journalEntries}</span>
                        </div>
                        {stats.bestDay && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-sage-600 dark:text-sage-300 font-sans">Best day</span>
                            <span className="font-medium text-sage-700 dark:text-sage-200 flex items-center gap-1">
                              {new Date(stats.bestDay.date).getDate()}{stats.bestDay.fruit}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Quick Actions */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 mb-4">Quick Actions</h3>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => {
                          setSelectedDate(new Date())
                          setIsMoodDialogOpen(true)
                        }}
                        className="flex-1 bg-sage-600 hover:bg-sage-700 text-white"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Today's Mood
                      </Button>
                      <Button
                        onClick={() => window.location.href = '/journal'}
                        variant="outline"
                        className="flex-1"
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

      {/* Mood Dialog */}
      <MoodDialog
        isOpen={isMoodDialogOpen}
        onOpenChange={setIsMoodDialogOpen}
        selectedDate={selectedDate}
        existingMood={selectedDate ? calendarData[selectedDate.toISOString().split('T')[0]]?.mood : undefined}
        onMoodSaved={fetchCalendarData}
      />
    </div>
  )
}