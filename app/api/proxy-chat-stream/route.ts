// app/api/proxy-chat-stream/route.ts
// app/api/proxy-chat-stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
// Map UI mode ids to backend-accepted ids
const UI_TO_BACKEND_MODE: Record<string, string> = {
  self_compassion: "friend",
  // add any new UI modes here
};

function normalizeChatBody(raw: any) {
  const text =
    typeof raw?.text === "string" ? raw.text :
    typeof raw?.message === "string" ? raw.message :
    typeof raw?.content === "string" ? raw.content : "";

  let mode = typeof raw?.mode === "string" ? raw.mode : undefined;
  if (mode && UI_TO_BACKEND_MODE[mode]) mode = UI_TO_BACKEND_MODE[mode];
  // if still not in the allowed set, drop it
  const allowed = new Set(["friend","therapist","coach","parent","boss"]);
  if (mode && !allowed.has(mode)) mode = undefined;

  return {
    text,
    mode,
    context: raw?.context,
    session_id: raw?.session_id,
    sessionId: raw?.sessionId,
  };
}
import { cookies, headers } from "next/headers";
import { getAuthOrThrow, getOptionalAuth, UnauthorizedError } from "@/lib/auth-server";
import { logger } from "@/lib/logger";
import { z, ensureJsonUnder, boundedString, httpError } from "@/lib/validate";
import { guardRate } from "@/lib/guards";
import { createLimiter } from "@/lib/rate-limit";
import { withCORS } from "@/lib/cors";
import { assertSameOrigin, assertDoubleSubmit } from "@/lib/csrf";
import { deriveRoles } from "@/lib/authz";
import { AppError, toErrorResponse } from "@/lib/errors";
import { safeFetch } from "@/lib/safe-fetch";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export const POST = withCORS(async function POST(req: NextRequest) {
  try {
  // Resolve auth, but honor local E2E bypass to enable unauthenticated testing
  let userId: string;
  let bearer: string | undefined;
  try {
    const auth = await getOptionalAuth();
    if (auth?.userId) {
      userId = auth.userId;
      bearer = auth.bearer;
    } else if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      // Synthesize a local test identity for end-to-end testing without real auth
      userId = "e2e-local";
      bearer = "e2e-token";
    } else {
      // Not in bypass mode and no auth — enforce 401
      throw new UnauthorizedError();
    }
  } catch (e) {
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      userId = "e2e-local";
      bearer = "e2e-token";
    } else {
      throw e;
    }
  }
  await deriveRoles(userId); // resolves roles if needed later; not used here
    // Per-start limiter: 20/min/user
    {
      const limited = await guardRate(req, { key: "proxy-chat-stream", limit: 20, windowMs: 60_000 });
      if (limited) return limited;
    }
    // CSRF: enforce in normal mode; skip in local E2E bypass to simplify curl-based testing
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH !== "true") {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }

    // Read-once JSON with size cap
    const lenHdr = req.headers.get("content-length");
    if (lenHdr && Number(lenHdr) > 64 * 1024) return bad(413, "Payload too large");
    let body: unknown = {};
    try {
      const txt = await req.text();
      if (txt && new TextEncoder().encode(txt).byteLength > 64 * 1024) return bad(413, "Payload too large");
      body = txt ? JSON.parse(txt) : {};
    } catch {
      return bad(400, "Bad JSON");
    }


    const ChatIn = z
      .object({
        text: boundedString(4000),
        mode: z.enum([
          "friend",
          "therapist",
          "coach",
          "parent",
          "partner",
          "boss",
          "inner_critic",
          "self_compassion"
        ]).optional(),
        context: z.object({ messageId: boundedString(64).optional(), convoId: boundedString(64).optional() }).optional(),
        session_id: boundedString(128).optional(),
        sessionId: boundedString(128).optional(),
      })
      .strip();
    const candidate = normalizeChatBody(body);
    const parsed = ChatIn.safeParse(candidate);
    if (!parsed.success) {
      // Better DX in dev: return Zod error details
      if (process.env.NODE_ENV !== "production") {
        return new NextResponse(JSON.stringify({ error: "Invalid request", details: parsed.error.format() }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      return httpError(400, "Invalid request");
    }

    const text = parsed.data.text;
    const session_id = parsed.data.session_id || parsed.data.sessionId;
    const mode = parsed.data.mode;

    // Resolve an auth session token (prefer centralized bearer from auth helper)
    let authJwt = bearer || "";
    if (!authJwt) {
      const hdrs = await headers();
      const authzHeader = hdrs.get("authorization") || hdrs.get("Authorization");
      if (authzHeader?.startsWith("Bearer ")) authJwt = authzHeader.slice(7).trim();
    }
    if (!authJwt) {
      const cookieStore = await cookies();
      authJwt = cookieStore.get("__session")?.value ?? "";
    }

    // Propagate client abort to upstream
  const controller = new AbortController();
  req.signal?.addEventListener("abort", () => controller.abort());

    // Build body for backend - transform client payload to backend schema
    // Backend expects ONLY: { user_id: string, message: string }
    // Do NOT send extra fields - Pydantic will reject them
    const upstreamPayload: Record<string, unknown> = { 
      user_id: userId,
      message: text 
    };
    // Note: session_id and mode are stored in client but not sent to MCP server

    // Allow synthetic stream in E2E mode to test burst caps
    let upstream: Response | undefined;
    const hdrsForUpstream: HeadersInit = {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
      Authorization: `Bearer ${authJwt}`,
    };
    (hdrsForUpstream as any)["X-Tenant-Id"] = userId;
    const hdrs = await headers();
    if (
      process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true" &&
      (hdrs.get("x-e2e-stream") === "big" || (body as any)?.e2e === "big" || text === "__e2e__")
    ) {
      const encoder = new TextEncoder();
      const total = 6000; // will be capped to 5000 on our transform
      let cancelled = false;
      const rs = new ReadableStream<Uint8Array>({
        start(ctrl) {
          let i = 0;
          const push = () => {
            if (cancelled) return;
            if (i >= total) {
              try { ctrl.close(); } catch {}
              return;
            }
            const payload = JSON.stringify({ seq: i, delta: "x" }) + "\n";
            try { ctrl.enqueue(encoder.encode(payload)); } catch { return; }
            i++;
            queueMicrotask(push);
          };
          push();
        },
        cancel() {
          // stop pushing
          cancelled = true;
        }
      });
      upstream = new Response(rs, { headers: { "Content-Type": "application/x-ndjson" } });
    } else {
      const allowedHost = (() => { try { return new URL(BACKEND_URL).hostname; } catch { return undefined; }})();
  // MCP streaming endpoint (integrated into main backend at /mcp/stream)
  upstream = await safeFetch(`${BACKEND_URL}/mcp/stream`, {
        method: "POST",
        headers: hdrsForUpstream,
        body: JSON.stringify(upstreamPayload),
        signal: controller.signal,
        cache: "no-store",
        timeoutMs: 30_000,
        allowedHosts: allowedHost ? [allowedHost] : undefined,
      });
    }

    if (!upstream.ok || !upstream.body) {
      let errText = "";
      try {
        errText = await upstream.text();
      } catch {}
      return new NextResponse(JSON.stringify({ error: errText || "Upstream error" }), {
        status: upstream.status || 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // Optionally compute a compact kickoff causal bundle (flag-gated)
    const hdrsNow = await headers();
    const flagsOnCEL = (process.env.EMOTION_V2 === "true" && process.env.CEL_V2_CAUSAL === "true") ||
      (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true" && hdrsNow.get("x-e2e-cel") === "true");
    const flagsOnPersonal = (process.env.EMOTION_PERSONALIZE === "true") ||
      (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true" && hdrsNow.get("x-e2e-personalize") === "true");
  // E2E ONLY — ignored when bypass is off.
  // E2E-only overrides for AB and dev
  const e2eBypass = process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true";
  const abOverride = e2eBypass ? (hdrsNow.get("x-e2e-ab") === "1") : undefined;
  const devOverrideRaw = e2eBypass ? Number(hdrsNow.get("x-e2e-dev") || "") : NaN;
  const devOverride = e2eBypass && !Number.isNaN(devOverrideRaw) ? Math.max(0, Math.min(4, devOverrideRaw)) : undefined;

    // Transform NDJSON with burst caps and allowed keys only
    const encoder = new TextEncoder();
    // Mid-stream event limiter: default high, but supports test override via header x-e2e-stream-limit
    const hdrsForReq = await headers();
    let perMinuteEvents = 100000; // effectively off by default
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      const override = Number(hdrsForReq.get("x-e2e-stream-limit") || "");
      if (!Number.isNaN(override) && override > 0) perMinuteEvents = override;
    }
    const eventLimiter = createLimiter({ keyPrefix: "rl:proxy-chat-stream:emit", windowMs: 60_000, limit: perMinuteEvents });

    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        const reader = upstream!.body!.getReader();
        let total = 0;
        const MAX_PER_TICK = 100;
        const MAX_TOTAL = 5000;
        let buffer = "";
        let scheduled = false;
        let ended = false;

        const safeEnqueue = (chunk: Uint8Array) => {
          if (ended) return;
          try { ctrl.enqueue(chunk); } catch { /* ignore after close */ }
        };

        const scheduleFlush = () => {
          if (scheduled) return;
          scheduled = true;
          queueMicrotask(() => {
            scheduled = false;
            let countThisTick = 0;
            while (countThisTick < MAX_PER_TICK && total < MAX_TOTAL) {
              const idx = buffer.indexOf("\n");
              if (idx === -1) break;
              const line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              if (!line.trim()) continue;
              try {
                const obj = JSON.parse(line);
                // Mid-stream rate limit: if tripped, emit error and close
                // Use user as id
                // Note: This increments per event
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                eventLimiter.check({ id: userId }).then((res) => {
                  if (!res.ok) {
                    safeEnqueue(encoder.encode(JSON.stringify({ type: "error", reason: "rate_limited" }) + "\n"));
                    try { reader.cancel(); } catch {}
                    try { ctrl.close(); } catch {}
                    ended = true;
                    return;
                  }
                });
                const out = { type: "delta", delta: String(obj.delta ?? obj.text ?? obj.token ?? ""), id: obj.seq };
                safeEnqueue(encoder.encode(JSON.stringify(out) + "\n"));
                total++;
                countThisTick++;
                if (total >= MAX_TOTAL) break;
              } catch {
                // skip malformed
              }
            }
          });
        };

        (async () => {
          try {
            // Emit kickoff bundle if enabled (best-effort; does not block stream)
            if (flagsOnCEL || flagsOnPersonal) {
              try {
                const allowedHost = (() => { try { return new URL(BACKEND_URL).hostname; } catch { return undefined; }})();
                const celRes = await safeFetch(`${BACKEND_URL}/cel/reason`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: hdrsForUpstream["Authorization"] as string, "X-Tenant-Id": userId },
                  body: JSON.stringify({ text }),
                  cache: "no-store",
                  timeoutMs: 5000,
                  allowedHosts: allowedHost ? [allowedHost] : undefined,
                });
                if (celRes.ok) {
                  const bundle = await celRes.json();
                  const compact = {
                    type: "start",
                    emotions: undefined as any,
                    valence: undefined as any,
                    arousal: undefined as any,
                    target: undefined as any,
                    cause: undefined as any,
                    masking: undefined as any,
                    tone: undefined as any,
                    budgetMultiplier: undefined as any,
                    dev: undefined as any,
                  };
                  // Fetch v2 emotions via NLP analyze to include top3 + VA
                  try {
                    const aRes = await safeFetch(`${BACKEND_URL}/api/nlp/analyze`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text }),
                      cache: "no-store",
                      timeoutMs: 5000,
                      allowedHosts: allowedHost ? [allowedHost] : undefined,
                    });
                    if (aRes.ok) {
                      const analysis = await aRes.json();
                      const top = (analysis?.emotions?.labels || []).slice(0, 3);
                      compact.emotions = top;
                      if (typeof analysis?.valence === "number") compact.valence = analysis.valence;
                      if (typeof analysis?.arousal === "number") compact.arousal = analysis.arousal;
                    }
                  } catch {}
                  // Merge causal
                  if (bundle && typeof bundle === "object") {
                    compact.cause = bundle?.causes?.[0]?.reason ?? undefined;
                    compact.masking = !!bundle?.masking?.masking;
                    const t = bundle?.targets;
                    compact.target = (t?.other || t?.topic || (t?.self ? "self" : null));
                    const adapt = bundle?.adaptation;
                    const pers = bundle?.personalization;
                    if (flagsOnPersonal && adapt) {
                      if (typeof adapt.tone === "string") compact.tone = adapt.tone;
                      if (typeof adapt.budgetMultiplier === "number") compact.budgetMultiplier = adapt.budgetMultiplier;
                    }
                    if (flagsOnPersonal && pers) {
                      if (typeof pers.dev === "number") compact.dev = pers.dev;
                    }
                    // E2E-only override path: recompute tone/mult using devOverride and abOverride
                    if (e2eBypass && flagsOnPersonal && (typeof devOverride === "number" || typeof abOverride === "boolean")) {
                      const masking = !!compact.masking;
                      const ab = typeof abOverride === "boolean" ? abOverride : (process.env.EMOTION_PERSONALIZE_AB === "true");
                      let dev = typeof devOverride === "number" ? devOverride : (typeof compact.dev === "number" ? compact.dev : 0);
                      // clamp dev to [0,4]
                      dev = Math.max(0, Math.min(4, dev));
                      let tone = "normal" as "normal" | "calming" | "direct";
                      let mult = 1.0;
                      if (masking) {
                        tone = "direct"; mult = 0.8;
                      } else {
                        let t1 = 1.0, t2 = 2.0;
                        if (ab) { t1 -= 0.2; t2 -= 0.2; }
                        if (dev >= t2) { tone = "calming"; mult = 1.1; }
                        else if (dev >= t1) { tone = "calming"; mult = 1.05; }
                        else if (dev <= Math.max(0, t1 - 0.5)) { tone = "normal"; mult = 0.95; }
                        else { tone = "normal"; /* mult remains at 1.0; leave as-is */ }
                      }
                      // Double-clamp after overrides
                      const allowedTones = new Set(["normal","calming","direct"]);
                      compact.tone = allowedTones.has(tone) ? tone : "normal";
                      compact.budgetMultiplier = Math.max(0.6, Math.min(1.1, Number.isFinite(mult) ? mult : 1.0));
                      compact.dev = Math.max(0, Math.min(4, dev));
                    }
                  }
                  // Numeric-only telemetry sample (no PII) — once per kickoff
                  try {
                    if (flagsOnPersonal) {
                      const toneMap: Record<string, number> = { normal: 0, calming: 1, direct: 2 };
                      const toneCode = toneMap[String(compact.tone || "normal")] ?? 0;
                      const ab = process.env.EMOTION_PERSONALIZE_AB === "true" ? 1 : 0;
                      const telemetryRaw = {
                        dev: typeof compact.dev === "number" ? compact.dev : undefined,
                        v: typeof compact.valence === "number" ? compact.valence : undefined,
                        a: typeof compact.arousal === "number" ? compact.arousal : undefined,
                        rollV: typeof (bundle?.rollValence) === "number" ? bundle.rollValence : undefined,
                        rollA: typeof (bundle?.rollArousal) === "number" ? bundle.rollArousal : undefined,
                        tone: toneCode,
                        mult: typeof compact.budgetMultiplier === "number" ? compact.budgetMultiplier : undefined,
                        masking: compact.masking ? 1 : 0,
                        hasCause: compact.cause ? 1 : 0,
                        ab,
                      } as Record<string, unknown>;
                      // Ensure numeric-only telemetry: drop any non-number values
                      const telemetry: Record<string, number> = {};
                      for (const [k, v] of Object.entries(telemetryRaw)) {
                        if (typeof v === "number" && Number.isFinite(v)) telemetry[k] = v;
                      }
                      logger.info("telemetry.personalize", telemetry);
                    }
                  } catch {}
                  safeEnqueue(encoder.encode(JSON.stringify(compact) + "\n"));
                }
              } catch {}
            }
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                buffer += new TextDecoder().decode(value);
                scheduleFlush();
              }
            }
          } catch (e) {
            // ignore
          } finally {
            // Drain remaining lines under caps
            let countThisTick = 0;
            while (countThisTick < MAX_PER_TICK && total < MAX_TOTAL) {
              const idx = buffer.indexOf("\n");
              if (idx === -1) break;
              const line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              if (!line.trim()) continue;
              try {
                const obj = JSON.parse(line);
                const out = { type: "delta", delta: String(obj.delta ?? obj.text ?? obj.token ?? ""), id: obj.seq };
                ctrl.enqueue(encoder.encode(JSON.stringify(out) + "\n"));
                total++;
                countThisTick++;
                if (total >= MAX_TOTAL) break;
              } catch {}
            }
            // Signal completion
            if (!ended) {
              safeEnqueue(encoder.encode(JSON.stringify({ type: "done", done: true }) + "\n"));
              try { ctrl.close(); } catch {}
              ended = true;
            }
          }
        })();
      },
      cancel() {
        try {
          upstream!.body?.cancel();
        } catch {}
        controller.abort();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err; // propagate size guard httpError
    if (err instanceof UnauthorizedError) return toErrorResponse(new AppError("unauthorized", "Unauthorized", 401));
    // Log full error object and stack for debugging (temporary)
    try {
      const dump = (() => {
        try {
          return JSON.stringify(err, Object.getOwnPropertyNames(err));
        } catch (_) {
          try { return String(err); } catch (_) { return "<unserializable error>"; }
        }
      })();
      logger.error("proxy-chat-stream error:", { dump, stack: err?.stack });
      try { console.error("proxy-chat-stream error dump:", dump, "stack:", err?.stack); } catch (_) {}
    } catch (_) {
      try { console.error("proxy-chat-stream error (failed to stringify)", err); } catch (_) {}
    }
    return toErrorResponse(err);
  }
}, { credentials: true });
