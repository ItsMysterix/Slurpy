// app/api/proxy-chat-stream/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    }

    // Text: prefer body.text, then .message, then .content
    const textRaw =
      (typeof body?.text === "string" && body.text) ||
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.content === "string" && body.content) ||
      "";
    const text = textRaw.trim();
    if (!text) {
      return NextResponse.json({ error: "Field 'text' is required" }, { status: 400 });
    }

    // Optional fields
    const session_id =
      (typeof body?.session_id === "string" && body.session_id.trim()) ||
      (typeof body?.sessionId === "string" && body.sessionId.trim()) ||
      undefined;
    const mode = (typeof body?.mode === "string" && body.mode.trim()) || undefined;

    // Resolve a Clerk session token to forward
    const hdrs = await headers();
    const authzHeader = hdrs.get("authorization") || hdrs.get("Authorization");
    const cookieStore = await cookies();
    let clerkJwt =
      (authzHeader?.startsWith("Bearer ") && authzHeader.slice(7)) ||
      cookieStore.get("__session")?.value ||
      "";

    if (!clerkJwt) {
      try {
        clerkJwt = (await getToken()) || "";
      } catch {
        // ignore
      }
    }
    if (!clerkJwt) {
      return NextResponse.json({ error: "Missing Clerk session token" }, { status: 401 });
    }

    const backend = process.env.BACKEND_API_URL || "http://localhost:8000";

    // Propagate client abort to upstream
    const controller = new AbortController();
    req.signal?.addEventListener("abort", () => controller.abort());

    // Build body without undefineds
    const upstreamPayload: Record<string, unknown> = { text };
    if (session_id) upstreamPayload.session_id = session_id;
    if (mode) upstreamPayload.mode = mode;

    const upstream = await fetch(`${backend}/chat_stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
        Authorization: `Bearer ${clerkJwt}`,
      },
      body: JSON.stringify(upstreamPayload),
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      let errText = "";
      try {
        errText = await upstream.text();
      } catch {}
      return NextResponse.json(
        { error: errText || "Upstream error" },
        { status: upstream.status || 502 }
      );
    }

    // Pipe NDJSON straight through
    const stream = new ReadableStream({
      start(controller) {
        const reader = upstream.body!.getReader();
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
            controller.close();
          } catch (e) {
            controller.error(e);
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
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
