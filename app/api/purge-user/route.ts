// app/api/purge-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";
import { createServerServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { deriveRoles, requireSelfOrRole, ForbiddenError } from "@/lib/authz";
import { ensureJsonUnder, z } from "@/lib/validate";
import { guardRate } from "@/lib/guards";
import { withCORS } from "@/lib/cors";
import { assertSameOrigin, assertDoubleSubmit } from "@/lib/csrf";

function sb() {
  return createServerServiceClient();
}

// Best-effort delete that tolerates missing tables/columns.
async function tryDeleteAll(client: ReturnType<typeof sb>, table: string, userId: string) {
  try {
    const { error } = await client
      .from(table)
      .delete()
      .or(`user_id.eq.${userId},userId.eq.${userId}`);

    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("does not exist")) return { table, skipped: true };
      // fallback attempts with either column name
      try { await client.from(table).delete().eq("user_id", userId); return { table, ok: true }; } catch {}
      try { await client.from(table).delete().eq("userId", userId);  return { table, ok: true }; } catch {}
      return { table, error: msg };
    }
    return { table, ok: true };
  } catch (e: any) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("does not exist")) return { table, skipped: true };
    return { table, error: msg };
  }
}

/** Delete all Qdrant points with payload.userId == current user */
async function qdrantDeleteByUser(userId: string) {
  const base = process.env.QDRANT_URL; // e.g. https://qdrant.example.com:6333
  const collections = (process.env.QDRANT_COLLECTIONS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!base || collections.length === 0) return { skipped: true };

  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = process.env.QDRANT_API_KEY;
  if (apiKey) headers["api-key"] = apiKey;

  const results: any[] = [];
  for (const c of collections) {
    try {
      const res = await fetch(`${base}/collections/${encodeURIComponent(c)}/points/delete`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          filter: { must: [{ key: "userId", match: { value: userId } }] },
          wait: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) results.push({ collection: c, error: json?.status || res.statusText || "delete failed" });
      else results.push({ collection: c, ok: true });
    } catch (e: any) {
      results.push({ collection: c, error: e?.message || "network error" });
    }
  }
  return { ok: true, results };
}

export const POST = withCORS(withAuth(async function POST(req: NextRequest, auth) {
  try {
    const userId = auth.userId;
    const roles = await deriveRoles(userId);
    try { requireSelfOrRole({ requesterId: userId, ownerId: userId, roles }, "admin"); } catch (e) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    // Limit to 3/day/user
    {
      const limited = await guardRate(req, { key: "purge-user", limit: 3, windowMs: 86_400_000 });
      if (limited) return limited;
    }

    // CSRF
    {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }

    // Require explicit client confirmation to reduce accidental purges
    const len = req.headers.get("content-length");
    if (len && Number(len) > 1024) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    let body: any = null;
    try {
      const txt = await req.text();
      if (txt && new TextEncoder().encode(txt).byteLength > 1024) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 });
      }
      body = txt ? JSON.parse(txt) : null;
    } catch {
      body = null;
    }
    const Confirm = z.object({ confirm: z.literal("DELETE_MY_ACCOUNT") }).strip();
    const ok = Confirm.safeParse(body);
    if (!ok.success) return NextResponse.json({ error: "Confirmation required" }, { status: 400 });

    const supabase = sb();

    // Include canonical snake_case AND still-present CamelCase tables
    const tables = [
      // canonical snake_case
      "chat_messages",
      "chat_sessions",
      "plans",
      "reports",
      "roleplay",
      "ufm",
      // camel/legacy that your app still references
      "DailyMood",
      "JournalEntry",
      "ChatMessage",
      "ChatSession",
      "Plan",
      "Report",
      "Roleplay",
      "Ufm",
    ];

  const sql = await Promise.all(tables.map(t => tryDeleteAll(supabase, t, userId)));
  const qdr = await qdrantDeleteByUser(userId);

    // Optional: Supabase Storage cleanup (if you store by userId/)
    // try { await supabase.storage.from("user-uploads").remove([`${userId}`]); } catch {}

    return NextResponse.json({ ok: true, supabase: sql, qdrant: qdr });
  } catch (e: any) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof Response) return e;
    logger.error("purge-user failed:", e?.message || e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}), { credentials: true });
