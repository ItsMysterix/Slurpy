"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { toast } from "sonner"

import SlideDrawer from "@/components/slide-drawer"
import CalendarHeader from "@/components/calendar/CalendarHeader"
import CalendarGrid from "@/components/calendar/CalendarGrid"
import LegendCard from "@/components/calendar/LegendCard"
import StatsCard from "@/components/calendar/StatsCard"
import QuickActions from "@/components/calendar/QuickActions"
import RightSidePanel from "@/components/calendar/RightSidePanel"

import { Card, CardContent } from "@/components/ui/card"
import {
  CalendarData, CalendarStats, monthNames,
  formatDateKey,
} from "@/lib/calendar-types"

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(()=>setMounted(true),[])
  if(!mounted) return (
    <button className="opacity-0"><Sun className="w-5 h-5" /></button>
  )
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 rounded-lg transition-colors"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [calendarData, setCalendarData] = useState<Record<string, CalendarData>>({})
  const [stats, setStats] = useState<CalendarStats>({
    daysTracked: 0, averageMood: 0, journalEntries: 0, chatSessions: 0, emotionDistribution: {}
  })
  const [isLoading, setIsLoading] = useState(true)

  const { isSignedIn } = useAuth()

  const today = new Date()
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  const fetchCalendarData = async () => {
    if (!isSignedIn) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/calendar?year=${currentYear}&month=${currentMonth}`)
      if (!res.ok) throw new Error("Failed to load calendar data")
      const data = await res.json()
      setCalendarData(data.calendarData)
      setStats(data.stats)
    } catch (e) {
      toast.error("Failed to load calendar data")
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchCalendarData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, currentYear, isSignedIn])

  const navigateMonth = (delta: number) => {
    setCurrentDate(new Date(currentYear, currentMonth + delta, 1))
  }

  const handleClickDay = (day: number) => {
    const d = new Date(currentYear, currentMonth, day)
    setSelectedDate(d)
    setRightPanelOpen(true)
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
      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"} ${rightPanelOpen ? "mr-96" : "mr-0"}`}>
        <div className="flex-1 flex flex-col">
          {/* header bar */}
          <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm border-b border-sage-100/50 dark:border-gray-800/50">
            <CalendarHeader
              currentMonth={currentMonth}
              currentYear={currentYear}
              onPrev={() => navigateMonth(-1)}
              onNext={() => navigateMonth(1)}
              rightPad={rightPanelOpen}
              rightSlot={<ThemeToggle />}
            />
          </div>

          {/* main */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <CalendarGrid
                year={currentYear}
                month0={currentMonth}
                today={today}
                startingDow={startingDayOfWeek}
                daysInMonth={daysInMonth}
                dataByKey={calendarData}
                onClickDay={handleClickDay}
              />

              <div className="grid md:grid-cols-2 gap-6">
                <LegendCard />
                <StatsCard stats={stats} />
              </div>

              <QuickActions onAddToday={() => {
                const now = new Date()
                setSelectedDate(now)
                setRightPanelOpen(true)
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* right panel */}
      <RightSidePanel
        isOpen={rightPanelOpen}
        onClose={() => { setRightPanelOpen(false); setSelectedDate(null) }}
        selectedDate={selectedDate}
        dayData={selectedDate ? calendarData[formatDateKey(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())] : null}
        onDataUpdate={fetchCalendarData}
      />
    </div>
  )
}
