"use client"

import * as React from "react"

/** Each point represents a day: label for the x-axis, valence in [-1..1] */
export type MoodPoint = { label: string; valence: number }

type Props = {
  data: MoodPoint[]
  height?: number
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** Catmull–Rom → Cubic Bezier for a smooth path */
function catmullRomPath(points: Array<{ x: number; y: number }>, tension = 0.5) {
  if (points.length < 2) return ""
  if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`

  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension

    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

export default function MoodTrendChart({ data, height = 260 }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(640)
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null)

  // responsive width via ResizeObserver
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const PAD_L = 48  // left padding for y-axis & labels
  const PAD_R = 12
  const PAD_T = 16
  const PAD_B = 28

  const innerW = Math.max(1, width - PAD_L - PAD_R)
  const innerH = Math.max(1, height - PAD_T - PAD_B)

  const toY = (v: number) => {
    // map [-1..1] -> [innerH..0] (top positive, bottom negative)
    const norm = (clamp(v, -1, 1) + 1) / 2 // 0..1
    return PAD_T + (1 - norm) * innerH
  }
  const toX = (i: number) => {
    if (data.length <= 1) return PAD_L + innerW / 2
    return PAD_L + (innerW * i) / (data.length - 1)
  }

  const points = (data.length ? data : new Array(7).fill(0).map((_, i) => ({ label: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i], valence: 0 })))
    .map((d, i) => ({ x: toX(i), y: toY(d.valence) }))

  const pathD = catmullRomPath(points, 0.9)

  const y0 = toY(0)
  const y1 = toY(1)
  const yNeg1 = toY(-1)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    // nearest point by x
    let nearest = 0
    let best = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(p.x - x)
      if (d < best) {
        best = d
        nearest = i
      }
    })
    setHover({ i: nearest, x: points[nearest].x, y: points[nearest].y })
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block"
      >
        {/* background grid lines */}
        <line x1={PAD_L} y1={y1} x2={width - PAD_R} y2={y1} className="stroke-slate-400/20" strokeWidth={1} />
        <line x1={PAD_L} y1={y0} x2={width - PAD_R} y2={y0} className="stroke-slate-400/30" strokeWidth={1.25} />
        <line x1={PAD_L} y1={yNeg1} x2={width - PAD_R} y2={yNeg1} className="stroke-slate-400/20" strokeWidth={1} />

        {/* y-axis with labels 1 / 0 / -1 */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={height - PAD_B} className="stroke-slate-400/30" strokeWidth={1} />
        <text x={PAD_L - 10} y={y1 + 4} textAnchor="end" className="fill-slate-400 text-[10px]">1</text>
        <text x={PAD_L - 10} y={y0 + 4} textAnchor="end" className="fill-slate-400 text-[10px]">0</text>
        <text x={PAD_L - 10} y={yNeg1 + 4} textAnchor="end" className="fill-slate-400 text-[10px]">-1</text>

        {/* smooth line */}
        <path d={pathD} fill="none" stroke="currentColor" className="text-white/90 dark:text-white" strokeWidth={2.5} />

        {/* dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} className="fill-white/90" />
        ))}

        {/* x labels */}
        {data.map((d, i) => (
          <text key={i} x={toX(i)} y={height - 8} textAnchor="middle" className="fill-slate-300/80 text-[10px]">
            {d.label}
          </text>
        ))}

        {/* hover crosshair + tooltip */}
        {hover && (
          <>
            <line x1={hover.x} y1={PAD_T} x2={hover.x} y2={height - PAD_B} className="stroke-white/20" strokeWidth={1} />
            <circle cx={hover.x} cy={hover.y} r={4} className="fill-white" />
          </>
        )}
      </svg>

      {/* HTML tooltip for crisp text */}
      {hover && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-3 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 text-xs px-2 py-1 shadow"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="font-medium">{data[hover.i]?.label ?? ""}</div>
          <div className="opacity-80">Valence {Number(data[hover.i]?.valence ?? 0).toFixed(2)}</div>
        </div>
      )}
    </div>
  )
}
