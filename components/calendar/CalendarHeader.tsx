"use client"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, TrendingUp } from "lucide-react"
import { monthNames } from "@/lib/calendar-types"

export default function CalendarHeader({
  currentMonth, currentYear, onPrev, onNext, rightPad,
  rightSlot
}: {
  currentMonth: number
  currentYear: number
  onPrev: () => void
  onNext: () => void
  rightPad?: boolean
  rightSlot?: React.ReactNode
}) {
  return (
    <motion.div
      className="flex items-center justify-between"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="flex items-center gap-4">
        <Button onClick={onPrev} variant="outline" size="sm"
          className="rounded-xl border-sage-200/50 dark:border-gray-600/50 hover:bg-sage-100 dark:hover:bg-gray-700 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-3xl font-display text-clay-700 dark:text-sand-200 flex items-center gap-2">
          <CalendarIcon className="w-6 h-6" />
          {monthNames[currentMonth]} {currentYear}
        </h2>
        <Button onClick={onNext} variant="outline" size="sm"
          className="rounded-xl border-sage-200/50 dark:border-gray-600/50 hover:bg-sage-100 dark:hover:bg-gray-700 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className={`flex items-center gap-2 ${rightPad ? "mr-96" : ""}`}>
        <Badge variant="secondary"
          className="bg-sage-100 text-sage-600 dark:bg-gray-800 dark:text-sand-300 border-sage-200 dark:border-gray-600">
          <TrendingUp className="w-3 h-3 mr-1" />
          Track Progress
        </Badge>
        {rightSlot}
      </div>
    </motion.div>
  )
}
