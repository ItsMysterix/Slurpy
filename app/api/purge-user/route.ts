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
    const { error } = await client.from(table)
      .delete()
      .or(`user_id.eq.${userId},userId.eq.${userId}`);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("does not exist")) return { table, skipped: true };
      // retry direct columns as fallback
      try { await client.from(table).delete().eq("user_id", userId); return { table, ok: true }; } catch {}
      try { await client.from(table).delete().eq("userId", userId); return { table, ok: true }; } catch {}
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
  const base = process.env.QDRANT_URL;               // e.g. https://qdrant.example.com:6333
  if (!base) return { skipped: true, reason: "QDRANT_URL not set" };

  const apiKey = process.env.QDRANT_API_KEY || "";
  const collections = (process.env.QDRANT_COLLECTIONS || "slurpy_messages")
    .split(",").map(s => s.trim()).filter(Boolean);

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["api-key"] = apiKey;

  const body = JSON.stringify({
    filter: { must: [{ key: "userId", match: { value: userId } }] },
  });

  const results: any[] = [];
  for (const col of collections) {
    try {
      const resp = await fetch(`${base}/collections/${encodeURIComponent(col)}/points/delete`, {
        method: "POST",
        headers,
        body,
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        results.push({ collection: col, ok: false, status: resp.status, error: txt });
      } else {
        results.push({ collection: col, ok: true });
      }
    } catch (e: any) {
      results.push({ collection: col, ok: false, error: String(e?.message || e) });
    }
  }
  return { collections: results };
}

export async function POST(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = sb();

    // Trim/extend this list to your schema
    const tables = [
      "ChatMessage",
      "ChatSession",
      "DailyMood",
      "Journal",
      "Plans",
      "RoleplayTurns",
      "RoleplayLog",
      "KVMemory",
      "UserMemory",
      "EmotionQuadrant",
      "Quadrant",
      "QuadrantLog",
      "MoodQuadrant",
      "Analytics",
    ];

    const sql = await Promise.all(tables.map(t => tryDeleteAll(supabase, t, userId)));
    const qdr = await qdrantDeleteByUser(userId);

    // Optional: Supabase Storage cleanup example
    // try { await supabase.storage.from("user-uploads").remove([`${userId}`]); } catch {}

    return NextResponse.json({ ok: true, sql, qdr });
  } catch (e: any) {
    console.error("purge-user failed:", e?.message || e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
