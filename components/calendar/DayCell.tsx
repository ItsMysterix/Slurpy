"use client"
import { motion } from "framer-motion"
import { Heart, BookOpen, MessageCircle } from "lucide-react"
import { CalendarData, getDayMoods, getMoodColor, iconForEmotionSafe } from "@/lib/calendar-types"

export default function DayCell({
  y, m0, d, today, dayData, onClick
}: {
  y: number; m0: number; d: number
  today: Date
  dayData?: CalendarData
  onClick: () => void
}) {
  const isToday = d === today.getDate() && m0 === today.getMonth() && y === today.getFullYear()
  const moods = getDayMoods(dayData)
  const journals = dayData?.journals || []
  const chatSessions = dayData?.chatSessions || []

  // choose the most recent mood for the background color
  const lastMood = moods[moods.length - 1]
  const bgClass = lastMood ? getMoodColor(lastMood.intensity) : "border-sage-200/50 dark:border-gray-600/50 bg-white/50 dark:bg-gray-800/50 hover:border-sage-300 dark:hover:border-sand-400"

  // prepare up to 2 fruits
  const fruits = moods.slice(-2).map(m => iconForEmotionSafe(m.emotion))
  const overflow = Math.max(0, moods.length - 2)

  return (
    <motion.div
      key={`day-${y}-${m0}-${d}`}
      className={`h-24 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${isToday ? "border-sage-400 bg-sage-50 dark:border-sand-400 dark:bg-gray-800/70" : bgClass}`}
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      onClick={onClick}
      title={moods.map(m => `${m.emotion} ${m.intensity}/10`).join(", ")}
    >
      <div className="p-2 h-full flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <span className={`text-sm font-medium ${isToday ? "text-clay-700 dark:text-sand-200" : "text-clay-600 dark:text-sand-300"}`}>
            {d}
          </span>

          <div className="flex flex-col gap-1 items-end">
            {/* mood fruit icons */}
            {moods.length > 0 && (
              <div className="flex items-center gap-1">
                {fruits.map((src, i) => (
                  <img key={i} src={src} alt="" className="w-4 h-4 rounded" />
                ))}
                {overflow > 0 && <span className="text-[10px] text-clay-600 dark:text-sand-300">+{overflow}</span>}
              </div>
            )}

            {/* activity dots */}
            <div className="flex flex-col gap-1">
              {moods.length > 0 && (
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
        </div>

        <div className="space-y-1">
          {lastMood && (
            <div className="text-xs text-center capitalize font-medium text-clay-600 dark:text-sand-300">
              {lastMood.emotion}
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
}
