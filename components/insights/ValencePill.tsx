// components/insights/ValencePill.tsx
"use client"

import { Badge } from "@/components/ui/badge"
import { valenceClass, valenceLabel } from "@/lib/insights-types"

export default function ValencePill({ valence }: { valence: number }) {
  const label = valenceLabel(valence)
  const cls = valenceClass(valence)
  const pct = Math.round(((valence + 1) / 2) * 100) // -1..1 -> 0..100%

  return (
    <div className="flex items-center gap-2">
      <Badge className={`border ${cls}`}>{label}</Badge>
      <span className="text-xs text-clay-500 dark:text-sand-400">{pct}%</span>
    </div>
  )
}
