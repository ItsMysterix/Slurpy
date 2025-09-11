// app/api/proxy-chat/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { askRag } from "@/lib/rag";

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

export async function POST(req: NextRequest) {
  try {
    // 1) Auth gate
    const { userId, getToken } = await auth();
    if (!userId) return bad(401, "Unauthorized");

    // 2) Parse body
    let body: ProxyChatBody | null = null;
    try {
      body = await req.json();
    } catch {
      return bad(400, "Bad JSON");
    }

    const rawText =
      (typeof body?.text === "string" ? body.text : undefined) ??
      (typeof body?.message === "string" ? body.message : undefined) ??
      (typeof body?.content === "string" ? body.content : undefined) ??
      "";

    const text = rawText.trim();
    if (!text) return bad(400, "Field 'text' is required");

    const sessionId = (body?.session_id || body?.sessionId || "").trim() || undefined;

    // 3) Resolve a Clerk session JWT to forward to backend
    // Priority: Authorization header → __session cookie → auth().getToken()
    const hdrs = await headers();
    const authz = hdrs.get("authorization") || hdrs.get("Authorization");
    let clerkJwt = "";

    if (authz?.startsWith("Bearer ")) {
      clerkJwt = authz.slice("Bearer ".length).trim();
    }
    if (!clerkJwt) {
      const jar = await cookies();
      clerkJwt = jar.get("__session")?.value ?? "";
    }
    if (!clerkJwt) {
      try {
        clerkJwt = (await getToken()) || "";
      } catch {
        // ignore
      }
    }
    if (!clerkJwt) return bad(401, "Missing Clerk session token");

    // 4) Call backend via RAG helper
    // askRag(text, sessionId, clerkJwt)  // keep signature aligned with your helper
    const ragResponse = await askRag(text, sessionId, clerkJwt /*, body?.mode */);

    // 5) Success
    return NextResponse.json(ragResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Internal error";
    console.error("proxy-chat error:", msg);
    return NextResponse.json(
      {
        success: false,
        error: "Server error",
        message: "I'm having trouble responding right now. Please try again.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
