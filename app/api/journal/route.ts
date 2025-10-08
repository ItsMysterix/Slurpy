export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { fruitForEmotion } from "@/lib/moodFruit";

/* -------------------------- Supabase (server) -------------------------- */
function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE; // server-only
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ------------------------- Fruit helper ------------------------ */
/**
 * Canonical fruit identifier for an emotion:
 * 1) Prefer moodFruit.icon (path/URL used in UI).
 * 2) Fallback to a minimal name→emoji map (if icon missing).
 * 3) Default to 🍎.
 */
function fruitIdForEmotion(emotion?: string | null): string {
  if (!emotion) return "🍎";
  try {
    const f = fruitForEmotion(String(emotion).trim());
    if (f?.icon) return f.icon;
    const name = (f?.name || "").toLowerCase();

    const byName: Record<string, string> = {
      "sweet orange": "🍊",
      "sour lemon": "🍋",
      "calm blueberry": "🫐",
      "warm peach": "🍑",
      "fiery chili": "🌶️",
      "steady apple": "🍎",
      "sunny pineapple": "🍍",
      "gentle pear": "🍐",
      "bright strawberry": "🍓",
      "cool kiwi": "🥝",
    };
    return byName[name] || "🍎";
  } catch {
    return "🍎";
  }
}

/* ----------------------------- helpers -------------------------------- */
type Flavor = "snake" | "camel";
type TableInfo = { name: "journal_entries" | "JournalEntry"; flavor: Flavor };

async function detectTable(client: ReturnType<typeof sb>): Promise<TableInfo> {
  // Prefer snake_case; fallback to CamelCase
  const trySelect = async (table: string) => client.from(table).select("id").limit(1);

  let r = await trySelect("journal_entries");
  if (!r.error) return { name: "journal_entries", flavor: "snake" };

  r = await trySelect("JournalEntry");
  if (!r.error) return { name: "JournalEntry", flavor: "camel" };

  throw new Error("Neither journal_entries nor JournalEntry table exists");
}

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map((t) => t.trim()).filter(Boolean);
  if (typeof input === "string") return input.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

function shapeOut(row: any) {
  // Normalize DB row (either schema) → API shape
  return {
    id: row.id,
    title: row.title ?? null,
    content: row.content ?? null,
    mood: row.mood ?? null,
    fruit: row.fruit ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    userId: row.userId ?? row.user_id ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt) : row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : row.updated_at ? new Date(row.updated_at) : null,
    date:
      row.date ? new Date(row.date) : row.createdAt ? new Date(row.createdAt) : row.created_at ? new Date(row.created_at) : null,
  };
}

async function findEntryByIdForUser(client: ReturnType<typeof sb>, table: TableInfo, id: string, userId: string) {
  const cols =
    table.flavor === "snake"
      ? "id,title,content,mood,fruit,tags,user_id,created_at,updated_at,date"
      : "id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date";

  const userCol = table.flavor === "snake" ? "user_id" : "userId";

  const { data, error } = await client.from(table.name).select(cols).eq(userCol, userId).eq("id", id).maybeSingle();

  if (error || !data) return null;
  return data;
}

