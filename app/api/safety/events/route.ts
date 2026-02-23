export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 10;

import { NextRequest, NextResponse } from "next/server";
import { withOptionalAuth } from "@/lib/api-auth";
import { withCORS } from "@/lib/cors";
import { assertDoubleSubmit, assertSameOrigin } from "@/lib/csrf";
import { createServerServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

type SafetySource = "user_input" | "assistant_output" | "cta_click" | "cta_dismiss";
type SafetyLevel = "elevated" | "immediate";

// NOTE: In-memory circuit breaker removed (non-functional on serverless)
// Failures tracked by Sentry + database logging. Configure Sentry alert on 5+ errors/5min.

// Legacy placeholder: prevents runtime errors if called elsewhere
function checkCircuitBreaker(): boolean {
  return true;
}

// Legacy placeholder: no-op
function recordSuccess(): void {}

// Legacy placeholder: no-op
function recordFailure(): void {}

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export const POST = withCORS(withOptionalAuth(async function POST(req: NextRequest, authContext) {
  const sameOriginError = await assertSameOrigin(req);
  if (sameOriginError) return sameOriginError;
  const csrfError = assertDoubleSubmit(req);
  if (csrfError) return csrfError;

  let body: any = {};
  try {
    const raw = await req.text();
    if (raw && new TextEncoder().encode(raw).byteLength > 16 * 1024) return bad(413, "Payload too large");
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return bad(400, "Bad JSON");
  }

  const source = String(body?.source || "") as SafetySource;
  const level = String(body?.level || "") as SafetyLevel;
  const trigger = typeof body?.trigger === "string" ? body.trigger.slice(0, 120) : null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 128) : null;
  const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? body.metadata
    : {};

  const validSource = source === "user_input" || source === "assistant_output" || source === "cta_click" || source === "cta_dismiss";
  const validLevel = level === "elevated" || level === "immediate";
  if (!validSource || !validLevel) return bad(400, "Invalid safety event");

  const event = {
    user_id: authContext?.userId ?? null,
    session_id: sessionId,
    source,
    level,
    trigger,
    metadata,
  };

  logger.info("safety.event", {
    source,
    level,
    hasUser: !!authContext?.userId,
    hasSession: !!sessionId,
    trigger,
  });

  try {
    const supabase = createServerServiceClient();
    const { error } = await supabase.from("safety_events").insert(event);
    if (error) {
      logger.error("safety.event.persist_failed", {
        component: "safety_events",
        message: error.message,
        code: (error as any)?.code,
        source,
        level,
      });
      // Report to Sentry for alerting on high failure rates
      Sentry.captureException(new Error(`Safety event ingestion failed: ${error.message}`), {
        tags: { component: "safety_events", source, level },
        level: "warning",
        extra: { errorCode: (error as any)?.code },
      });
    } else {
      logger.info("safety.event.persisted", {
        component: "safety_events",
        source,
        level,
      });
    }
  } catch (err: any) {
    logger.error("safety.event.persist_exception", {
      component: "safety_events",
      message: err?.message || String(err),
      source,
      level,
    });
    // Report to Sentry for on-call alerts
    Sentry.captureException(err, {
      tags: { component: "safety_events", source, level },
      level: "warning",
    });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}), { credentials: true });
