// app/api/journal/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

/* -------------------------- Supabase (server) -------------------------- */
function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE; // server-only
  console.log("[journal/sb] url?", !!url, "service?", !!key);
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ----------------------------- helpers -------------------------------- */
function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map(t => t.trim()).filter(Boolean);
  if (typeof input === "string") return input.split(",").map(t => t.trim()).filter(Boolean);
  return [];
}

function shape(entry: any) {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    mood: entry.mood ?? null,
    fruit: entry.fruit ?? null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    userId: entry.userId,
    createdAt: entry.createdAt ? new Date(entry.createdAt) : null,
    updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : null,
    date: entry.date ? new Date(entry.date) : (entry.createdAt ? new Date(entry.createdAt) : null),
  };
}

async function findEntryByIdForUser(client: ReturnType<typeof sb>, id: string, userId: string) {
  const { data, error } = await client
    .from("JournalEntry")
    .select("id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date")
    .eq("userId", userId)
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

/* --------------------------------- GET -------------------------------- */
// GET /api/journal?id=<id>
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = sb();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const requestedUserId = url.searchParams.get("userId");
    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (id) {
      const row = await findEntryByIdForUser(client, id, userId);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(shape(row));
    }

    // Prefer DB ordering; fall back to JS sort safety
    const { data, error } = await client
      .from("JournalEntry")
      .select("id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date")
      .eq("userId", userId)
      .order("date", { ascending: false, nullsFirst: false })
      .order("createdAt", { ascending: false, nullsFirst: false });
    if (error) throw error;

    return NextResponse.json((data ?? []).map(shape));
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
    const body = await req.json();

    const title = String(body?.title ?? "").trim();
    const content = String(body?.content ?? "").trim();
    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    // JournalEntry.date is NOT NULL → provide one
    let dateVal: Date = new Date();
    if (body?.date) {
      const maybe = new Date(body.date);
      if (!isNaN(maybe.getTime())) dateVal = maybe;
    }

    const nowIso = new Date().toISOString();
    const id = randomUUID(); // <-- REQUIRED: table id is TEXT NOT NULL

    const { data, error } = await client
      .from("JournalEntry")
      .insert([
        {
          userId,
          title,
          content,
          mood: body?.mood ? String(body.mood) : null,
          fruit: body?.fruit ? String(body.fruit) : null,
          tags: normalizeTags(body?.tags),
          date: dateVal.toISOString(),
          createdAt: nowIso,
          updatedAt: nowIso,
          isPrivate: true,
        },
      ])
      .select("id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date")
      .single();

    if (error) throw error;
    return NextResponse.json(shape(data), { status: 201 });
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
    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await findEntryByIdForUser(client, id, userId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const title = body?.title !== undefined ? String(body.title).trim() : existing.title;
    const content = body?.content !== undefined ? String(body.content).trim() : existing.content;
    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    let datePatch: string | undefined = undefined;
    if (body?.date) {
      const d = new Date(body.date);
      if (!isNaN(d.getTime())) datePatch = d.toISOString();
    }

    const updatePayload: any = {
      title,
      content,
      mood: body?.mood !== undefined ? (body.mood ? String(body.mood) : null) : existing.mood,
      fruit: body?.fruit !== undefined ? (body.fruit ? String(body.fruit) : null) : existing.fruit,
      tags: body?.tags !== undefined ? normalizeTags(body.tags) : existing.tags,
      updatedAt: new Date().toISOString(),
      ...(datePatch ? { date: datePatch } : {}),
    };

    const { data, error } = await client
      .from("JournalEntry")
      .update(updatePayload)
      .eq("id", id)
      .eq("userId", userId)
      .select("id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date")
      .single();

    if (error) throw error;
    return NextResponse.json(shape(data));
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
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await findEntryByIdForUser(client, id, userId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { error } = await client.from("JournalEntry").delete().eq("id", id).eq("userId", userId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
