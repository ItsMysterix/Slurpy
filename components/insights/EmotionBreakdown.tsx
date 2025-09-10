// components/insights/EmotionBreakdown.tsx
"use client"

import Image from "next/image"
import type { EmotionSlice } from "@/lib/insights-types"
import { iconForEmotion } from "@/lib/insights-types"

export default function EmotionBreakdown({ items }: { items: EmotionSlice[] }) {
  if (!items?.length) {
    return <p className="text-clay-500 dark:text-sand-400 text-sm">No emotion data yet.</p>
  }
  return (
    <div className="space-y-3">
      {items.map((emotion) => {
        const widthPct = Math.max(0, Math.min(100, emotion.percentage))
        const src = iconForEmotion(emotion.emotion)
        return (
          <div key={emotion.emotion} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 relative">
                <Image
                    src={src}
                    alt={emotion.emotion}
                    fill
                    sizes="24px"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/Slurpy.ico" }}
                />
              </div>
              <span className="capitalize text-sm text-clay-700 dark:text-sand-200">{emotion.emotion}</span>
              <span className="text-sm text-clay-600 dark:text-sand-300">{emotion.count} times</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-sage-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sage-400 to-clay-500 dark:from-sage-500 dark:to-clay-600 rounded-full transition-all duration-300"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-xs text-clay-500 dark:text-sand-400 w-8 text-right">{widthPct}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
