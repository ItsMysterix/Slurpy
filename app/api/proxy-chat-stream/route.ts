// app/api/proxy-chat-stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const { userId, getToken } = await auth();
    if (!userId) return bad(401, "Unauthorized");

    // Parse body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return bad(400, "Bad JSON");
    }

    // Text: prefer body.text, then .message, then .content
    const textRaw =
      (typeof body?.text === "string" && body.text) ||
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.content === "string" && body.content) ||
      "";
    const text = textRaw.trim();
    if (!text) return bad(400, "Field 'text' is required");

    // Optional fields
    const session_id =
      (typeof body?.session_id === "string" && body.session_id.trim()) ||
      (typeof body?.sessionId === "string" && body.sessionId.trim()) ||
      undefined;
    const mode = (typeof body?.mode === "string" && body.mode.trim()) || undefined;

    // Resolve a Clerk session token — prefer template 'backend'
    let clerkJwt = "";
    try {
      clerkJwt = (await getToken({ template: "backend" })) || "";
    } catch {
      /* ignore — we’ll try fallbacks */
    }
    if (!clerkJwt) {
      const hdrs = await headers();
      const authzHeader = hdrs.get("authorization") || hdrs.get("Authorization");
      if (authzHeader?.startsWith("Bearer ")) clerkJwt = authzHeader.slice(7).trim();
    }
    if (!clerkJwt) {
      const cookieStore = await cookies();
      clerkJwt = cookieStore.get("__session")?.value ?? "";
    }
    if (!clerkJwt) return bad(401, "Missing Clerk session token");

    // Propagate client abort to upstream
    const controller = new AbortController();
    req.signal?.addEventListener("abort", () => controller.abort());

    // Build body without undefineds
    const upstreamPayload: Record<string, unknown> = { text };
    if (session_id) upstreamPayload.session_id = session_id;
    if (mode) upstreamPayload.mode = mode;

    const upstream = await fetch(`${BACKEND_URL}/chat_stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
        Authorization: `Bearer ${clerkJwt}`,
      },
      body: JSON.stringify(upstreamPayload),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      let errText = "";
      try {
        errText = await upstream.text();
      } catch {}
      return new NextResponse(
        JSON.stringify({ error: errText || "Upstream error" }),
        {
          status: upstream.status || 502,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }
      );
    }

    // Pipe NDJSON straight through
    const stream = new ReadableStream({
      start(ctrl) {
        const reader = upstream.body!.getReader();
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) ctrl.enqueue(value);
            }
            ctrl.close();
          } catch (e) {
            ctrl.error(e);
          }
        })();
      },
      cancel() {
        try {
          upstream.body?.cancel();
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
    console.error("proxy-chat-stream error:", err?.message || err);
    return bad(500, "Server error");
  }
}
