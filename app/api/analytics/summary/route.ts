// app/api/analytics/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getAuthOrThrow, UnauthorizedError } from "@/lib/auth-server";
import { createClient } from "@supabase/supabase-js";
import { createServerServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { z } from "@/lib/validate";
import { guardRate } from "@/lib/guards";

/* -------------------------- Supabase (server) -------------------------- */
function sb() {
  return createServerServiceClient();
}

/* --------------------------------- types -------------------------------- */
// NOTE: These match your DB (snake_case)
type DateRange = { start: Date; end: Date };
type WeeklyTrend = { day: string; mood: number; sessions: number; date: string };
type EmotionBreakdown = { emotion: string; count: number; percentage: number; color: string };
type Insight = { title: string; description: string; icon: string; trend: "positive" | "neutral" | "negative" };

type CurrentSession = {
  duration: string;               // aggregated mins across sessions in window (approx.)
  messagesExchanged: number;      // total msgs in window
  dominantEmotion: string;
  emotionIntensity: number;       // 0..1 normalized then rounded to 0.1
  fruit: string;
  topics: string[];
};

// chat_messages columns
type ChatMessageRow = {
  session_id: string;
  user_id: string;
  role: string;
  content: string;
  emotion: string | null;
  intensity: number | null;       // may be 0..1 or 1..10
  created_at: string;             // ISO
  themes: unknown | null;         // jsonb (array/object/nullable)
};

// chat_sessions columns
type ChatSessionRow = {
  session_id: string;
  user_id: string;
  started_at: string;             // ISO (timestamptz)
  last_emotion: string | null;
  themes: unknown | null;         // jsonb
  message_count: number | null;
};

/* -------------------------------- helpers -------------------------------- */
function parseTopics(themes: unknown): string[] {
  // Accept arrays of strings, stringified JSON, or objects with "topics" array
  if (Array.isArray(themes)) return themes.filter((t): t is string => typeof t === "string");

  if (typeof themes === "string") {
    try {
      const parsed = JSON.parse(themes);
      return parseTopics(parsed);
    } catch {
      return [];
    }
  }

  if (themes && typeof themes === "object") {
    const maybeTopics = (themes as any).topics;
    if (Array.isArray(maybeTopics)) {
      return maybeTopics.filter((t: any): t is string => typeof t === "string");
    }
    // Also accept an object of {tag: weight} → keys as topics
    const keys = Object.keys(themes as object);
    if (keys.length && keys.every((k) => typeof k === "string")) return keys.slice(0, 20);
  }

  return [];
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function getDateRange(timeframe: string): DateRange {
  const now = new Date();
  const today = startOfDay(now);
  switch (timeframe) {
    case "day":
      return { start: today, end: addDays(today, 1) };
    case "week": {
      const start = addDays(today, -today.getDay()); // Sunday
      return { start, end: addDays(start, 7) };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start, end };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear() + 1, 0, 1);
      return { start, end };
    }
    default:
      return getDateRange("week");
  }
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
    joy: "🥭", happy: "😊", grateful: "🍇", peaceful: "🌱", calm: "🍉",
    excited: "🍍", content: "🍑", hopeful: "🍇", energetic: "🍒",
    sad: "🌰", angry: "🔥", anxious: "🍌", worried: "🍐", neutral: "🍋",
  };
  return map[emotion?.toLowerCase()] || "🍋";
}

// emotion ∈ ℝ, intensity ∈ [0,1] → 1..10 mood score
function calculateMoodScore(emotion: string, intensity01: number): number {
  const e = (emotion || "").toLowerCase();
  const pos = ["joy","joyful","excited","hopeful","content","energetic","happy","peaceful","grateful","calm"];
  const neu = ["neutral","focused","thoughtful","curious","calm"];
  if (pos.includes(e)) return Math.min(10, 5 + intensity01 * 5);
  if (neu.includes(e)) return 5 + (intensity01 - 0.5) * 2;
  return Math.max(1, 5 - intensity01 * 4);
}

function generateHeuristicInsights(messages: ChatMessageRow[], sessions: ChatSessionRow[]): Insight[] {
  const out: Insight[] = [];
  const total = messages.length;
  const avgPerSession = sessions.length ? total / sessions.length : 0;

  if (avgPerSession > 10) {
    out.push({
      title: "Deep Conversations",
      description: `Avg ${Math.round(avgPerSession)} messages per session.`,
      icon: "MessageCircle",
      trend: "positive",
    });
  }

  const emos = messages.map((m) => m.emotion).filter((e): e is string => typeof e === "string");
  const pos = emos.filter((e) =>
    ["joy", "excited", "hopeful", "content", "happy", "peaceful", "grateful", "calm"].includes(e)
  );
  if (emos.length) {
    const pct = Math.round((pos.length / emos.length) * 100);
    if (pct >= 60) {
      out.push({ title: "Positive Trend", description: `${pct}% messages show positive emotion.`, icon: "TrendingUp", trend: "positive" });
    } else if (pct <= 30) {
      out.push({ title: "Support Opportunity", description: "Try mindfulness or stress-management prompts.", icon: "Heart", trend: "neutral" });
    }
  }

  const topics = [...new Set(messages.flatMap((m) => parseTopics(m.themes)))];
  if (topics.length >= 6) {
    out.push({ title: "Diverse Topics", description: `Covered ${topics.length} topics recently.`, icon: "Brain", trend: "positive" });
  }

  if (!out.length) out.push({ title: "Getting Started", description: "Chat more to unlock personalized insights.", icon: "Calendar", trend: "neutral" });
  return out;
}

