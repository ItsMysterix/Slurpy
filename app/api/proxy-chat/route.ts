// app/api/proxy-chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { askRag } from "@/lib/rag";

type ProxyChatBody = {
  text?: string;
  message?: string;
  session_id?: string;
  mode?: string; // optional; backend has a default
};

export async function POST(req: NextRequest) {
  try {
    // 1) Auth gate (must be signed in)
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Parse body
    let body: ProxyChatBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    }

    const text =
      typeof body?.text === "string"
        ? body.text
        : typeof body?.message === "string"
          ? body.message
          : null;

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Field 'text' is required" }, { status: 400 });
    }

    // 3) Resolve a Clerk session JWT to forward to the backend
    // Priority: Authorization header → __session cookie → auth().getToken()
    const hdrs = await headers();
    const authzHeader = hdrs.get("authorization") || hdrs.get("Authorization");

    let clerkJwt = "";
    if (authzHeader?.startsWith("Bearer ")) {
      clerkJwt = authzHeader.slice("Bearer ".length);
    } else {
      const cookieStore = await cookies();
      clerkJwt = cookieStore.get("__session")?.value ?? "";
    }

    if (!clerkJwt) {
      // fallback: ask Clerk for a session token
      try {
        clerkJwt = (await getToken()) || "";
      } catch {
        // ignore; we’ll handle if still empty below
      }
    }

    if (!clerkJwt) {
      return NextResponse.json({ error: "Missing Clerk session token" }, { status: 401 });
    }

    // 4) Call backend via RAG helper (body.mode is optional; backend has a default)
    // askRag(text, sessionId, clerkJwt)
    const rag = await askRag(text, body.session_id, clerkJwt);

    // 5) Success
    return NextResponse.json(rag);
  } catch (err: any) {
    // Try to surface useful info without leaking secrets
    const msg =
      typeof err?.message === "string"
        ? err.message
        : "Internal error";

    // If this is our wrapped backend error, it’ll look like:
    // "[rag] backend error <code>: <json or text>"
    console.error("proxy-chat error:", msg);

    return NextResponse.json(
      {
        success: false,
        error: "Server error",
        message:
          "I'm sorry, I'm having trouble responding right now. Please try again.",
      },
      { status: 500 }
    );
  }
}
