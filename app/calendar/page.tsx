"use client"

// Requires runtime Supabase env; disable prerendering to avoid build-time env faults.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-hooks"
import { RequireAuth } from "@/components/auth/RequireAuth"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabaseClient"

import SlideDrawer from "@/components/slide-drawer"
import CalendarHeader from "@/components/calendar/CalendarHeader"
import CalendarGrid from "@/components/calendar/CalendarGrid"
import LegendCard from "@/components/calendar/LegendCard"
import StatsCard from "@/components/calendar/StatsCard"
import QuickActions from "@/components/calendar/QuickActions"
import RightSidePanel from "@/components/calendar/RightSidePanel"

import { Card, CardContent } from "@/components/ui/card"
import {
  CalendarData,
  CalendarStats,
  formatDateKey,
  type DailyMoodData,
  type JournalEntry,
  type ChatSession,
} from "@/lib/calendar-types"

// RightSidePanel expects events with a required `title: string`.
// Define a local shape that satisfies its structural type.
type PanelDayData = {
  mood?: DailyMoodData;
  journals?: JournalEntry[];
  chatSessions?: ChatSession[];
  events?: Array<{
    id: string;
    title: string;
    location?: string;
    emotion?: string;
    intensity?: number;
    notes?: string | null;
  }>;
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date())
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
  const currentMonth = currentDate.getMonth() // 0-based
  const currentYear = currentDate.getFullYear()

  // month skeleton
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  const fetchCalendarData = async () => {
    if (!isSignedIn) return
    setIsLoading(true)
    try {
      let bearer = "";
      try {
        const { data } = await supabase.auth.getSession();
        bearer = data.session?.access_token || "";
      } catch {}
      // API expects 0-based month — passing currentMonth is correct
      const res = await fetch(`/api/calendar?year=${currentYear}&month=${currentMonth}`, {
        cache: "no-store",
        headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || "Failed to load calendar data")
      }
      const data = await res.json()
      setCalendarData(data.calendarData || {})
      setStats(data.stats || {
        daysTracked: 0,
        averageMood: 0,
        journalEntries: 0,
        chatSessions: 0,
        emotionDistribution: {},
      })
    } catch (e) {
      toast({ title: "Failed to load calendar data", variant: "destructive" })
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

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />

      {/* page frame with sidebar offset */}
      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"} ${rightPanelOpen ? "mr-96" : "mr-0"}`}>
        <div className="flex-1 flex flex-col">
          {/* Header — uses your CalendarHeader which already renders Track Progress + Theme toggle */}
          <CalendarHeader
            currentDate={currentDate}
            onPrev={() => navigateMonth(-1)}
            onNext={() => navigateMonth(1)}
          />

          {/* Main content */}
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

              <QuickActions
                onAddToday={() => {
                  const now = new Date()
                  setSelectedDate(now)
                  setRightPanelOpen(true)
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right side panel */}
      <RightSidePanel
        isOpen={rightPanelOpen}
        onClose={() => {
          setRightPanelOpen(false)
          setSelectedDate(null)
        }}
        selectedDate={selectedDate}
        dayData={
          selectedDate
            ? (() : PanelDayData | null => {
                const data =
                  calendarData[
                    formatDateKey(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth(),
                      selectedDate.getDate()
                    )
                  ] || null
                if (data && data.events) {
                  return {
                    ...data,
                    events: data.events
                      .filter((e): e is typeof e & { title: string } => typeof e.title === "string")
                      .map(e => ({
                        ...e,
                        title: e.title,
                      })),
                  } as PanelDayData
                }
                return data as PanelDayData
              })()
            : null
        }
        onDataUpdate={fetchCalendarData}
      />
    </div>
    </RequireAuth>
  )
}
