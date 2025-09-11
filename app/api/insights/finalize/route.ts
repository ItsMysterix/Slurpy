// app/api/insights/finalize/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyInsightsUpdate } from "@/lib/sse-bus";

/* ---------------- Supabase ---------------- */
function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const isRelNotExist = (err: any) =>
  !!err && (err.code === "42P01" || /relation .* does not exist/i.test(err.message || ""));

/* ---------------- Helpers ---------------- */
type Msg = {
  userId?: string;
  user_id?: string;
  role?: string;
  content?: string;
  text?: string;
  timestamp?: string;
  created_at?: string;
  topics?: string[] | string | null;
  themes?: any;
  emotion?: string | null;
  intensity?: number | null; // 0..1 (or 1..10 in some legacy data)
  sessionId?: string;
  session_id?: string;
};

const POS = new Set([
  "joy","excited","hopeful","content","energetic","happy","peaceful","grateful","calm"
]);
const NEG = new Set([
  "sad","angry","anxious","worried","stressed","fear","panic","resentful","frustrated"
]);

const toUTCStartOfDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function emotionValence(emotion: string | null | undefined, intensity01: number | null | undefined) {
  const e = (emotion || "").toLowerCase();
  const i = Math.max(0, Math.min(1, Number(intensity01 ?? 0)));
  if (POS.has(e)) return +i;
  if (NEG.has(e)) return -i;
  return 0;
}
function parseTopics(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === "object") {
    // jsonb object/array → flatten strings
    try {
      const arr = Array.isArray(raw) ? raw : Object.values(raw as any);
      return arr.filter((x: any) => typeof x === "string");
    } catch {
      return [];
    }
  }
  return [];
}
const coalesceTs = (m: Msg) => m.timestamp || m.created_at || null;
const contentOf = (m: Msg) => (m.content ?? m.text ?? "").toString();
const getUserId = (all: Msg[]) =>
  (all.find((m) => m.user_id)?.user_id ||
    all.find((m) => m.userId)?.userId ||
    null);

function fruitForEmotion(e: string) {
  const map: Record<string, string> = {
    joy: "🥭", happy: "🍊", excited: "🍍", content: "🍇", grateful: "🍇",
    peaceful: "🫐", calm: "🥝", sad: "🌰", angry: "🔥", anxious: "🍌",
    worried: "🍐", neutral: "🍎",
  };
  return map[e?.toLowerCase()] || "🍎";
}

