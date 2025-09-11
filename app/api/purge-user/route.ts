// app/api/purge-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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

export async function POST(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    console.error("purge-user failed:", e?.message || e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
