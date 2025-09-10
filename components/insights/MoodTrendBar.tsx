// components/insights/MoodTrendBar.tsx
"use client"

export default function MoodTrendBar({
  label,
  valence, // -1..1
}: { label: string; valence: number }) {
  const v = Math.max(-1, Math.min(1, Number(valence) || 0))
  const heightPct = Math.abs(v) * 100

  const side = v >= 0 ? "up" : "down"
  const barClass =
    side === "up"
      ? "bg-gradient-to-t from-sage-400 to-clay-500 dark:from-sage-600 dark:to-clay-600"
      : "bg-gradient-to-b from-red-400 to-red-500 dark:from-red-600 dark:to-red-700"

  return (
    <div className="flex flex-col items-center flex-1">
      <div className="relative w-full h-40">
        {/* center baseline */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-sage-300/60 dark:bg-gray-700/60" />

        {/* bar */}
        <div
          className={`absolute left-0 right-0 ${barClass} rounded-md`}
          style={{
            height: `${heightPct / 2}%`,
            top: v >= 0 ? `calc(50% - ${heightPct / 2}%)` : "50%",
          }}
          title={`${label}: ${v.toFixed(2)}`}
        />
      </div>
      <div className="text-xs text-clay-500 dark:text-sand-400 mt-2">{label}</div>
      <div className="text-xs text-clay-600 dark:text-sand-300 font-medium">{v.toFixed(2)}</div>
    </div>
  )
}