/* --------------------------------- POST --------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const supabase = sb();
    const { sessionId, endedAt, hints } = await req.json().catch(() => ({}));
    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

    /* ------------ 1) Fetch all messages for the session ----------------- */
    // Prefer snake_case table
    let msgs: Msg[] = [];
    {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("user_id,role,content,emotion,intensity,themes,created_at,session_id")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (error && !isRelNotExist(error)) throw error;

      if (data) {
        msgs = data as Msg[];
      } else {
        // Fallback to legacy PascalCase table/columns
        const r2 = await supabase
          .from("ChatMessage")
          .select("userId,role,content,text,emotion,intensity,topics,timestamp,sessionId,createdAt")
          .eq("sessionId", sessionId)
          .order("timestamp", { ascending: true });
        if (r2.error) throw r2.error;

        msgs = (r2.data || []).map((m: any) => ({
          userId: m.userId,
          role: m.role,
          content: m.content ?? m.text,
          emotion: m.emotion,
          intensity: m.intensity,
          topics: m.topics,
          timestamp: m.timestamp ?? m.createdAt,
          sessionId: m.sessionId,
        }));
      }
    }

    if (!Array.isArray(msgs) || !msgs.length) {
      // Nothing to finalize; still return ok so caller doesn't error.
      return NextResponse.json({ ok: true, session: { sessionId, messageCount: 0 } });
    }

    const all = msgs;

    const endISO =
      (endedAt as string) ||
      coalesceTs(all[all.length - 1] || {}) ||
      new Date().toISOString();
    const startISO = coalesceTs(all[0] || { timestamp: endISO })!;
    const start = new Date(startISO);
    const end = new Date(endISO);
    const minutes = Math.max(0, Math.round((+end - +start) / 60000));
    const messageCount = all.length;

    const emoCounts = new Map<string, number>();
    for (const m of all) {
      const e = (m.emotion || "").toLowerCase();
      if (e) emoCounts.set(e, (emoCounts.get(e) || 0) + 1);
    }
    const hinted = Array.isArray(hints) ? hints.slice(-1)[0]?.label?.toLowerCase() : undefined;
    const dominant = [...emoCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || hinted || "neutral";

    // average intensity for dominant emotion; normalize if values look like 1..10
    const intensities = all
      .filter((m) => (m.emotion || "").toLowerCase() === dominant)
      .map((m) => Number(m.intensity ?? 0))
      .filter((n) => Number.isFinite(n))
      .map((v) => (v > 1.0001 ? Math.max(1, Math.min(10, v)) / 10 : Math.max(0, Math.min(1, v))));
    const avgIntensity01 = intensities.length
      ? Math.max(0, Math.min(1, intensities.reduce((a, b) => a + b, 0) / intensities.length))
      : 0.5;

    const valence = emotionValence(dominant, avgIntensity01);

    const topicsSet = new Set<string>();
    for (const m of all) {
      parseTopics((m as any).themes ?? m.topics).forEach((t) => topicsSet.add(t));
      (contentOf(m).match(/#([\p{L}\d_]+)/gu) ?? []).forEach((tag) => topicsSet.add(tag.slice(1)));
    }
    const topics = Array.from(topicsSet).slice(0, 16);
    const userId = getUserId(all);

    /* ------------ 2) Update the session snapshot ------------------------ */
    // Snake_case schema: chat_sessions(session_id, user_id, started_at, last_emotion, themes, message_count)
    const updSnake = await supabase
      .from("chat_sessions")
      .update({
        last_emotion: dominant,
        themes: topics,
        message_count: messageCount,
      })
      .eq("session_id", sessionId);

    if (updSnake.error && isRelNotExist(updSnake.error)) {
      // Fallback to legacy ChatSession by sessionId
      const updLegacy = await supabase
        .from("ChatSession")
        .update({
          endTime: end.toISOString(),
          updatedAt: end.toISOString(),
          duration: minutes,
          messageCount,
          dominantEmotion: dominant,
          avgIntensity: avgIntensity01,
          valence,
          topics,
        })
        .eq("sessionId", sessionId);
      if (updLegacy.error) throw updLegacy.error;
    } else if (updSnake.error) {
      throw updSnake.error;
    }

    /* ------------ 3) Try to upsert a Daily Mood row (best-effort) ------- */
    if (userId) {
      const day = toUTCStartOfDay(end).toISOString();
      const intensity10 = Math.round(Math.max(1, Math.min(10, avgIntensity01 * 10)));
      const fruit = fruitForEmotion(dominant);

      // Prefer snake_case table if it exists
      const upSnake = await supabase
        .from("daily_mood")
        .upsert(
          [{ user_id: userId, date: day, emotion: dominant, intensity: intensity10, fruit }],
          { onConflict: "user_id,date", ignoreDuplicates: false }
        );

      if (upSnake.error && isRelNotExist(upSnake.error)) {
        // fallback to legacy table/columns
        const upLegacy = await supabase
          .from("DailyMood")
          .upsert(
            [{ userId, date: day, emotion: dominant, intensity: intensity10, fruit }],
            { onConflict: "userId,date", ignoreDuplicates: false } as any
          );
        // Ignore missing-constraint errors here; it's best-effort.
        if (upLegacy.error && !/on conflict/i.test(upLegacy.error.message || "")) {
          // don't throw; keep finalize resilient
          console.warn("DailyMood upsert (legacy) warning:", upLegacy.error.message);
        }
      } else if (upSnake.error && !/on conflict/i.test(upSnake.error.message || "")) {
        console.warn("daily_mood upsert warning:", upSnake.error.message);
      }
    }

    /* ------------ 4) Notify live insights listeners --------------------- */
    if (userId) {
      notifyInsightsUpdate({ userId, reason: "finalize", timeframe: "day" });
      notifyInsightsUpdate({ userId, reason: "finalize", timeframe: "week" });
    }

    /* ------------ 5) Return computed summary ---------------------------- */
    return NextResponse.json({
      ok: true,
      session: {
        sessionId,
        userId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        duration: minutes,
        messageCount,
        dominantEmotion: dominant,
        avgIntensity01,
        valence,
        topics,
      },
    });
  } catch (e: any) {
    console.error("Finalize error:", e?.message || e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
