"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

type Phase = "inhale" | "hold" | "exhale" | "hold2"

export default function BreathingInline({
  onDone,
  onCancel,
  seconds = 60,
  pattern = [4, 2, 6], // [inhale, hold, exhale] (seconds) — pass [4,4,4,4] for box
}: {
  onDone: () => void
  onCancel: () => void
  seconds?: number
  pattern?: number[] // length 3 or 4
}) {
  const [t, setT] = useState(seconds)
  const [paused, setPaused] = useState(false)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>("inhale")
  const cycleTimer = useRef<number | null>(null)
  const secondTimer = useRef<number | null>(null)

  const phases: Phase[] = useMemo(() => {
    return pattern.length === 4 ? ["inhale","hold","exhale","hold2"] : ["inhale","hold","exhale"]
  }, [pattern])

  const msDurations = useMemo(() => pattern.map((s) => s * 1000), [pattern])

  // second countdown
  useEffect(() => {
    if (paused) return
    secondTimer.current = window.setInterval(() => {
      setT((x) => (x > 0 ? x - 1 : 0))
    }, 1000) as unknown as number
    return () => {
      if (secondTimer.current) window.clearInterval(secondTimer.current)
    }
  }, [paused])

  // phase scheduler
  useEffect(() => {
    if (paused) return
    const dur = msDurations[phaseIdx % msDurations.length] ?? 4000
    cycleTimer.current = window.setTimeout(() => {
      const nextIdx = (phaseIdx + 1) % phases.length
      setPhaseIdx(nextIdx)
      setPhase(phases[nextIdx])
      // haptic tap between phases
      if (typeof window !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12)
    }, dur) as unknown as number

    return () => {
      if (cycleTimer.current) window.clearTimeout(cycleTimer.current)
    }
  }, [phaseIdx, phases, msDurations, paused])

  useEffect(() => {
    if (t <= 0) onDone()
  }, [t, onDone])

  // display text
  const label =
    phase === "inhale" ? `Inhale… ${pattern[0]}` :
    phase === "hold"   ? `Hold… ${pattern[1]}` :
    phase === "exhale" ? `Exhale… ${pattern[2]}` :
    `Hold… ${pattern[3]}`

  // circle breathing animation scale
  const targetScale = phase === "inhale" ? 1.18 : phase === "exhale" ? 0.84 : 1.0

  const radius = 28
  const circ = 2 * Math.PI * radius
  const progress = (t / seconds) * 100
  const dash = (progress / 100) * circ

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
          <div className="sr-only" aria-live="assertive">{label}</div>

          {/* Progress ring */}
          <div className="mx-auto mb-2 relative w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r={radius} className="stroke-slate-200/70 dark:stroke-slate-700/70" strokeWidth="6" fill="none" />
              <motion.circle
                cx="32" cy="32" r={radius}
                stroke="url(#grad2)"
                strokeWidth="6"
                strokeDasharray={circ}
                strokeDashoffset={circ - dash}
                fill="none"
                initial={false}
                animate={{ strokeDashoffset: circ - dash }}
                transition={{ ease: "linear", duration: 0.2 }}
              />
              <defs>
                <linearGradient id="grad2" x1="0" x2="1">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 grid place-items-center text-base font-semibold text-slate-800 dark:text-slate-100">
              {t}s
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-2 text-xl text-slate-700 dark:text-slate-200"
            >
              {label}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 h-28 w-28 rounded-full border-2 border-slate-300/60 dark:border-slate-600/60 grid place-items-center">
            <motion.div
              animate={{ scale: targetScale }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
              className="h-16 w-16 rounded-full bg-slate-200/80 dark:bg-slate-700/80"
            />
          </div>

          <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
            long, gentle exhales nudge your nervous system into “rest & digest.”
          </p>

          <div className="mt-4">
            <button
              onClick={() => setPaused((p) => !p)}
              className="rounded-lg px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-sm"
            >
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
