// app/api/insights/stream/route.ts
import { NextRequest } from "next/server";
import { getAuthOrThrow } from "@/lib/auth-server";
import { guardRate } from "@/lib/guards";
import { createLimiter } from "@/lib/rate-limit";
import { sseBus, InsightsUpdate } from "@/lib/sse-bus";
import { z } from "@/lib/validate";
import { withCORS } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const MIN_PUSH_MS = 2000; // simple per-connection cooldown

function toSSE(event: string, data: unknown) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return encoder.encode(`event: ${event}\ndata: ${payload}\n\n`);
}

export const GET = withCORS(async function GET(req: NextRequest) {
  const { userId } = await getAuthOrThrow();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // Connection starts limited to 20/min/user
  {
    const limited = await guardRate(req, { key: "insights-stream", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
  }

  const { searchParams } = new URL(req.url);
  // New input: window = 7d|14d|30d (optional). Support legacy timeframe param for now.
  const Input = z
    .object({
      window: z.enum(["7d", "14d", "30d"]).optional(),
      timeframe: z.enum(["day", "week", "month", "year"]).optional(),
    })
    .strip();
  const parsed = Input.safeParse(Object.fromEntries(searchParams.entries()));
  const windowSel = parsed.success ? parsed.data.window : undefined;
  const timeframe = (parsed.success && parsed.data.timeframe) || (searchParams.get("timeframe") as any) || "week";

  // Mid-stream per-event limiter; allow test override for low limit via header x-e2e-stream-limit
  const hdrLimit = Number(req.headers.get("x-e2e-stream-limit") || "");
  const eventLimit = !Number.isNaN(hdrLimit) && hdrLimit > 0 && process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true" ? hdrLimit : 100000;
  const eventLimiter = createLimiter({ keyPrefix: "rl:insights-stream:emit", windowMs: 60_000, limit: eventLimit });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastPush = 0;

      // Open + heartbeat
      controller.enqueue(toSSE("open", { timeframe }));
      const ping = setInterval(() => {
        controller.enqueue(toSSE("ping", { ts: Date.now() }));
      }, 20_000);

      const onUpdate = async (payload: InsightsUpdate) => {
        // user filter
        if (payload.userId !== userId) return;
        // timeframe filter if present on payload
        if (payload.timeframe && payload.timeframe !== timeframe) return;

        const now = Date.now();
        if (now - lastPush < MIN_PUSH_MS) return;
        lastPush = now;

        // Only send non-PII fields downstream
        const clean: any = {
          timeframe: payload.timeframe ?? timeframe,
          window: windowSel,
          reason: payload.reason,
          ts: now,
        };
        // Optionally include compact emotion context if upstream producers provide it or flags enable
        const flagsOn = process.env.EMOTION_V2 === "true" && process.env.CEL_V2_CAUSAL === "true";
        const maybeContext = (payload as any).emotionContext;
        if (flagsOn && maybeContext && typeof maybeContext === "object") {
          const top = Array.isArray(maybeContext.top) ? maybeContext.top.slice(0, 3) : [];
          const va = Array.isArray(maybeContext.va) && maybeContext.va.length >= 2 ? [Number(maybeContext.va[0]), Number(maybeContext.va[1])] : undefined;
          const roll = Array.isArray(maybeContext.rollVA) && maybeContext.rollVA.length >= 2 ? [Number(maybeContext.rollVA[0]), Number(maybeContext.rollVA[1])] : undefined;
          clean.emotionContext = {
            top,
            va,
            cause: typeof maybeContext.cause === "string" ? maybeContext.cause : undefined,
            target: typeof maybeContext.target === "string" ? maybeContext.target : undefined,
            rollVA: roll,
          };
        }
        // Personalization: include baseline muVA and dev if flags on and present
        const pOn = process.env.EMOTION_PERSONALIZE === "true";
        const maybePers = (payload as any).personalization;
        if (pOn && maybePers && typeof maybePers === "object") {
          const muV = Number(maybePers.muV);
          const muA = Number(maybePers.muA);
          const dev = Number(maybePers.dev);
          if (!Number.isNaN(muV) && !Number.isNaN(muA) && !Number.isNaN(dev)) {
            (clean as any).personalization = { muVA: [muV, muA], dev };
          }
        }
        // Mid-stream rate limit: if tripped, send error and close
        const res = await eventLimiter.check({ id: userId });
        if (!res.ok) {
          controller.enqueue(toSSE("error", { reason: "rate_limited" }));
          try { controller.close(); } catch {}
          return;
        }
        // Backpressure: if desiredSize <= 0, yield to next microtask
        controller.enqueue(toSSE("update", clean));
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
}, { credentials: true });
