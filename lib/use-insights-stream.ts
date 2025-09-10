"use client"

import { useEffect, useRef } from "react"

type TF = "day" | "week" | "month" | "year"
type Options = {
  /** Minimum gap between refetch calls triggered by SSE (ms). Default 5000. */
  throttleMs?: number
  withCredentials?: boolean
}

/**
 * Stable, throttled SSE listener for insights updates.
 * - Reacts ONLY to "update" events (ignores "open"/"ping")
 * - Throttles calls to your onUpdate
 * - Keeps onUpdate stable via ref (not a dep)
 */
export function useInsightsStream(
  timeframe: TF,
  onUpdate: (evt: any) => void,
  opts: Options = {}
) {
  const { throttleMs = 5000, withCredentials = true } = opts

  const cbRef = useRef(onUpdate)
  const lastRunRef = useRef(0)
  cbRef.current = onUpdate

  useEffect(() => {
    const es = new EventSource(`/api/insights/stream?timeframe=${timeframe}`, {
      withCredentials,
    })

    const handleUpdate = (e: MessageEvent) => {
      const now = Date.now()
      if (now - lastRunRef.current < throttleMs) return
      lastRunRef.current = now
      try {
        const data = JSON.parse(e.data)
        cbRef.current?.(data)
      } catch {
        /* ignore bad payloads */
      }
    }

    // Only react to real updates
    es.addEventListener("update", handleUpdate)

    // Keep the connection healthy, but don't trigger UI work
    const noop = () => {}
    es.addEventListener("ping", noop)
    es.addEventListener("open", noop)

    return () => {
      try {
        es.removeEventListener("update", handleUpdate)
        es.removeEventListener("ping", noop)
        es.removeEventListener("open", noop)
        es.close()
      } catch {}
    }
  }, [timeframe, throttleMs, withCredentials])
}
