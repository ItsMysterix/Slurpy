export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getAuthOrThrow } from "@/lib/auth-server";
import { createServerServiceClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import { guardRate } from "@/lib/guards";
import { withCORS } from "@/lib/cors";
import { assertSameOrigin, assertDoubleSubmit } from "@/lib/csrf";
import { fruitForEmotion } from "@/lib/moodFruit";
import { AppError, withErrorHandling } from "@/lib/errors";

/* -------------------------- Supabase -------------------------- */
function sb() {
  return createServerServiceClient();
}

/* ----------------------------- Types -------------------------- */
type CalendarEventRow = {
  id: string;
  user_id: string;
  date: string; // ISO
  title: string | null;
  location: string | null; // aliased from location_label
  location_lat: number | null;
  location_lng: number | null;
  emotion: string | null;
  intensity: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

/* -------------------------- Helpers --------------------------- */
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
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return { start, end };
};

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

/* ------------------------------ GET --------------------------- */
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const { userId } = await getAuthOrThrow();

    const supabase = sb();
    const url = new URL(req.url);
    const year = parseInt(url.searchParams.get("year") || new Date().getUTCFullYear().toString(), 10);
    const month = parseInt(url.searchParams.get("month") || new Date().getUTCMonth().toString(), 10);

    const { start, end } = monthRangeUTC(year, month);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Daily moods
    const { data: moods, error: moodsErr } = await supabase
      .from("daily_mood")
      .select("id,user_id,date,emotion,intensity,fruit,notes,created_at,updated_at")
      .eq("user_id", userId)
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date", { ascending: true });
    if (moodsErr) throw moodsErr;

    // Journal entries
    const { data: journals, error: journalsErr } = await supabase
      .from("journal_entries")
      .select("id,user_id,title,content,date,mood,tags,is_private,created_at,updated_at,fruit")
      .eq("user_id", userId)
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date", { ascending: true });
    if (journalsErr) throw journalsErr;

    // Events
    const { data: events, error: eventsErr } = await supabase
      .from("calendar_events")
      .select(
        `
        id,
        user_id,
        date,
        title,
        location:location_label,
        location_lat,
        location_lng,
        emotion,
        intensity,
        notes,
        created_at,
        updated_at
      `
      )
      .eq("user_id", userId)
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date", { ascending: true });
    if (eventsErr) throw eventsErr;

    // Chat sessions
    const { data: sessions, error: sessionsErr } = await supabase
      .from("chat_sessions")
      .select("session_id,user_id,started_at,message_count")
      .eq("user_id", userId)
      .gte("started_at", startISO)
      .lte("started_at", endISO)
      .order("started_at", { ascending: true });
    if (sessionsErr) throw sessionsErr;

    // Chat messages for those sessions
    const sessionIds = (sessions || []).map((s) => s.session_id);
    let messages: any[] = [];
    if (sessionIds.length) {
      const { data: msgRows, error: msgErr } = await supabase
        .from("chat_messages")
        .select("session_id,emotion,intensity,created_at")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: true });
      if (msgErr) throw msgErr;
      messages = msgRows || [];
    }

    // Group messages by session
    const msgsBySession = new Map<string, any[]>();
    for (const m of messages) {
      const arr = msgsBySession.get(m.session_id) || [];
      arr.push(m);
      msgsBySession.set(m.session_id, arr);
    }

    // Build day buckets
    const calendarData: Record<string, any> = {};

    // moods
    for (const mood of moods || []) {
      const key = dateKeyUTC(new Date(mood.date));
      calendarData[key] = {
        ...(calendarData[key] || {}),
        mood: {
          emotion: mood.emotion,
          intensity: mood.intensity,
          fruit: mood.fruit || (mood.emotion ? fruitIdForEmotion(mood.emotion) : null),
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

    // events
    for (const ev of (events as CalendarEventRow[]) || []) {
      const key = dateKeyUTC(new Date(ev.date));
      if (!calendarData[key]) calendarData[key] = {};
      if (!calendarData[key].events) calendarData[key].events = [];
      calendarData[key].events.push({
        id: ev.id,
        title: ev.title,
        location: ev.location,
        location_lat: ev.location_lat,
        location_lng: ev.location_lng,
        emotion: ev.emotion,
        intensity: ev.intensity,
        notes: ev.notes,
        timestamp: new Date(ev.date).toISOString(),
      });
    }

    // chat sessions
    for (const s of sessions || []) {
      const key = dateKeyUTC(new Date(s.started_at));
      if (!calendarData[key]) calendarData[key] = {};
      if (!calendarData[key].chatSessions) calendarData[key].chatSessions = [];

      const msgs = msgsBySession.get(s.session_id) || [];
      const counts: Record<string, number> = {};
      for (const m of msgs) {
        if (m?.emotion) counts[m.emotion] = (counts[m.emotion] || 0) + 1;
      }
      const dominantEmotion =
        Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] || "neutral";

      let minutes = 0;
      if (msgs.length >= 2) {
        const first = +new Date(msgs[0].created_at);
        const last = +new Date(msgs[msgs.length - 1].created_at);
        minutes = Math.max(0, Math.round((last - first) / 60000));
      }
      const fmt = minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

      calendarData[key].chatSessions.push({
        id: s.session_id,
        duration: fmt,
        messagesCount: msgs.length,
        dominantEmotion,
        timestamp: new Date(s.started_at).toISOString(),
      });
    }

    // stats
    const daysTracked = (moods || []).length;
    const averageMood =
      daysTracked > 0
        ? Math.round(((moods || []).reduce((sum, m) => sum + (m.intensity ?? 0), 0) / daysTracked) * 10) / 10
        : 0;

    let bestDay: any = null;
    if (moods?.length) {
      const best = moods.reduce((b, c) => (c.intensity > b.intensity ? c : b));
      bestDay = {
        date: new Date(best.date).toISOString(),
        emotion: best.emotion,
        intensity: best.intensity,
        fruit: best.fruit || fruitIdForEmotion(best.emotion),
        notes: best.notes ?? undefined,
      };
    }

    const emotionDistribution = (moods || []).reduce((acc: Record<string, number>, m: any) => {
      acc[m.emotion] = (acc[m.emotion] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      calendarData,
      stats: {
        daysTracked,
        averageMood,
        journalEntries: (journals || []).length,
        chatSessions: (sessions || []).length,
        events: ((events as CalendarEventRow[]) || []).length,
        bestDay,
        emotionDistribution,
      },
    });
});

/* ------------------------------ POST -------------------------- */
// Upsert Daily Mood for a given day
export const POST = withCORS(withErrorHandling(async function POST(req: NextRequest) {
  const { userId } = await getAuthOrThrow();
    if (!userId) throw new AppError("unauthorized", "Unauthorized", 401);
    // Limit calendar write ops to 30/min/user
    {
      const limited = await guardRate(req, { key: "calendar-write", limit: 30, windowMs: 60_000 });
      if (limited) return limited;
    }

    // CSRF
    {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }

    const supabase = sb();
    const body = await req.json();
    const { date, emotion, intensity, notes } = body || {};

    if (!date || !emotion || intensity == null) {
      throw new AppError("bad_request", "date, emotion, and intensity are required", 400);
    }

    const d = fromISO(String(date));
    const normalized = toUTCStartOfDay(d);
    const fruit = fruitIdForEmotion(String(emotion));
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("daily_mood")
      .upsert(
        [
          {
            id: randomUUID(),
            user_id: userId,
            date: normalized.toISOString(),
            emotion: String(emotion),
            intensity,
            fruit,
            notes: notes ? String(notes) : null,
            created_at: nowIso,
            updated_at: nowIso,
          },
        ],
        { onConflict: "user_id,date", ignoreDuplicates: false }
      )
      .select("id,user_id,date,emotion,intensity,fruit,notes")
      .single();
    if (error) throw error;

    return NextResponse.json({
      success: true,
      mood: {
        id: data.id,
        userId: data.user_id,
        date: data.date,
        emotion: data.emotion,
        intensity: data.intensity,
        fruit: data.fruit,
        notes: data.notes,
      },
    });
}), { credentials: true });

/* ----------------------------- DELETE ------------------------- */
// Delete Daily Mood for a given day (UTC day window)
export const DELETE = withCORS(withErrorHandling(async function DELETE(req: NextRequest) {
  const { userId } = await getAuthOrThrow();
    if (!userId) throw new AppError("unauthorized", "Unauthorized", 401);
    // Limit calendar write ops to 30/min/user
    {
      const limited = await guardRate(req, { key: "calendar-write", limit: 30, windowMs: 60_000 });
      if (limited) return limited;
    }

    // CSRF
    {
      const r = await assertSameOrigin(req);
      if (r) return r;
      const r2 = assertDoubleSubmit(req);
      if (r2) return r2;
    }

    const supabase = sb();
  const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
  if (!dateParam) throw new AppError("bad_request", "date parameter is required", 400);

    const d = fromISO(dateParam);
    const dayStart = toUTCStartOfDay(d);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayStart.getUTCDate() + 1);

    const { error } = await supabase
      .from("daily_mood")
      .delete()
      .eq("user_id", userId)
      .gte("date", dayStart.toISOString())
      .lt("date", dayEnd.toISOString());
    if (error) throw error;

    return NextResponse.json({ success: true });
}), { credentials: true });
