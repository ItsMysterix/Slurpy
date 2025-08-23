"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

export default function BreathingInline({
  onDone,
  onCancel,
  seconds = 60,
}: {
  onDone: () => void
  onCancel: () => void
  seconds?: number
}) {
  const [t, setT] = useState(seconds)
  const [phase, setPhase] = useState<"inhale" | "hold" | "exhale">("inhale")
  const timer = useRef<number | null>(null)

  useEffect(() => {
    // 4-2-6 rhythm
    const cycle = () => {
      setPhase((p) => (p === "inhale" ? "hold" : p === "hold" ? "exhale" : "inhale"))
    }
    const phaseDur = phase === "inhale" ? 4000 : phase === "hold" ? 2000 : 6000
    const id = window.setTimeout(cycle, phaseDur)
    return () => window.clearTimeout(id)
  }, [phase])

  useEffect(() => {
    timer.current = window.setInterval(() => setT((x) => x - 1), 1000) as unknown as number
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [])

  useEffect(() => {
    if (t <= 0) onDone()
  }, [t, onDone])

  return (
    <div className="mx-auto max-w-xl w-full">
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button
          aria-label="Stop"
          onClick={onCancel}
          className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 flex flex-col items-center text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Time left</div>
          <div className="text-3xl font-semibold text-slate-800 dark:text-slate-100">{t}s</div>

          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-4 text-xl text-slate-700 dark:text-slate-200"
            >
              {phase === "inhale" && "Inhale… 4"}
              {phase === "hold" && "Hold… 2"}
              {phase === "exhale" && "Exhale… 6"}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 h-28 w-28 rounded-full border-2 border-slate-300/60 dark:border-slate-600/60 flex items-center justify-center">
            <motion.div
              animate={{ scale: phase === "inhale" ? 1.15 : phase === "exhale" ? 0.85 : 1.0 }}
              transition={{ duration: 0.6 }}
              className="h-16 w-16 rounded-full bg-slate-200/80 dark:bg-slate-700/80"
            />
          </div>

          <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
            breathe low into your belly; long exhales down-shift the nervous system.
          </p>
        </div>
      </div>
    </div>
  )
}
