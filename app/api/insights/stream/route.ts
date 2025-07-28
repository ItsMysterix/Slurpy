import { NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { sseBus, InsightsUpdate } from "@/lib/sse-bus"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toSSE(data: string) {
  return new TextEncoder().encode(data.endsWith("\n\n") ? data : data + "\n\n")
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()          
  if (!userId) return new Response("Unauthorized", { status: 401 })

  const { searchParams } = new URL(req.url)
  const timeframe = (searchParams.get("timeframe") || "week") as
    | "day" | "week" | "month" | "year"

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(toSSE(chunk))

      // open + heartbeat
      send(`event: open\ndata: {"timeframe":"${timeframe}"}\n`)
      const ping = setInterval(() => {
        send(`event: ping\ndata: {"ts":${Date.now()}}\n`)
      }, 15000)

      const onUpdate = (payload: InsightsUpdate) => {
        if (payload.userId !== userId) return
        send(`event: update\ndata: ${JSON.stringify({ ...payload, ts: Date.now() })}\n`)
      }
      sseBus.on("insights:update", onUpdate)

      const cleanup = () => {
        clearInterval(ping)
        sseBus.off("insights:update", onUpdate)
        try { controller.close() } catch {}
      }
      req.signal?.addEventListener("abort", cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
