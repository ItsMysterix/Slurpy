// app/api/proxy-chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { askRag } from "@/lib/rag";

export async function POST(req: NextRequest) {
  try {
    // 1) Ensure user is logged in
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Body parsing
    const body = await req.json();
    const text =
      typeof body.text === "string"
        ? body.text
        : typeof body.message === "string"
          ? body.message
          : null;
    if (!text) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    // 3) Grab Clerk session JWT from cookie
    const cookieStore = await cookies();
    const clerkJwt = cookieStore.get("__session")?.value ?? "";
    if (!clerkJwt) {
      return NextResponse.json({ error: "Missing session cookie" }, { status: 401 });
    }

    // 4) Call backend
    const rag = await askRag(text, body.session_id, clerkJwt);

    return NextResponse.json(rag);
  } catch (err) {
    console.error("proxy‑chat error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Server error",
        message:
          "I'm sorry, I'm having trouble responding right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
