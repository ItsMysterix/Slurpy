// app/api/journal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PrismaClient } from "@prisma/client";

// Reuse a single Prisma client in dev to avoid connection burn
const g = global as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/* -------------------------- helpers -------------------------- */
const isNumericId = (v: string) => /^\d+$/.test(String(v || ""));
const asNumber = (v: string) => Number(String(v));

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map(t => t.trim()).filter(Boolean);
  if (typeof input === "string") return input.split(",").map(t => t.trim()).filter(Boolean);
  return [];
}

async function findEntryFlexible(entryId: string, userId: string) {
  // Try numeric first if it looks numeric
  if (isNumericId(entryId)) {
    try {
      const byNum = await prisma.journalEntry.findFirst({
        where: { id: asNumber(entryId) as any, userId } as any,
      });
      if (byNum) return byNum;
    } catch {/* ignore */}
  }
  // Then try string
  try {
    const byStr = await prisma.journalEntry.findFirst({
      where: { id: String(entryId) as any, userId } as any,
    });
    if (byStr) return byStr;
  } catch {/* ignore */}
  return null;
}

/** Shape the row to what the UI expects */
function shape(entry: any) {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    mood: entry.mood ?? null,
    fruit: entry.fruit ?? null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    userId: entry.userId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    // Your page reads entry.date — map to the model's date (fallback to createdAt)
    date: entry.date ?? entry.createdAt,
  };
}

/* --------------------------- GET ----------------------------- */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const requestedUserId = url.searchParams.get("userId");
    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (id) {
      const entry = await findEntryFlexible(id, userId);
      if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(shape(entry));
    }

    // Order primarily by `date`, then `createdAt` as tiebreaker (works even if date is non-null)
    const rows = await prisma.journalEntry.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(rows.map(shape));
  } catch (e) {
    console.error("GET /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* --------------------------- POST ---------------------------- */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const title = String(body?.title ?? "").trim();
    const content = String(body?.content ?? "").trim();
    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    // JournalEntry.date is required in your Prisma model → supply one.
    let dateVal: Date = new Date();
    if (body?.date) {
      const maybe = new Date(body.date);
      if (!isNaN(maybe.getTime())) dateVal = maybe;
    }

    const data = await prisma.journalEntry.create({
      data: {
        userId,
        title,
        content,
        mood: body?.mood ? String(body.mood) : null,
        fruit: body?.fruit ? String(body.fruit) : null,
        tags: normalizeTags(body?.tags),
        date: dateVal, // <-- REQUIRED
      },
    });

    return NextResponse.json(shape(data), { status: 201 });
  } catch (e) {
    console.error("POST /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ---------------------------- PUT ---------------------------- */
export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await findEntryFlexible(id, userId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const title =
      body?.title !== undefined ? String(body.title).trim() : existing.title;
    const content =
      body?.content !== undefined ? String(body.content).trim() : existing.content;
    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    // Optional date update
    let datePatch: Date | undefined = undefined;
    if (body?.date) {
      const d = new Date(body.date);
      if (!isNaN(d.getTime())) datePatch = d;
    }

    const updated = await prisma.journalEntry.update({
      where: { id: existing.id as any },
      data: {
        title,
        content,
        mood: body?.mood !== undefined ? (body.mood ? String(body.mood) : null) : existing.mood,
        fruit: body?.fruit !== undefined ? (body.fruit ? String(body.fruit) : null) : existing.fruit,
        tags: body?.tags !== undefined ? normalizeTags(body.tags) : existing.tags,
        ...(datePatch ? { date: datePatch } : {}),
      },
    });

    return NextResponse.json(shape(updated));
  } catch (e) {
    console.error("PUT /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------- DELETE --------------------------- */
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await findEntryFlexible(id, userId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.journalEntry.delete({ where: { id: existing.id as any } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/journal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
