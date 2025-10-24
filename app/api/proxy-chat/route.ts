// app/api/proxy-chat/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { withCORS } from "@/lib/cors";
import { assertSameOrigin, assertDoubleSubmit } from "@/lib/csrf";
import { cookies, headers } from "next/headers";
import { askRag } from "@/lib/rag";
import { getAuthOrThrow, UnauthorizedError } from "@/lib/auth-server";
import { logger } from "@/lib/logger";
import { AppError, toErrorResponse } from "@/lib/errors";
import { z, ensureJsonUnder, boundedString, httpError } from "@/lib/validate";
import { guardRate } from "@/lib/guards";
import { deriveRoles } from "@/lib/authz";

type ProxyChatBody = {
  text?: string;
  message?: string;
  content?: string;
  session_id?: string;
  sessionId?: string;
  mode?: string; // optional; backend can default
};

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export const POST = withCORS(async function POST(req: NextRequest) {
  try {
    // 1) Auth presence (user session)
  const { userId, bearer: authBearer } = await getAuthOrThrow();
  const roles = await deriveRoles(userId);
    // CSRF: block cross-site browser POSTs
    {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }
    // 1.5) Rate limit 60/min/user
    {
      const limited = await guardRate(req, { key: "proxy-chat", limit: 60, windowMs: 60_000 });
      if (limited) return limited;
    }
    // 2) Size guard + input validation (read once to avoid stream consumption)
    const lenHdr = req.headers.get("content-length");
    if (lenHdr && Number(lenHdr) > 64 * 1024) return httpError(413, "Payload too large");
    let body: ProxyChatBody | null = null;
    try {
      const txt = await req.text();
      if (txt && new TextEncoder().encode(txt).byteLength > 64 * 1024) return httpError(413, "Payload too large");
      body = txt ? (JSON.parse(txt) as any) : {};
    } catch {
      return bad(400, "Bad JSON");
    }

    const ChatIn = z.object({
      text: boundedString(4000),
      mode: z.enum(["friend", "therapist", "coach", "parent", "boss"]).optional(),
      context: z
        .object({
          messageId: boundedString(64).optional(),
          convoId: boundedString(64).optional(),
        })
        .optional(),
    }).strip();

    // Map legacy fields into our input view
    const candidate = {
      text:
        (typeof body?.text === "string" && body.text) ||
        (typeof body?.message === "string" && body.message) ||
        (typeof body?.content === "string" && body.content) ||
        "",
      mode: typeof body?.mode === "string" ? body.mode : undefined,
      context: undefined as
        | {
            messageId?: string;
            convoId?: string;
          }
        | undefined,
    };
    const parsed = ChatIn.safeParse(candidate);
    if (!parsed.success) {
      return httpError(400, "Invalid request");
    }
    const input = parsed.data;

    const sessionId = (body?.session_id || body?.sessionId || "").toString().trim() || undefined;

    // E2E: allow a fast no-op path to avoid backend latency for rate tests
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
      try {
        const hdrs = await headers();
        if (hdrs.get("x-e2e-noop") === "1" || (body as any)?.e2e === "noop") {
          return NextResponse.json({ reply: "ok" }, { headers: { "Cache-Control": "no-store" } });
        }
      } catch {}
    }

    // 3) Resolve a Clerk JWT (header/cookie fallbacks supported)
    let clerkJwt = authBearer || "";
    try {
      const hdrs = await headers();
      const authz = hdrs.get("authorization") || hdrs.get("Authorization");
      if (authz?.startsWith("Bearer ")) clerkJwt = authz.slice(7).trim();
    } catch {}
    if (!clerkJwt) {
      const jar = await cookies();
      clerkJwt = jar.get("__session")?.value ?? "";
    }
    if (!clerkJwt) return bad(401, "Missing Clerk session token");

    // 4) Call backend via your helper (which should forward Authorization: Bearer <token>)
    // E2E test echo: return forwarded tenant without calling backend
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true" && (body as any)?.e2e === "echo-tenant") {
      return NextResponse.json({ reply: "ok", meta: { forwardedTenant: userId, roles } }, { headers: { "Cache-Control": "no-store" } });
    }

    const ragResponse = await askRag(input.text, sessionId, clerkJwt, userId);

    const ChatOut = z
      .object({
        reply: boundedString(20000),
        meta: z
          .object({
            tokens: z.number().int().min(0).max(200000).optional(),
            mode: z.string().optional(),
          })
          .optional(),
      })
      .strip();

    // Map backend response to our schema
    const mapped = {
      reply: (ragResponse as any)?.reply || (ragResponse as any)?.message || "",
      meta: { mode: (ragResponse as any)?.mode, tokens: (ragResponse as any)?.tokens },
    };
    const output = ChatOut.parse(mapped);

    // 5) Success
    return NextResponse.json(output, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    if (err instanceof Response) return err; // propagated httpError/size guard
    if (err instanceof UnauthorizedError) return toErrorResponse(new AppError("unauthorized", "Unauthorized", 401));
    logger.error("proxy-chat error:", err);
    return toErrorResponse(err);
  }
}, { credentials: true });
