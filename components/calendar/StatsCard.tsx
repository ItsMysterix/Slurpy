"use client"
import { Card, CardContent } from "@/components/ui/card"
import type { CalendarStats } from "@/lib/calendar-types"

export default function StatsCard({ stats }: { stats: CalendarStats }) {
  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      <CardContent className="p-6">
        <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">This Month</h3>
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
                {stats.bestDay.fruit ?? ""}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
