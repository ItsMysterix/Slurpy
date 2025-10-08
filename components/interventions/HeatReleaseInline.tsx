"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

type Step = 0 | 1 | 2

export default function HeatReleaseInline({
  onDone,
  onCancel,
  seconds = 45,
}: {
  onDone: () => void
  onCancel: () => void
  seconds?: number
}) {
  const [t, setT] = useState(seconds)
  const [paused, setPaused] = useState(false)
  const [step, setStep] = useState<Step>(0)
  const timerId = useRef<number | null>(null)

  // 15s per step → 0: breath, 1: clench, 2: value
  const stepBoundaries = useMemo(() => [seconds - 30, seconds - 15, 0], [seconds])

  useEffect(() => {
    if (paused) return
    timerId.current = window.setInterval(() => {
      setT((x) => (x > 0 ? x - 1 : 0))
    }, 1000) as unknown as number
    return () => {
      if (timerId.current) window.clearInterval(timerId.current)
    }
  }, [paused])

  useEffect(() => {
    if (t <= stepBoundaries[0] && step === 0) setStep(1)
    if (t <= stepBoundaries[1] && step === 1) setStep(2)
    if (t <= 0) onDone()
  }, [t, step, stepBoundaries, onDone])

  useEffect(() => {
    // tiny haptic nudge on step change (mobile)
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(step === 0 ? 15 : 25)
    }
  }, [step])

  const title =
    step === 0 ? "Box breath 4–4–4" :
    step === 1 ? "Clench & release" :
    "Name what matters"

  const body =
    step === 0
      ? "Inhale 4 • Hold 4 • Exhale 4 — smooth and even."
      : step === 1
      ? "Squeeze both fists 5s, release fully. Twice."
      : "Anger protects a value. In one word: which value was crossed? (respect, fairness, autonomy…)"

  const progress = (t / seconds) * 100
  const radius = 28
  const circ = 2 * Math.PI * radius
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

        <div className="p-6 text-center">
          <div className="mx-auto mb-2 relative w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r={radius} className="stroke-slate-200/70 dark:stroke-slate-700/70" strokeWidth="6" fill="none" />
              <motion.circle
                cx="32" cy="32" r={radius}
                stroke="url(#grad)"
                strokeWidth="6"
                strokeDasharray={circ}
                strokeDashoffset={circ - dash}
                fill="none"
                initial={false}
                animate={{ strokeDashoffset: circ - dash }}
                transition={{ ease: "linear", duration: 0.2 }}
              />
              <defs>
                <linearGradient id="grad" x1="0" x2="1">
                  <stop offset="0%" stopColor="#16a34a" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 grid place-items-center text-base font-semibold text-slate-800 dark:text-slate-100">
              {t}s
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.h3
              key={`title-${step}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-2 text-lg font-medium text-slate-800 dark:text-slate-100"
            >
              {title}
            </motion.h3>
          </AnimatePresence>

          <p className="mt-2 text-slate-600 dark:text-slate-300">{body}</p>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setPaused((p) => !p)}
              className="rounded-lg px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-sm"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <div aria-hidden className="flex gap-1">
              {[0,1,2].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 w-8 rounded-full ${i <= step ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
