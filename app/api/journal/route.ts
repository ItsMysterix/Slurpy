export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getAuthOrThrow, UnauthorizedError } from "@/lib/auth-server";
import { createClient } from "@supabase/supabase-js";
import { createServerServiceClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import { fruitForEmotion } from "@/lib/moodFruit";
import { logger } from "@/lib/logger";
import { z, ensureJsonUnder, boundedString, httpError } from "@/lib/validate";
import { guardRate } from "@/lib/guards";
import { deriveRoles, requireSelfOrRole, ForbiddenError } from "@/lib/authz";
import { withCORS } from "@/lib/cors";
import { assertSameOrigin, assertDoubleSubmit } from "@/lib/csrf";

/* -------------------------- Supabase (server) -------------------------- */
function sb() {
  return createServerServiceClient();
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
    const { userId } = await getAuthOrThrow();

    const client = sb();
    const table = await detectTable(client);

    const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const requestedUserId = url.searchParams.get("userId");
    const Query = z
      .object({
        cursor: boundedString(128).optional(),
        limit: z
          .string()
          .optional()
          .transform((v) => (v ? Number(v) : undefined))
          .pipe(z.number().int().min(1).max(100).optional())
          .transform((v) => v ?? 50),
      })
      .strip();
    const q = Query.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!q.success) return httpError(400, "Invalid query");
    if (requestedUserId && requestedUserId !== userId) {
      // Allow ops/admin to read others; otherwise 403
      const roles = await deriveRoles(userId);
      try {
        requireSelfOrRole({ requesterId: userId, ownerId: requestedUserId, roles }, "ops", "admin");
      } catch (e) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
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
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof Response) return e; // propagate httpError from size guard/validation
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logger.error("GET /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* --------------------------------- POST ------------------------------- */
// POST /api/journal { title, content, mood?, fruit?, tags?, date? }
export const POST = withCORS(async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthOrThrow();
    // Rate limit write ops 20/min/user
    {
      const limited = await guardRate(req, { key: "journal-write", limit: 20, windowMs: 60_000 });
      if (limited) return limited;
    }
    // E2E stub path for tests to avoid DB dependency
    const e2eStub = process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true" && req.headers.get("x-e2e-stub-journal") === "1";
    // CSRF
    {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }
    // Read-once JSON with size cap
    const lenHdr = req.headers.get("content-length");
    if (lenHdr && Number(lenHdr) > 64 * 1024) return httpError(413, "Payload too large");
    let raw: any = {};
    try {
      const txt = await req.text();
      if (txt && new TextEncoder().encode(txt).byteLength > 64 * 1024) return httpError(413, "Payload too large");
      raw = txt ? JSON.parse(txt) : {};
    } catch {
      return httpError(400, "Bad JSON");
    }

    const UpsertJournalIn = z
      .object({
        id: boundedString(64).optional(),
        title: boundedString(200),
        body: boundedString(20000),
        mood: z
          .enum(["cherry", "grape", "mango", "papaya", "lemon", "banana", "kiwi", "strawberry", "watermelon"]) 
          .optional(),
        ts: z.number().int().min(0).optional(),
        tags: z.array(boundedString(64)).optional(),
        date: boundedString(64).optional(),
        fruit: boundedString(64).optional(),
      })
      .strip();

    const candidate = {
      id: raw?.id,
      title: raw?.title,
      body: raw?.body ?? raw?.content,
      mood: raw?.mood,
      ts: raw?.ts,
      tags: raw?.tags,
      date: raw?.date,
      fruit: raw?.fruit,
    };
    const parsed = UpsertJournalIn.safeParse(candidate);
    if (!parsed.success) return httpError(400, "Invalid request");
    const input = parsed.data;

  const client = sb();
    const table = await detectTable(client);

    const title = input.title;
    const content = input.body;

    // Provide a date (column may be NOT NULL)
    let dateVal: Date = new Date();
    if (input?.date) {
      const maybe = new Date(input.date);
      if (!isNaN(maybe.getTime())) dateVal = maybe;
    }

    const mood: string | null = input?.mood ? String(input.mood).trim() : null;
    const fruit: string | null = input?.fruit ? String(input.fruit) : (mood ? fruitIdForEmotion(mood) : null);

    const nowIso = new Date().toISOString();
    const id = input.id || randomUUID(); // TEXT id

    const payload =
      table.flavor === "snake"
        ? {
            id,
            user_id: userId,
            title,
            content,
            mood,
            fruit,
            tags: normalizeTags(input?.tags),
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
            tags: normalizeTags(input?.tags),
            date: dateVal.toISOString(),
            createdAt: nowIso,
            updatedAt: nowIso,
            isPrivate: true,
          };

    const cols =
      table.flavor === "snake"
        ? "id,title,content,mood,fruit,tags,user_id,created_at,updated_at,date"
        : "id,title,content,mood,fruit,tags,userId,createdAt,updatedAt,date";

    if (e2eStub) {
      // Return a synthetic row
      const fake = {
        id,
        title,
        content,
        mood,
        fruit,
        tags: normalizeTags(input?.tags),
        userId: userId,
        user_id: userId,
        date: dateVal.toISOString(),
        created_at: nowIso,
        updated_at: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      } as any;
      return NextResponse.json(shapeOut(fake), { status: 201 });
    }

    const { data, error } = await client.from(table.name).insert([payload]).select(cols).single();

    if (error) throw error;
    return NextResponse.json(shapeOut(data), { status: 201 });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof Response) return e;
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logger.error("POST /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, { credentials: true });

/* --------------------------------- PUT -------------------------------- */
// PUT /api/journal { id, title?, content?, mood?, fruit?, tags?, date? }
export const PUT = withCORS(async function PUT(req: NextRequest) {
  try {
    const { userId } = await getAuthOrThrow();
    const client = sb();
    const table = await detectTable(client);
    // Rate limit write ops 20/min/user
    {
      const limited = await guardRate(req, { key: "journal-write", limit: 20, windowMs: 60_000 });
      if (limited) return limited;
    }
    // CSRF
    {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }

    // Read-once JSON with size cap
    const lenHdr = req.headers.get("content-length");
    if (lenHdr && Number(lenHdr) > 64 * 1024) return httpError(413, "Payload too large");
    let body: any = {};
    try {
      const txt = await req.text();
      if (txt && new TextEncoder().encode(txt).byteLength > 64 * 1024) return httpError(413, "Payload too large");
      body = txt ? JSON.parse(txt) : {};
    } catch {
      return httpError(400, "Bad JSON");
    }
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await findEntryByIdForUser(client, table, id, userId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // enforce self or admin on write
    const roles = await deriveRoles(userId);
    try { requireSelfOrRole({ requesterId: userId, ownerId: userId, roles }, "admin"); } catch (e) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const UpsertPatch = z
      .object({
        title: boundedString(200).optional(),
        body: boundedString(20000).optional(),
        mood: z
          .enum(["cherry", "grape", "mango", "papaya", "lemon", "banana", "kiwi", "strawberry", "watermelon"]) 
          .optional(),
        ts: z.number().int().min(0).optional(),
        tags: z.array(boundedString(64)).optional(),
        date: boundedString(64).optional(),
        fruit: boundedString(64).optional(),
      })
      .strip();
    const cand = { title: body?.title, body: body?.body ?? body?.content, mood: body?.mood, ts: body?.ts, tags: body?.tags, date: body?.date, fruit: body?.fruit };
    const parsed = UpsertPatch.safeParse(cand);
    if (!parsed.success) return httpError(400, "Invalid request");
    const title = parsed.data.title !== undefined ? parsed.data.title : existing.title;
    const content = parsed.data.body !== undefined ? parsed.data.body : existing.content;
    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    // mood / fruit patches
    const moodPatch =
      parsed.data.mood !== undefined ? (parsed.data.mood ? String(parsed.data.mood).trim() : null) : existing.mood ?? null;

    let fruitPatch: string | null | undefined = undefined;
    if (parsed.data.fruit !== undefined) {
      fruitPatch = parsed.data.fruit ? String(parsed.data.fruit) : null;
    } else if (parsed.data.mood !== undefined && parsed.data.fruit === undefined) {
      // If mood changed but fruit not provided, re-derive
      fruitPatch = moodPatch ? fruitIdForEmotion(moodPatch) : null;
    }

    let datePatch: string | undefined = undefined;
    if (parsed.data.date) {
      const d = new Date(parsed.data.date);
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
            tags: parsed.data.tags !== undefined ? normalizeTags(parsed.data.tags) : existing.tags ?? [],
            updated_at: nowIso,
            ...(datePatch ? { date: datePatch } : {}),
          }
        : {
            title,
            content,
            mood: moodPatch,
            ...(fruitPatch !== undefined ? { fruit: fruitPatch } : {}),
            tags: parsed.data.tags !== undefined ? normalizeTags(parsed.data.tags) : existing.tags ?? [],
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
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof Response) return e;
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logger.error("PUT /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, { credentials: true });

/* -------------------------------- DELETE ------------------------------ */
// DELETE /api/journal?id=<id>
export const DELETE = withCORS(async function DELETE(req: NextRequest) {
  try {
    const { userId } = await getAuthOrThrow();
    // Rate limit write ops 20/min/user
    {
      const limited = await guardRate(req, { key: "journal-write", limit: 20, windowMs: 60_000 });
      if (limited) return limited;
    }
    // CSRF
    {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }

  const client = sb();
  const table = await detectTable(client);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await findEntryByIdForUser(client, table, id, userId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // enforce self or admin on delete
    const roles = await deriveRoles(userId);
    try { requireSelfOrRole({ requesterId: userId, ownerId: userId, roles }, "admin"); } catch (e) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const userCol = table.flavor === "snake" ? "user_id" : "userId";
    const { error } = await client.from(table.name).delete().eq("id", id).eq(userCol, userId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (e instanceof Response) return e;
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logger.error("DELETE /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, { credentials: true });
