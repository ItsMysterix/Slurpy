import { EventEmitter } from "events"

export type InsightsUpdate = {
  userId: string
  reason?: string
  timeframe?: "day" | "week" | "month" | "year"
}

// Keep a single EventEmitter instance across hot reloads / route invocations.
declare global {
  // eslint-disable-next-line no-var
  var __SLURPY_SSE_BUS__: EventEmitter | undefined
}

export const sseBus: EventEmitter =
  global.__SLURPY_SSE_BUS__ ?? new EventEmitter()

// Unlimited listeners to avoid warnings with many clients
sseBus.setMaxListeners(0)

if (!global.__SLURPY_SSE_BUS__) {
  global.__SLURPY_SSE_BUS__ = sseBus
}

// Helper to emit from other server routes (e.g., /api/insights POST)
export function notifyInsightsUpdate(payload: InsightsUpdate) {
  sseBus.emit("insights:update", payload)
}
