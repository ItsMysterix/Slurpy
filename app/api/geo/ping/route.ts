// app/api/geo/ping/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { cookies, headers } from "next/headers";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export const POST = withAuth(async function POST(req: NextRequest, auth) {
  try {
  // user must be signed in
  const { userId, bearer: initialBearer } = auth;
  if (!userId) return bad(401, "Unauthorized");

    // grab body as raw text (pass-through JSON)
    const bodyText = await req.text();
    if (!bodyText) return bad(400, "Empty body");

    // Resolve bearer
    let bearer = initialBearer || "";
    if (!bearer) {
      const hdrs = await headers();
      const authz = hdrs.get("authorization") || hdrs.get("Authorization");
      if (authz?.startsWith("Bearer ")) bearer = authz.slice(7).trim();
    }
    if (!bearer) {
      const jar = await cookies();
      bearer = jar.get("__session")?.value ?? "";
    }
    if (!bearer) return bad(401, "Missing auth session token");

    // propagate client abort to upstream
    const controller = new AbortController();
    req.signal?.addEventListener("abort", () => controller.abort());

    // forward to backend
    const upstream = await fetch(`${BACKEND_URL}/api/geo/ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
  Authorization: `Bearer ${bearer}`,
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
});
