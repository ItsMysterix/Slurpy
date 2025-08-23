"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"

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
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x - 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    // step schedule: 0-> box breath (15s), 1-> clench/release (15s), 2-> name the value (15s)
    if (t <= 30 && step === 0) setStep(1)
    if (t <= 15 && step === 1) setStep(2)
    if (t <= 0) onDone()
  }, [t, step, onDone])

  const title = step === 0 ? "Box breath 4-4-4" : step === 1 ? "Clench & release" : "Name what matters"

  const body =
    step === 0
      ? "Inhale 4 • Hold 4 • Exhale 4 — keep it smooth."
      : step === 1
      ? "Squeeze both fists hard for 5s, release fully. Do it twice."
      : "Anger protects a value. In one word: what value is being stepped on? (respect, fairness, autonomy…)"

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
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Time left</div>
          <div className="text-3xl font-semibold text-slate-800 dark:text-slate-100">{t}s</div>
          <h3 className="mt-4 text-lg font-medium text-slate-800 dark:text-slate-100">{title}</h3>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{body}</p>
        </div>
      </div>
    </div>
  )
}
