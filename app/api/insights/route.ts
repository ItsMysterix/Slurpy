// app/api/insights/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { notifyInsightsUpdate } from "@/lib/sse-bus";

/* ---------------- Supabase ---------------- */
function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/* ---------------- Time (UTC) ---------------- */
const toUTCStartOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDaysUTC = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

type DateRange = { start: Date; end: Date };
function getUTCDateRange(timeframe: string): DateRange {
  const now = new Date();
  const today = toUTCStartOfDay(now);
  if (timeframe === "day") return { start: today, end: addDaysUTC(today, 1) };
  if (timeframe === "week") {
    const start = addDaysUTC(today, -today.getUTCDay()); // Sunday
    return { start, end: addDaysUTC(start, 7) };
  }
  if (timeframe === "month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  return { start, end };
}
const weekdayShortUTC = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);

/* ---------------- Emotion helpers ---------------- */
const POS = new Set(["joy","excited","hopeful","content","energetic","happy","peaceful","grateful","calm"]);
const NEG = new Set(["sad","angry","anxious","worried","stressed","fear","panic","resentful","frustrated"]);

function emotionValence(emotion: string, intensity01: number) {
  const e = (emotion || "").toLowerCase();
  const i = Math.max(0, Math.min(1, Number(intensity01 ?? 0)));
  if (POS.has(e)) return +i;
  if (NEG.has(e)) return -i;
  return 0;
}
function getEmotionColor(emotion: string) {
  const map: Record<string, string> = {
    happy: "bg-yellow-100 text-yellow-700",
    joy: "bg-yellow-100 text-yellow-700",
    excited: "bg-orange-100 text-orange-700",
    grateful: "bg-emerald-100 text-emerald-700",
    peaceful: "bg-green-100 text-green-700",
    calm: "bg-green-100 text-green-700",
    sad: "bg-blue-100 text-blue-700",
    angry: "bg-red-100 text-red-700",
    anxious: "bg-purple-100 text-purple-700",
    neutral: "bg-gray-100 text-gray-700",
  };
  return map[emotion?.toLowerCase()] || map.neutral;
}
function getFruitForEmotion(emotion: string) {
  const map: Record<string, string> = {
    joy: "🥭", happy: "🍊", grateful: "🍇", peaceful: "🌱", calm: "🍉",
    excited: "🍍", content: "🍑", hopeful: "🍇", energetic: "🍒",
    sad: "🌰", angry: "🔥", anxious: "🍌", worried: "🍐", neutral: "🍋",
  };
  return map[emotion?.toLowerCase()] || "🍋";
}
/** 1..10 mood score from emotion + intensity01 (0..1) */
function calculateMoodScore(emotion: string, intensity01: number) {
  const pos = ["joy","excited","hopeful","content","energetic","happy","peaceful","grateful","calm"];
  const neu = ["neutral","focused","thoughtful","curious","calm"];
  const e = (emotion || "").toLowerCase();
  if (pos.includes(e)) return Math.min(10, 5 + intensity01 * 5);
  if (neu.includes(e)) return 5 + (intensity01 - 0.5) * 2;
  return Math.max(1, 5 - intensity01 * 4);
}
function parseTopics(topics: unknown): string[] {
  if (Array.isArray(topics)) return topics.filter((t): t is string => typeof t === "string");
  if (typeof topics === "string") {
    try {
      const parsed = JSON.parse(topics);
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch { return []; }
  }
  return [];
}
function summarizeTopics(ts: string[]) {
  const uniq = Array.from(new Set(ts)).slice(0, 3);
  if (!uniq.length) return "No topics identified yet.";
  if (uniq.length === 1) return `Mostly about ${uniq[0]}.`;
  if (uniq.length === 2) return `About ${uniq[0]} and ${uniq[1]}.`;
  return `About ${uniq[0]}, ${uniq[1]}, and ${uniq[2]}.`;
}

/* ---------------- Types for response ---------------- */
type WeeklyTrend = { day: string; mood: number; sessions: number; date: string };
type EmotionBreakdown = { emotion: string; count: number; percentage: number; color: string };
type Insight = { title: string; description: string; icon: "TrendingUp" | "Heart" | "Brain" | "Calendar"; trend: "positive" | "neutral" | "negative" };
type CurrentSession = {
  duration: string;
  messagesExchanged: number;
  dominantEmotion: string;
  emotionIntensity: number; // 0..1
  fruit: string;
  topics: string[];
};
type HeaderShape = {
  periodLabel: string;
  totalMinutes: number;
  totalMessages: number;
  currentEmotion: string;
  currentFruit: string;
  currentIntensity01: number;
  currentValenceNeg1To1: number;
  topicSentence: string;
};

/* --------------------------------- POST ---------------------------------
   Persist ONE chat message (snake_case tables), then nudge SSE clients
---------------------------------------------------------------------------*/
export async function POST(req: NextRequest) {
  try {
    const supabase = sb();

    // Optional admin/testing bypass via header
    const headerKey = req.headers.get("x-slurpy-key") || req.headers.get("x-api-key");
    const secret = process.env.SLURPY_API_KEY;
    const bypass = Boolean(headerKey && secret && headerKey === secret);

    const { userId: clerkUserId } = await auth();
    const body = await req.json().catch(() => ({}));

    const sessionId: string = body?.sessionId;
    const message: string = body?.message ?? "";
    const role: "user" | "assistant" = body?.role ?? "user";
    const emotion: string | null = (body?.emotion ?? null) || null;
    const intensity: number | null = typeof body?.intensity === "number" ? body.intensity : null;
    const topics: string[] = parseTopics(body?.topics);

    const effectiveUserId: string =
      bypass ? (body?.userId || "") : (clerkUserId || body?.userId || "");

    if (!effectiveUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!sessionId || !message) return NextResponse.json({ error: "Missing sessionId or message" }, { status: 400 });

    const now = new Date().toISOString();

    // Ensure a session row exists (snake_case)
    await supabase
      .from("chat_sessions")
      .upsert(
        { session_id: sessionId, user_id: effectiveUserId, started_at: now, message_count: 0 },
        { onConflict: "session_id" }
      );

    // Insert message (snake_case)
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      user_id: effectiveUserId,
      role,
      content: message,
      emotion,
      intensity,                 // expected 0..1
      themes: topics,            // store under themes
      created_at: now,
    });

    // Optional: bump session snapshot (last_emotion, message_count)
    // You can keep this simple; insights recomputes counts anyway.
    await supabase
      .from("chat_sessions")
      .update({ last_emotion: emotion ?? null })
      .eq("session_id", sessionId);

    // 🔔 Notify live insights clients to refetch
    notifyInsightsUpdate({ userId: effectiveUserId });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("POST /api/insights error:", e?.message || e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ---------------------------------- GET ---------------------------------- */
export async function GET(req: NextRequest) {
  try {
    // Optional admin/testing bypass via header
    const headerKey = req.headers.get("x-slurpy-key") || req.headers.get("x-api-key");
    const secret = process.env.SLURPY_API_KEY;
    const bypass = Boolean(headerKey && secret && headerKey === secret);

    const { userId: clerkUserId } = await auth();
    const url = new URL(req.url);
    const timeframe = url.searchParams.get("timeframe") || "week";

    const effectiveUserId = bypass ? (url.searchParams.get("userId") || "") : (clerkUserId || "");
    if (!effectiveUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = sb();
    const { start, end } = getUTCDateRange(timeframe);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    /* -------- chat_sessions (snake_case) -------- */
    let { data: sessionsRaw } = await supabase
      .from("chat_sessions")
      .select("session_id,user_id,started_at,last_emotion,message_count,themes")
      .eq("user_id", effectiveUserId)
      .gte("started_at", startISO)
      .lt("started_at", endISO);

    const sessions = (sessionsRaw ?? []).map((s) => ({
      id: s.session_id as string,
      sessionId: s.session_id as string,
      userId: s.user_id as string,
      startTime: s.started_at as string,
      // chat_sessions has no explicit end; we’ll derive duration from messages
      duration: null as number | null,
      messageCount: (s.message_count as number) ?? 0,
      dominant: (s.last_emotion as string) ?? null,
      avgIntensity: null as number | null, // will compute from messages if needed
      topics: (s.themes as any) ?? null,
    }));

    /* -------- chat_messages (snake_case) -------- */
    let { data: messagesRaw } = await supabase
      .from("chat_messages")
      .select("id,session_id,user_id,role,content,emotion,intensity,themes,created_at")
      .eq("user_id", effectiveUserId)
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: true });

    const messages = (messagesRaw ?? []).map((m) => ({
      id: m.id,
      sessionId: m.session_id as string,
      userId: m.user_id as string,
      role: m.role as string,
      content: (m.content as string) ?? "",
      emotion: (m.emotion as string) ?? "neutral",
      intensity: typeof m.intensity === "number" ? m.intensity : Number(m.intensity ?? 0),
      timestamp: m.created_at as string,
      topics: (m.themes as any) ?? [],
    }));

    /* -------- daily_mood (optional; OK if missing) -------- */
    let moods: Array<{ userId: string; date: string; emotion: string; intensity: number; fruit: string }> = [];
    try {
      const r = await supabase
        .from("daily_mood")
        .select("user_id,date,emotion,intensity,fruit")
        .eq("user_id", effectiveUserId)
        .gte("date", startISO)
        .lt("date", endISO)
        .order("date", { ascending: true });

      moods =
        (r.data ?? []).map((m: any) => ({
          userId: m.user_id,
          date: m.date,
          emotion: m.emotion ?? "neutral",
          intensity: Number(m.intensity ?? 5), // 1..10 if present
          fruit: m.fruit ?? getFruitForEmotion(m.emotion ?? "neutral"),
        })) ?? [];
    } catch {
      // table does not exist → ignore
      moods = [];
    }

    /* ---------- Derive duration/messageCount from messages per session --------- */
    const bySession: Record<
      string,
      { first: number; last: number; count: number; emo: Record<string, { sum: number; n: number }> }
    > = {};
    for (const m of messages) {
      const sid = m.sessionId;
      const t = new Date(m.timestamp).getTime();
      if (!bySession[sid]) {
        bySession[sid] = { first: t, last: t, count: 0, emo: {} };
      } else {
        bySession[sid].first = Math.min(bySession[sid].first, t);
        bySession[sid].last = Math.max(bySession[sid].last, t);
      }
      bySession[sid].count += 1;

      if (typeof m.intensity === "number") {
        const e = (m.emotion || "neutral").toLowerCase();
        const bucket = bySession[sid].emo[e] || { sum: 0, n: 0 };
        bucket.sum += m.intensity;
        bucket.n += 1;
        bySession[sid].emo[e] = bucket;
      }
    }

    const sessionsWithDur = sessions.map((s) => {
      const agg = bySession[s.sessionId];
      if (!agg) return { ...s, duration: 0, messageCount: s.messageCount ?? 0 };
      const mins = Math.max(0, Math.round((agg.last - agg.first) / 60000));
      return { ...s, duration: mins, messageCount: agg.count };
    });

    /* --------------------- Current session summary --------------------- */
    let currentSession: CurrentSession = {
      duration: "0 minutes",
      messagesExchanged: 0,
      dominantEmotion: "neutral",
      emotionIntensity: 0.5,
      fruit: getFruitForEmotion("neutral"),
      topics: [],
    };

    const msgsR = messages; // already in-range
    if (sessionsWithDur.length || msgsR.length) {
      const totalDuration = sessionsWithDur.reduce((acc, s) => acc + (s.duration || 0), 0);

      // Prefer latest session by startTime
      const latest = sessionsWithDur
        .slice()
        .sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime())[0];

      let dominant = (latest?.dominant as string) || "";
      if (!dominant) {
        const emos = msgsR.map((m) => m.emotion).filter((e) => typeof e === "string" && e.length > 0);
        const counts = emos.reduce((a: Record<string, number>, e: string) => {
          a[e] = (a[e] || 0) + 1;
          return a;
        }, {});
        dominant = Object.entries(counts).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || "neutral";
      }

      // avg intensity for dominant (0..1)
      const ints = msgsR
        .filter((m) => (m.emotion || "").toLowerCase() === (dominant || "neutral").toLowerCase())
        .map((m) => Number(m.intensity))
        .filter((n) => Number.isFinite(n));
      const intensity01 = ints.length ? Math.max(0, Math.min(1, ints.reduce((a, b) => a + b, 0) / ints.length)) : 0.5;

      const sessionTopics =
        Array.isArray(latest?.topics) && latest.topics.length
          ? (latest.topics as string[]).filter((x) => typeof x === "string")
          : [...new Set(msgsR.flatMap((m) => parseTopics(m.topics)))];

      currentSession = {
        duration: totalDuration < 60 ? `${totalDuration} minutes` : `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m`,
        messagesExchanged: msgsR.length,
        dominantEmotion: String(dominant),
        emotionIntensity: Math.round(intensity01 * 10) / 10,
        fruit: getFruitForEmotion(String(dominant)),
        topics: sessionTopics.slice(0, 8),
      };
    }

    /* ------------------------ Weekly trends data ----------------------- */
    const weeklyTrends: WeeklyTrend[] = [];
    const days = timeframe === "day" ? 1 : timeframe === "week" ? 7 : 0;

    if (days) {
      const base = timeframe === "day"
        ? toUTCStartOfDay(new Date())
        : addDaysUTC(toUTCStartOfDay(new Date()), -new Date().getUTCDay());

      for (let i = 0; i < days; i++) {
        const dStart = addDaysUTC(base, i);
        const dEnd = addDaysUTC(dStart, 1);

        const dayMsgs = msgsR.filter((m) => {
          const t = new Date(m.timestamp);
          return t >= dStart && t < dEnd;
        });

        const daySessions = sessionsWithDur.filter((s) => {
          const t = s.startTime ? new Date(s.startTime) : null;
          return t && t >= dStart && t < dEnd;
        });

        // Prefer message-derived score; else daily_mood if available
        let moodScore = 5;
        if (dayMsgs.length) {
          const scored = dayMsgs
            .filter((m) => typeof m.emotion === "string" && typeof m.intensity === "number")
            .map((m) => calculateMoodScore(m.emotion, Math.max(0, Math.min(1, Number(m.intensity)))));
          if (scored.length) moodScore = scored.reduce((a, b) => a + b, 0) / scored.length;
        } else {
          const dayMoods = moods.filter((m) => {
            const t = new Date(m.date);
            return t >= dStart && t < dEnd;
          });
          if (dayMoods.length) {
            const scored = dayMoods.map((m) =>
              calculateMoodScore(m.emotion, Math.max(0, Math.min(1, Number(m.intensity) / 10)))
            );
            if (scored.length) moodScore = scored.reduce((a, b) => a + b, 0) / scored.length;
          }
        }

        weeklyTrends.push({
          day: timeframe === "day" ? "Today" : weekdayShortUTC(dStart),
          mood: Math.max(1, Math.min(10, Math.round(moodScore))),
          sessions: daySessions.length,
          date: dStart.toISOString().split("T")[0],
        });
      }
    } else {
      // Month/Year placeholders (kept simple)
      const buckets = timeframe === "month" ? 4 : 12;
      for (let i = 0; i < buckets; i++) {
        weeklyTrends.push({
          day:
            timeframe === "month"
              ? `Week ${i + 1}`
              : new Date(Date.UTC(new Date().getUTCFullYear(), i)).toLocaleDateString("en-US", {
                  month: "short",
                  timeZone: "UTC",
                }),
          mood: 6,
          sessions: 1,
          date: new Date().toISOString().split("T")[0],
        });
      }
    }

    /* ----------------------- Emotion breakdown ------------------------ */
    const emotionCounts = new Map<string, number>();
    for (const m of msgsR) {
      const e = m.emotion;
      if (typeof e === "string" && e) emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1);
    }
    for (const m of moods) {
      const e = m.emotion;
      if (typeof e === "string" && e) emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1);
    }
    const totalEmo = Array.from(emotionCounts.values()).reduce((a, b) => a + b, 0) || 1;

    const emotionBreakdown: EmotionBreakdown[] = Array.from(emotionCounts.entries())
      .map(([emotion, count]) => ({
        emotion,
        count,
        percentage: Math.round((count / totalEmo) * 100),
        color: getEmotionColor(emotion),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    /* ---------------------------- Insights ---------------------------- */
    const insights: Insight[] = (() => {
      const out: Insight[] = [];
      if (msgsR.length) {
        const sessionsCount = sessionsWithDur.length || 1;
        const avgPerSession = msgsR.length / sessionsCount;

        if (avgPerSession > 10)
          out.push({ title: "Deep Conversations", description: `Avg ${Math.round(avgPerSession)} msgs/session.`, icon: "TrendingUp", trend: "positive" });

        const emos = msgsR.map((m) => m.emotion).filter((e): e is string => typeof e === "string" && e.length > 0);
        const positiveSet = new Set(["joy","excited","hopeful","content","happy","peaceful","grateful","calm","energetic"]);
        if (emos.length) {
          const posCount = emos.filter((e) => positiveSet.has(e.toLowerCase())).length;
          const pct = Math.round((posCount / emos.length) * 100);
          if (pct >= 60)
            out.push({ title: "Positive Trend", description: `${pct}% of messages show positive emotion.`, icon: "TrendingUp", trend: "positive" });
          else if (pct <= 30)
            out.push({ title: "Support Opportunity", description: "Try mindfulness or stress-management prompts.", icon: "Heart", trend: "neutral" });
        }

        const topics = [...new Set(msgsR.flatMap((m) => parseTopics(m.topics)))];
        if (topics.length >= 6)
          out.push({ title: "Diverse Topics", description: `Covered ${topics.length} topics recently.`, icon: "Brain", trend: "positive" });
      }

      if (!out.length) {
        out.push({ title: "Getting Started", description: "Chat more to unlock personalized insights.", icon: "Calendar", trend: "neutral" });
      }
      return out;
    })();

    /* --------------------------- Aggregate header --------------------------- */
    const totalMinutes = sessionsWithDur.reduce((a, s) => a + (s.duration || 0), 0);
    const totalMessages = msgsR.length;

    // Aggregate valence from messages
    const valencesFromMsgs = msgsR
      .map((m) => emotionValence(m.emotion, Number(m.intensity ?? 0)))
      .filter((v) => Number.isFinite(v));

    // Current emotion/intensity from latest session or messages
    let currentEmotion = "neutral";
    let currentIntensity01 = 0.5;

    if (sessionsWithDur.length) {
      const latest = sessionsWithDur
        .slice()
        .sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime())[0];
      if (latest?.dominant) currentEmotion = String(latest.dominant);
      if (typeof latest?.avgIntensity === "number") currentIntensity01 = Math.max(0, Math.min(1, Number(latest.avgIntensity)));
    }
    if (!sessionsWithDur.length && msgsR.length) {
      const byEmo = new Map<string, number>();
      msgsR.forEach((m) => {
        const e = (m.emotion || "neutral").toLowerCase();
        byEmo.set(e, (byEmo.get(e) || 0) + 1);
      });
      currentEmotion = [...byEmo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

      const ints = msgsR
        .filter((m) => (m.emotion || "").toLowerCase() === currentEmotion)
        .map((m) => Number(m.intensity ?? 0))
        .filter((n) => Number.isFinite(n));
      if (ints.length) currentIntensity01 = Math.max(0, Math.min(1, ints.reduce((a, b) => a + b, 0) / ints.length));
    }

    const currentValenceNeg1To1 = valencesFromMsgs.length
      ? (valencesFromMsgs.reduce((a, b) => a + b, 0) / valencesFromMsgs.length)
      : emotionValence(currentEmotion, currentIntensity01);

    const topicsUnion = [...new Set(msgsR.flatMap((m) => parseTopics(m.topics)))];
    const header: HeaderShape = {
      periodLabel: "", // client formats this
      totalMinutes,
      totalMessages,
      currentEmotion,
      currentFruit: getFruitForEmotion(currentEmotion),
      currentIntensity01: Math.round(currentIntensity01 * 100) / 100,
      currentValenceNeg1To1: Math.round(currentValenceNeg1To1 * 100) / 100,
      topicSentence: summarizeTopics(topicsUnion),
    };

    return NextResponse.json({
      // NEW primary shape
      header,
      trends: {
        last7Days: weeklyTrends.map((w) => ({
          date: w.date,
          label: w.day,
          // mood (1..10) → valence (-1..1)
          valence: Math.max(-1, Math.min(1, (Number(w.mood ?? 5) - 5) / 5)),
        })),
      },
      breakdown: {
        emotions: emotionBreakdown.map((e) => ({ emotion: e.emotion, count: e.count, percentage: e.percentage })),
        valence: [],
      },
      insights,

      // Back-compat
      currentSession,
      weeklyTrends,
      emotionBreakdown,
    });
  } catch (e: any) {
    console.error("Error in /api/insights:", e?.message || e, e?.stack);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
