// app/api/account/delete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

/* ------------------------ Supabase helpers ------------------------ */

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

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

/* ------------------------ Qdrant helpers -------------------------- */

// Expects env:
// QDRANT_URL (e.g. https://your-qdrant:6333)
// QDRANT_API_KEY (optional if not needed)
// QDRANT_COLLECTIONS (comma-separated list, e.g. "messages,notes,files")
async function deleteQdrantByUser(userId: string) {
  const base = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  const collections = (process.env.QDRANT_COLLECTIONS || "").split(",").map(s => s.trim()).filter(Boolean);

  if (!base || collections.length === 0) return { skipped: true };

  const headers: Record<string, string> = { "content-type": "application/json" };
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
      if (!res.ok) {
        results.push({ collection: c, error: json?.status || res.statusText || "delete failed" });
      } else {
        results.push({ collection: c, ok: true, detail: json });
      }
    } catch (e: any) {
      results.push({ collection: c, error: e?.message || "network error" });
    }
  }
  return { ok: true, results };
}

/* --------------------------- Handler ------------------------------ */

export async function POST(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1) Purge app data in Supabase
    const supabase = sb();
const supabaseTables = [
  "chat_messages",
  "chat_sessions",
  "daily_mood",
  "journal_entries",
  "plans",
  "roleplay",
  "reports",
  "ufm",
];
const sbResults = [];
for (const t of supabaseTables) {
  try {
    const { error } = await supabase.from(t).delete().eq("user_id", userId);
    if (error) sbResults.push({ table: t, error: error.message });
    else sbResults.push({ table: t, ok: true });
  } catch (e: any) {
    sbResults.push({ table: t, error: e?.message || "delete failed" });
  }
}


    // Optional: Supabase Storage (if you keep user files by folder userId/)
    // try { await supabase.storage.from("user-uploads").remove([`${userId}`]); } catch {}

    // 2) Purge vectors in Qdrant (if configured)
    const qdrant = await deleteQdrantByUser(userId);

    // 3) Delete the Clerk user (server-side)
    const client = await clerkClient();
    await client.users.deleteUser(userId);

    return NextResponse.json({ ok: true, supabase: sbResults, qdrant });
  } catch (e: any) {
    console.error("account/delete failed:", e?.message || e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