/* --------------------------------- GET -------------------------------- */
// GET /api/journal?id=<id>
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = sb();
    const table = await detectTable(client);

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const requestedUserId = url.searchParams.get("userId");
    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (id) {
      const row = await findEntryByIdForUser(client, table, id, userId);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(shapeOut(row));
    }

    const cols =
      table.flavor === "snake"
        ? "id,title,content,mood,fruit,tags,user_id,created_at,updated_at,date"
        : "id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date";

    const userCol = table.flavor === "snake" ? "user_id" : "userId";
    const createdCol = table.flavor === "snake" ? "created_at" : "createdAt";

    const { data, error } = await client
      .from(table.name)
      .select(cols)
      .eq(userCol, userId)
      .order("date", { ascending: false, nullsFirst: false })
      .order(createdCol, { ascending: false, nullsFirst: false });

    if (error) throw error;

    return NextResponse.json((data ?? []).map(shapeOut));
  } catch (e) {
    console.error("GET /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* --------------------------------- POST ------------------------------- */
// POST /api/journal { title, content, mood?, fruit?, tags?, date? }
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = sb();
    const table = await detectTable(client);
    const body = await req.json();

    const title = String(body?.title ?? "").trim();
    const content = String(body?.content ?? "").trim();
    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    // Provide a date (column may be NOT NULL)
    let dateVal: Date = new Date();
    if (body?.date) {
      const maybe = new Date(body.date);
      if (!isNaN(maybe.getTime())) dateVal = maybe;
    }

    const mood: string | null = body?.mood ? String(body.mood).trim() : null;
    const fruit: string | null = body?.fruit ? String(body.fruit) : (mood ? fruitIdForEmotion(mood) : null);

    const nowIso = new Date().toISOString();
    const id = randomUUID(); // TEXT id

    const payload =
      table.flavor === "snake"
        ? {
            id,
            user_id: userId,
            title,
            content,
            mood,
            fruit,
            tags: normalizeTags(body?.tags),
            date: dateVal.toISOString(),
            created_at: nowIso,
            updated_at: nowIso,
          }
        : {
            id,
            userId,
            title,
            content,
            mood,
            fruit,
            tags: normalizeTags(body?.tags),
            date: dateVal.toISOString(),
            createdAt: nowIso,
            updatedAt: nowIso,
            isPrivate: true,
          };

    const cols =
      table.flavor === "snake"
        ? "id,title,content,mood,fruit,tags,user_id,created_at,updated_at,date"
        : "id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date";

    const { data, error } = await client.from(table.name).insert([payload]).select(cols).single();

    if (error) throw error;
    return NextResponse.json(shapeOut(data), { status: 201 });
  } catch (e) {
    console.error("POST /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* --------------------------------- PUT -------------------------------- */
// PUT /api/journal { id, title?, content?, mood?, fruit?, tags?, date? }
export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = sb();
    const table = await detectTable(client);
    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await findEntryByIdForUser(client, table, id, userId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const title = body?.title !== undefined ? String(body.title).trim() : existing.title;
    const content = body?.content !== undefined ? String(body.content).trim() : existing.content;
    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    // mood / fruit patches
    const moodPatch =
      body?.mood !== undefined ? (body.mood ? String(body.mood).trim() : null) : existing.mood ?? null;

    let fruitPatch: string | null | undefined = undefined;
    if (body?.fruit !== undefined) {
      fruitPatch = body.fruit ? String(body.fruit) : null;
    } else if (body?.mood !== undefined && body.fruit === undefined) {
      // If mood changed but fruit not provided, re-derive
      fruitPatch = moodPatch ? fruitIdForEmotion(moodPatch) : null;
    }

    let datePatch: string | undefined = undefined;
    if (body?.date) {
      const d = new Date(body.date);
      if (!isNaN(d.getTime())) datePatch = d.toISOString();
    }

    const nowIso = new Date().toISOString();
    const updatePayload =
      table.flavor === "snake"
        ? {
            title,
            content,
            mood: moodPatch,
            ...(fruitPatch !== undefined ? { fruit: fruitPatch } : {}),
            tags: body?.tags !== undefined ? normalizeTags(body.tags) : existing.tags ?? [],
            updated_at: nowIso,
            ...(datePatch ? { date: datePatch } : {}),
          }
        : {
            title,
            content,
            mood: moodPatch,
            ...(fruitPatch !== undefined ? { fruit: fruitPatch } : {}),
            tags: body?.tags !== undefined ? normalizeTags(body.tags) : existing.tags ?? [],
            updatedAt: nowIso,
            ...(datePatch ? { date: datePatch } : {}),
          };

    const userCol = table.flavor === "snake" ? "user_id" : "userId";
    const cols =
      table.flavor === "snake"
        ? "id,title,content,mood,fruit,tags,user_id,created_at,updated_at,date"
        : "id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date";

    const { data, error } = await client
      .from(table.name)
      .update(updatePayload as any)
      .eq("id", id)
      .eq(userCol, userId)
      .select(cols)
      .single();

    if (error) throw error;
    return NextResponse.json(shapeOut(data));
  } catch (e) {
    console.error("PUT /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------------- DELETE ------------------------------ */
// DELETE /api/journal?id=<id>
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = sb();
    const table = await detectTable(client);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await findEntryByIdForUser(client, table, id, userId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const userCol = table.flavor === "snake" ? "user_id" : "userId";
    const { error } = await client.from(table.name).delete().eq("id", id).eq(userCol, userId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
