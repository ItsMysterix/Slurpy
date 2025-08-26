// app/api/calendar/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto"; // <-- NEW

/* -------------------------- Supabase (server) -------------------------- */
function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE; // server-only
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ------------------------------- helpers ------------------------------- */
const toUTCStartOfDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const fromISO = (iso: string) => new Date(iso);

const dateKeyUTC = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const monthRangeUTC = (year: number, month: number) => {
  // month is 0-based (0=Jan)
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  // end as inclusive max (23:59:59.999 of last day)
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return { start, end };
};

function getFruitForEmotion(emotion: string): string {
  const fruits: Record<string, string> = {
    happy: "🍊", joyful: "🍓", excited: "🍍", content: "🍇",
    calm: "🥝", peaceful: "🫐", relaxed: "🍑",
    sad: "🌰", depressed: "🥀", lonely: "🍂",
    anxious: "🍑", worried: "🍐", nervous: "🍌",
    angry: "🔥", frustrated: "🍋", irritated: "🌶️",
    stressed: "🥔", overwhelmed: "🌊", tired: "😴",
    neutral: "🍎", okay: "🥭", fine: "🍈",
  };
  return fruits[emotion.toLowerCase()] || "🍎";
}

/* -------------------------------- GET ---------------------------------- */
// GET /api/calendar?year=YYYY&month=0-11
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = sb();
    const url = new URL(req.url);
    const year = parseInt(url.searchParams.get("year") || new Date().getUTCFullYear().toString(), 10);
    const month = parseInt(url.searchParams.get("month") || new Date().getUTCMonth().toString(), 10);

    const { start, end } = monthRangeUTC(year, month);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // 1) Daily moods
    const { data: moods, error: moodsErr } = await supabase
      .from("DailyMood")
      .select("id,userId,date,emotion,intensity,fruit,notes,createdAt,updatedAt")
      .eq("userId", userId)
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date", { ascending: true });
    if (moodsErr) throw moodsErr;

    // 2) Journal entries
    const { data: journals, error: journalsErr } = await supabase
      .from("JournalEntry")
      .select("id,title,date,mood,tags,content,userId,createdAt,updatedAt")
      .eq("userId", userId)
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date", { ascending: true });
    if (journalsErr) throw journalsErr;

    // 3) Chat sessions (then fetch messages separately)
    const { data: sessions, error: sessionsErr } = await supabase
      .from("ChatSession")
      .select("id,sessionId,userId,startTime,endTime,duration,messageCount")
      .eq("userId", userId)
      .gte("startTime", startISO)
      .lte("startTime", endISO)
      .order("startTime", { ascending: true });
    if (sessionsErr) throw sessionsErr;

    const sessionIds = (sessions || []).map((s) => s.sessionId);
    let messages: any[] = [];
    if (sessionIds.length) {
      const { data: msgRows, error: msgErr } = await supabase
        .from("ChatMessage")
        .select("sessionId,emotion,intensity,timestamp")
        .in("sessionId", sessionIds)
        .order("timestamp", { ascending: true });
      if (msgErr) throw msgErr;
      messages = msgRows || [];
    }

    // Group messages by sessionId
    const msgsBySession = new Map<string, any[]>();
    for (const m of messages) {
      const arr = msgsBySession.get(m.sessionId) || [];
      arr.push(m);
      msgsBySession.set(m.sessionId, arr);
    }

    // Build calendarData map
    const calendarData: Record<string, any> = {};

    // moods -> keyed by UTC date
    for (const mood of moods || []) {
      const key = dateKeyUTC(new Date(mood.date));
      calendarData[key] = {
        ...(calendarData[key] || {}),
        mood: {
          emotion: mood.emotion,
          intensity: mood.intensity, // 1..10
          fruit: mood.fruit,
          notes: mood.notes ?? null,
        },
      };
    }

    // journals
    for (const entry of journals || []) {
      const key = dateKeyUTC(new Date(entry.date));
      if (!calendarData[key]) calendarData[key] = {};
      if (!calendarData[key].journals) calendarData[key].journals = [];
      const preview =
        typeof entry.content === "string"
          ? entry.content.slice(0, 100) + (entry.content.length > 100 ? "..." : "")
          : "";
      calendarData[key].journals.push({
        id: entry.id,
        title: entry.title,
        mood: entry.mood,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        preview,
      });
    }

    // chat sessions with summarized info
    for (const s of sessions || []) {
      const key = dateKeyUTC(new Date(s.startTime));
      if (!calendarData[key]) calendarData[key] = {};
      if (!calendarData[key].chatSessions) calendarData[key].chatSessions = [];

      const msgs = msgsBySession.get(s.sessionId) || [];
      const messagesCount = msgs.length;

      const counts: Record<string, number> = {};
      for (const m of msgs) {
        if (m?.emotion) counts[m.emotion] = (counts[m.emotion] || 0) + 1;
      }
      const dominantEmotion =
        Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] || "neutral";

      const endTime = s.endTime ? new Date(s.endTime) : new Date();
      const minutes =
        typeof s.duration === "number"
          ? s.duration
          : Math.max(0, Math.round((endTime.getTime() - new Date(s.startTime).getTime()) / 60000));

      const fmt = minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

      calendarData[key].chatSessions.push({
        id: s.id,
        duration: fmt,
        messagesCount,
        dominantEmotion,
        timestamp: new Date(s.startTime).toISOString(),
      });
    }

    // Stats
    const daysTracked = (moods || []).length;
    const averageMood =
      daysTracked > 0
        ? Math.round(
            (((moods || []).reduce((sum, m) => sum + (m.intensity ?? 0), 0) / daysTracked) as number) * 10
          ) / 10
        : 0;

    let bestDay: any = null;
    if ((moods || []).length) {
      const best = (moods as any[]).reduce((b, c) => (c.intensity > b.intensity ? c : b));
      bestDay = {
        date: new Date(best.date).toISOString(),
        emotion: best.emotion,
        intensity: best.intensity,
        fruit: best.fruit,
        notes: best.notes ?? undefined,
      };
    }

    const emotionDistribution = (moods || []).reduce((acc: Record<string, number>, m: any) => {
      acc[m.emotion] = (acc[m.emotion] || 0) + 1;
      return acc;
    }, {});

    const stats = {
      daysTracked,
      averageMood,
      journalEntries: (journals || []).length,
      chatSessions: (sessions || []).length,
      bestDay,
      emotionDistribution,
    };

    return NextResponse.json({ calendarData, stats });
  } catch (error) {
    console.error("Error fetching calendar data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------------- POST --------------------------------- */
// POST /api/calendar { date, emotion, intensity(1..10), notes? }
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = sb();
    const body = await req.json();
    const { date, emotion, intensity, notes } = body || {};

    if (!date || !emotion || intensity == null) {
      return NextResponse.json({ error: "date, emotion, and intensity are required" }, { status: 400 });
    }
    if (typeof intensity !== "number" || intensity < 1 || intensity > 10) {
      return NextResponse.json({ error: "intensity must be between 1 and 10" }, { status: 400 });
    }

    const d = fromISO(String(date));
    const normalized = toUTCStartOfDay(d);
    const fruit = getFruitForEmotion(String(emotion));

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("DailyMood")
      .upsert(
        [
          {
            id: randomUUID(), // <-- NEW: ensure id is not null on insert
            userId,
            date: normalized.toISOString(),
            emotion: String(emotion),
            intensity,
            fruit,
            notes: notes ? String(notes) : null,
            updatedAt: nowIso,
            createdAt: nowIso, // harmless if existing row
          },
        ],
        { onConflict: "userId,date", ignoreDuplicates: false }
      )
      .select("id,userId,date,emotion,intensity,fruit,notes");
    if (error) throw error;

    const mood = (data && data[0]) || null;
    return NextResponse.json({ success: true, mood });
  } catch (error) {
    console.error("Error saving daily mood:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ------------------------------- DELETE -------------------------------- */
// DELETE /api/calendar?date=YYYY-MM-DD (any ISO; deleted by day range)
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = sb();
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    if (!dateParam) return NextResponse.json({ error: "date parameter is required" }, { status: 400 });

    const d = fromISO(dateParam);
    const dayStart = toUTCStartOfDay(d);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayStart.getUTCDate() + 1);

    const { error } = await supabase
      .from("DailyMood")
      .delete()
      .eq("userId", userId)
      .gte("date", dayStart.toISOString())
      .lt("date", dayEnd.toISOString());
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting daily mood:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
