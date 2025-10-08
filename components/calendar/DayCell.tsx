"use client";
import { motion } from "framer-motion";
import { Heart, BookOpen, MessageCircle, CalendarDays } from "lucide-react";
import {
  CalendarData,
  getDayMoods,
  getMoodColor,
  iconForEmotionSafe,
} from "@/lib/calendar-types";

export default function DayCell({
  y,
  m0,
  d,
  today,
  dayData,
  onClick,
}: {
  y: number;
  m0: number;
  d: number;
  today: Date;
  dayData?: CalendarData;
  onClick: () => void;
}) {
  const isToday =
    d === today.getDate() &&
    m0 === today.getMonth() &&
    y === today.getFullYear();

  const moods = getDayMoods(dayData);
  const journals = dayData?.journals || [];
  const chatSessions = dayData?.chatSessions || [];
  const events = dayData?.events || []; // if absent, stays at 0

  // background derived from most recent mood
  const lastMood = moods[moods.length - 1];
  const bgClass = lastMood
    ? getMoodColor(lastMood.intensity)
    : "border-sage-200/50 dark:border-gray-600/50 bg-white/50 dark:bg-gray-800/50 hover:border-sage-300 dark:hover:border-sand-400";

  // mood fruit at top; count = total mood entries that day
  const fruitIcon = lastMood ? iconForEmotionSafe(lastMood.emotion) : null;
  const moodCount = moods.length;
  const journalCount = journals.length;
  const chatCount = chatSessions.length;
  const eventCount = events.length;

  return (
    <motion.div
      key={`day-${y}-${m0}-${d}`}
      className={`relative h-24 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${
        isToday
          ? "border-sage-400 bg-sage-50 dark:border-sand-400 dark:bg-gray-800/70"
          : bgClass
      }`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      title={
        moods.length
          ? moods.map((m) => `${m.emotion} ${m.intensity}/10`).join(", ")
          : "No mood logged"
      }
    >
      {/* content area */}
      <div className="p-2 h-full flex flex-col">
        {/* date badge */}
        <div className="flex items-start justify-between">
          <span
            className={`text-sm font-medium ${
              isToday
                ? "text-clay-700 dark:text-sand-200"
                : "text-clay-600 dark:text-sand-300"
            }`}
          >
            {d}
          </span>
        </div>

        {/* label of last mood centered near bottom */}
        <div className="mt-auto pr-8"> {/* leave room for right rail */}
          {lastMood && (
            <div className="text-xs text-center capitalize font-medium text-clay-600 dark:text-sand-300">
              {lastMood.emotion}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT RAIL — fixed inside the cell so it never overflows */}
      <div className="absolute right-1.5 top-1.5 bottom-1.5 flex flex-col items-end justify-start gap-1 pointer-events-none">
        {/* Mood fruit + count */}
        <RailPill
          icon={
            fruitIcon ? (
              // image fruit
              <img
                src={fruitIcon}
                alt=""
                className="w-4 h-4 rounded"
                aria-hidden
              />
            ) : (
              // fallback heart if no mood
              <Heart className="w-4 h-4" />
            )
          }
          count={moodCount}
          gradient="from-sage-400 to-clay-500"
        />
        {/* Journal */}
        <RailPill
          icon={<BookOpen className="w-4 h-4" />}
          count={journalCount}
          gradient="from-clay-400 to-sand-500"
        />
        {/* Chat */}
        <RailPill
          icon={<MessageCircle className="w-4 h-4" />}
          count={chatCount}
          gradient="from-sand-400 to-sage-500"
        />
        {/* Events / UFM */}
        <RailPill
          icon={<CalendarDays className="w-4 h-4" />}
          count={eventCount}
          gradient="from-indigo-400 to-purple-500"
        />
      </div>
    </motion.div>
  );
}

/**
 * Small rounded pill with an icon and a count badge.
 * Fully self-contained so it never leaks outside the cell.
 */
function RailPill({
  icon,
  count,
  gradient,
}: {
  icon: React.ReactNode;
  count: number;
  gradient: string; // tailwind gradient suffix, e.g. 'from-sage-400 to-clay-500'
}) {
  // Hide the pill entirely when count is 0
  if (!count) return null;

  return (
    <div className="relative pointer-events-none">
      <div
        className={`w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}
        aria-hidden
      >
        <div className="text-white">{icon}</div>
      </div>
      {/* Count badge (sticks to the icon) */}
      <div className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-black/80 text-white text-[10px] leading-4 text-center">
        {count}
      </div>
    </div>
  );
}
