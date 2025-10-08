"use client"

import { motion } from "framer-motion"
import { X, Play } from "lucide-react"

export function InterventionCard({
  title,
  subtitle,
  onStart,
  onSkip,
  onClose,
  startText = "Start",
}: {
  title: string
  subtitle?: string
  onStart: () => void
  onSkip: () => void
  onClose?: () => void
  startText?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mx-auto max-w-xl w-full mb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intervention-title"
    >
      <div className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 shadow-xl backdrop-blur-md">
        <button
          aria-label="Close"
          onClick={onClose ?? onSkip}
          className="absolute right-3 top-3 p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-5">
          <h3 id="intervention-title" className="text-lg font-medium text-slate-800 dark:text-slate-100">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 shadow"
            >
              <Play className="w-4 h-4" />
              {startText}
            </button>
            <button
              onClick={onSkip}
              className="rounded-lg px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50/60 dark:hover:bg-slate-800/60"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