/* ---------------------------------- GET --------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await getAuthOrThrow();
    // Rate limit analytics queries 30/min/user
    {
      const limited = await guardRate(req, { key: "analytics-summary", limit: 30, windowMs: 60_000 });
      if (limited) return limited;
    }

    const supabase = sb();
    const url = new URL(req.url);
    const Input = z
      .object({ timeframe: z.enum(["day", "week", "month", "year"]).default("week") })
      .strip();
    const parsed = Input.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    const timeframe = parsed.data.timeframe;
    const debug = url.searchParams.get("debug") === "1";

    const { start, end } = getDateRange(timeframe);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Sessions within window (match YOUR schema)
    const { data: sessions, error: sessErr } = await supabase
      .from("chat_sessions")
      .select("session_id,user_id,started_at,last_emotion,themes,message_count")
      .eq("user_id", userId)
      .gte("started_at", startISO)
      .lt("started_at", endISO)
      .order("started_at", { ascending: false });

    if (sessErr) throw sessErr;

    // Messages within window (created_at filter)
    const { data: messages, error: msgErr } = await supabase
      .from("chat_messages")
      .select("session_id,user_id,role,content,emotion,intensity,created_at,themes")
      .eq("user_id", userId)
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false });

    if (msgErr) throw msgErr;

    const msgs: ChatMessageRow[] = (messages || []) as ChatMessageRow[];
    const sess: ChatSessionRow[] = (sessions || []) as ChatSessionRow[];

    /* ---------------------- Current session summary ---------------------- */
    // We'll approximate "duration" by grouping messages per session and summing (max(created_at) - min(created_at)).
    // If a session has only a start and no messages, we treat duration as 0 for this window.
    let totalMinutes = 0;
    if (msgs.length) {
      const bySession = new Map<string, ChatMessageRow[]>();
      for (const m of msgs) {
        const arr = bySession.get(m.session_id) || [];
        arr.push(m);
        bySession.set(m.session_id, arr);
      }
      for (const arr of bySession.values()) {
        const times = arr.map((m) => +new Date(m.created_at)).sort((a, b) => a - b);
        if (times.length >= 2) {
          totalMinutes += Math.max(0, Math.round((times[times.length - 1] - times[0]) / 60000));
        }
      }
    }

    // dominant emotion from messages in window
    const emotionList: string[] = msgs
      .map((m) => m.emotion)
      .filter((e): e is string => typeof e === "string");
    const counts = emotionList.reduce<Record<string, number>>((a, e) => {
      a[e] = (a[e] || 0) + 1;
      return a;
    }, {});
    const dominantEmotion = Object.entries(counts).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || "neutral";

    // average intensity for dominant emotion (normalize to 0..1 if needed)
    const intensities: number[] = msgs
      .filter((m) => m.emotion === dominantEmotion && typeof m.intensity === "number")
      .map((m) => {
        const v = m.intensity as number;
        // normalize 1..10 → 0..1 if needed
        return v > 1.0001 ? Math.max(1, Math.min(10, v)) / 10 : Math.max(0, Math.min(1, v));
      });

    const avgIntensity01 =
      intensities.length > 0
        ? intensities.reduce<number>((a: number, b: number) => a + b, 0) / intensities.length
        : 0.5;

    const topics: string[] = [...new Set(msgs.flatMap((m) => parseTopics(m.themes)))].slice(0, 8);

    const currentSession: CurrentSession = {
      duration: totalMinutes > 60 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : `${totalMinutes} minutes`,
      messagesExchanged: msgs.length,
      dominantEmotion,
      emotionIntensity: Math.round(avgIntensity01 * 10) / 10,
      fruit: getFruitForEmotion(dominantEmotion),
      topics,
    };

    /* ----------------------------- Trends ------------------------------- */
    const weeklyTrends: WeeklyTrend[] = [];
    if (timeframe === "day" || timeframe === "week") {
      const days = timeframe === "day" ? 1 : 7;
      for (let i = 0; i < days; i++) {
        const dayStart = addDays(start, i);
        const dayEnd = addDays(dayStart, 1);

        const dayMsgs = msgs.filter((m) => {
          const t = new Date(m.created_at);
          return t >= dayStart && t < dayEnd;
        });
        const daySessions = sess.filter((s) => {
          const t = new Date(s.started_at);
          return t >= dayStart && t < dayEnd;
        });

        let moodScore = 5;
        const scored = dayMsgs
          .filter((m) => typeof m.emotion === "string" && typeof m.intensity === "number")
          .map((m) => {
            const v = m.intensity as number;
            const v01 = v > 1.0001 ? Math.max(1, Math.min(10, v)) / 10 : Math.max(0, Math.min(1, v));
            return calculateMoodScore(m.emotion as string, v01);
          });

        if (scored.length) {
          const avg = scored.reduce<number>((a: number, b: number) => a + b, 0) / scored.length;
          moodScore = Math.round(avg);
        }

        weeklyTrends.push({
          day: timeframe === "day" ? "Today" : dayStart.toLocaleDateString("en-US", { weekday: "short" }),
          mood: Math.max(1, Math.min(10, Math.round(moodScore))),
          sessions: daySessions.length,
          date: dayStart.toISOString().split("T")[0],
        });
      }
    } else {
      // coarse buckets for month/year
      const buckets = timeframe === "month" ? 4 : 12;
      for (let i = 0; i < buckets; i++) {
        const segStart =
          timeframe === "month"
            ? addDays(start, Math.floor((i * (end.getDate() - start.getDate())) / buckets))
            : new Date(start.getFullYear(), i, 1);
        const segEnd =
          timeframe === "month"
            ? addDays(start, Math.floor(((i + 1) * (end.getDate() - start.getDate())) / buckets))
            : new Date(start.getFullYear(), i + 1, 1);

        const segMsgs = msgs.filter((m) => {
          const t = new Date(m.created_at);
          return t >= segStart && t < segEnd;
        });
        const scored = segMsgs
          .filter((m) => typeof m.emotion === "string" && typeof m.intensity === "number")
          .map((m) => {
            const v = m.intensity as number;
            const v01 = v > 1.0001 ? Math.max(1, Math.min(10, v)) / 10 : Math.max(0, Math.min(1, v));
            return calculateMoodScore(m.emotion as string, v01);
          });

        const segScore = scored.length
          ? scored.reduce<number>((a: number, b: number) => a + b, 0) / scored.length
          : 6;

        weeklyTrends.push({
          day: timeframe === "month"
            ? `W${i + 1}`
            : new Date(start.getFullYear(), i).toLocaleDateString("en-US", { month: "short" }),
          mood: Math.round(segScore),
          sessions: sess.filter((s) => {
            const t = new Date(s.started_at);
            return t >= segStart && t < segEnd;
          }).length,
          date: segStart.toISOString().split("T")[0],
        });
      }
    }

    /* ----------------------- Emotion breakdown -------------------------- */
    const emotionCounts = msgs.reduce<Record<string, number>>((acc, m) => {
      if (typeof m.emotion === "string") {
        acc[m.emotion] = (acc[m.emotion] || 0) + 1;
      }
      return acc;
    }, {});
    const totalEmotionMsgs = Object.values(emotionCounts).reduce((a, b) => a + b, 0);

    const emotionBreakdown: EmotionBreakdown[] = Object.entries(emotionCounts)
      .map(([emotion, count]) => ({
        emotion,
        count,
        percentage: totalEmotionMsgs ? Math.round((count / totalEmotionMsgs) * 100) : 0,
        color: getEmotionColor(emotion),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    /* ----------------------------- Insights ----------------------------- */
    const insights = generateHeuristicInsights(msgs, sess);

    const payload: {
      currentSession: CurrentSession;
      weeklyTrends: WeeklyTrend[];
      emotionBreakdown: EmotionBreakdown[];
      insights: Insight[];
      __debug?: any;
    } = { currentSession, weeklyTrends, emotionBreakdown, insights };

    // Output contract and caps
    const Out = z.object({
      currentSession: z.object({
        duration: z.string(),
        messagesExchanged: z.number().int().min(0).max(1_000_000),
        dominantEmotion: z.string(),
        emotionIntensity: z.number().min(0).max(1),
        fruit: z.string().max(8),
        topics: z.array(z.string().max(64)).max(12),
      }),
      weeklyTrends: z.array(
        z.object({ day: z.string().max(16), mood: z.number().min(1).max(10), sessions: z.number().int().min(0).max(1000), date: z.string() })
      ).max(366),
      emotionBreakdown: z.array(
        z.object({ emotion: z.string().max(32), count: z.number().int().min(0).max(1_000_000), percentage: z.number().min(0).max(100), color: z.string().max(64) })
      ).max(12),
      insights: z.array(
        z.object({ title: z.string().max(200), description: z.string().max(500), icon: z.string().max(64), trend: z.enum(["positive","neutral","negative"]) })
      ).max(50),
      __debug: z.any().optional(),
    });
    const safe = Out.parse(payload);

    if (debug) {
      payload.__debug = {
        timeframe,
        window: { start: start.toISOString(), end: end.toISOString() },
        counts: { sessions: sess.length, messages: msgs.length },
        sample: {
          message: msgs[0] ?? null,
          session: sess[0]?.session_id ?? null,
        },
      };
    }

    return NextResponse.json(safe);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logger.error("GET /api/analytics/summary error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
