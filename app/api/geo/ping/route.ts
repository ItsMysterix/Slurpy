// app/api/geo/ping/route.ts
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
    // user must be signed in
    const { userId, getToken } = await auth();
    if (!userId) return bad(401, "Unauthorized");

    // grab body as raw text (pass-through JSON)
    const bodyText = await req.text();
    if (!bodyText) return bad(400, "Empty body");

    // get Clerk JWT (prefer the 'backend' template)
    let clerkJwt = "";
    try {
      clerkJwt = (await getToken({ template: "backend" })) || "";
    } catch {
      /* fallback below */
    }
    if (!clerkJwt) {
      const hdrs = await headers();
      const authz = hdrs.get("authorization") || hdrs.get("Authorization");
      if (authz?.startsWith("Bearer ")) clerkJwt = authz.slice(7).trim();
    }
    if (!clerkJwt) {
      const jar = await cookies();
      clerkJwt = jar.get("__session")?.value ?? "";
    }
    if (!clerkJwt) return bad(401, "Missing Clerk session token");

    // propagate client abort to upstream
    const controller = new AbortController();
    req.signal?.addEventListener("abort", () => controller.abort());

    // forward to backend
    const upstream = await fetch(`${BACKEND_URL}/api/geo/ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clerkJwt}`,
      },
      body: bodyText,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return bad(502, `geo proxy failed: ${String(err?.message || err)}`);
  }
}
