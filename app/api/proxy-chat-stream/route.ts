// runtime must be node to keep the response body a real stream
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const text: unknown = body?.text ?? body?.message;
    const session_id: string | undefined = body?.session_id ?? undefined;
    const mode: string | undefined = body?.mode ?? undefined;

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const clerkJwt = cookieStore.get("__session")?.value ?? "";
    if (!clerkJwt) {
      return NextResponse.json({ error: "Missing session cookie" }, { status: 401 });
    }

    const backend = process.env.BACKEND_API_URL || "http://localhost:8000";
    const upstream = await fetch(`${backend}/chat_stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/x-ndjson",
        "Authorization": `Bearer ${clerkJwt}`,
      },
      body: JSON.stringify({ text, session_id, mode }),
    });

    if (!upstream.ok || !upstream.body) {
      const err = await upstream.text().catch(() => "");
      return NextResponse.json({ error: err || "Upstream error" }, { status: upstream.status });
    }

    // Pipe upstream NDJSON stream directly to client
    const stream = new ReadableStream({
      start(controller) {
        const reader = upstream.body!.getReader();
        const pump = () =>
          reader.read().then(({ done, value }) => {
            if (done) return controller.close();
            if (value) controller.enqueue(value);
            pump();
          }).catch((e) => controller.error(e));
        pump();
      },
      cancel() {
        try { upstream.body?.cancel(); } catch {}
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("proxy-chat-stream error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
