// app/api/insights/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sseBus, InsightsUpdate } from "@/lib/sse-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const MIN_PUSH_MS = 2000; // simple per-connection cooldown

function toSSE(event: string, data: unknown) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return encoder.encode(`event: ${event}\ndata: ${payload}\n\n`);
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const timeframe = (searchParams.get("timeframe") || "week") as
    | "day" | "week" | "month" | "year";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastPush = 0;

      // Open + heartbeat
      controller.enqueue(toSSE("open", { timeframe }));
      const ping = setInterval(() => {
        controller.enqueue(toSSE("ping", { ts: Date.now() }));
      }, 20_000);

      const onUpdate = (payload: InsightsUpdate) => {
        // user filter
        if (payload.userId !== userId) return;
        // timeframe filter if present on payload
        if (payload.timeframe && payload.timeframe !== timeframe) return;

        const now = Date.now();
        if (now - lastPush < MIN_PUSH_MS) return;
        lastPush = now;

        controller.enqueue(toSSE("update", { ...payload, ts: now }));
      };

      sseBus.on("insights:update", onUpdate);

      const cleanup = () => {
        try { sseBus.off("insights:update", onUpdate); } catch {}
        try { clearInterval(ping); } catch {}
        try { controller.close(); } catch {}
      };

      // Close when the client disconnects
      req.signal?.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      // If you need cross-origin SSE, uncomment and set your domain:
      // "Access-Control-Allow-Origin": "https://slurpy.life",
    },
  });
}
