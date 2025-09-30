"use client"
import { Card, CardContent } from "@/components/ui/card"
import { dayNames, formatDateKey } from "@/lib/calendar-types"
import DayCell from "./DayCell"

export default function CalendarGrid({
  year, month0, today, startingDow, daysInMonth, dataByKey, onClickDay
}: {
  year: number
  month0: number
  today: Date
  startingDow: number
  daysInMonth: number
  dataByKey: Record<string, any>
  onClickDay: (day: number) => void
}) {
  const cells: (number | null)[] = []
  for (let i = 0; i < startingDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      <CardContent className="p-6">
        <div className="grid grid-cols-7 gap-2 mb-4">
          {dayNames.map((n) => (
            <div key={n} className="text-center text-sm font-medium text-clay-500 dark:text-sand-400 py-2">{n}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {cells.map((d, i) => {
            if (d === null) return <div key={`pad-${i}`} className="h-24" />
            const key = formatDateKey(year, month0, d)
            return (
              <DayCell
                key={key}
                y={year} m0={month0} d={d}
                today={today}
                dayData={dataByKey[key]}
                onClick={() => onClickDay(d)}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
