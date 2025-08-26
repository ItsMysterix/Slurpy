// app/api/analytics/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

/* -------------------------- Supabase (server) -------------------------- */
function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE; // server-only
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* --------------------------------- types -------------------------------- */
type DateRange = { start: Date; end: Date };
type WeeklyTrend = { day: string; mood: number; sessions: number; date: string };
type EmotionBreakdown = { emotion: string; count: number; percentage: number; color: string };
type Insight = { title: string; description: string; icon: string; trend: "positive" | "neutral" | "negative" };
type CurrentSession = {
  duration: string;
  messagesExchanged: number;
  dominantEmotion: string;
  emotionIntensity: number;
  fruit: string;
  topics: string[];
};

type ChatMessageRow = {
  sessionId: string;
  userId: string;
  role: string;
  content: string;
  emotion: string | null;
  intensity: number | null;
  timestamp: string; // ISO
  topics: string[] | null;
};

type ChatSessionRow = {
  id: string;
  sessionId: string;
  userId: string;
  startTime: string; // ISO
  endTime: string | null; // ISO
  duration: number | null; // minutes
  messageCount: number;
};

/* -------------------------------- helpers -------------------------------- */
function parseTopics(topics: unknown): string[] {
  if (Array.isArray(topics)) return topics.filter((t): t is string => typeof t === "string");
  if (typeof topics === "string") {
    try {
      const parsed = JSON.parse(topics);
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch {
      return [];
    }
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
      const start = addDays(today, -today.getDay()); // Sun
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

  const topics = [...new Set(messages.flatMap((m) => parseTopics(m.topics)))];
  if (topics.length >= 6) {
    out.push({ title: "Diverse Topics", description: `Covered ${topics.length} topics recently.`, icon: "Brain", trend: "positive" });
  }

  if (!out.length) out.push({ title: "Getting Started", description: "Chat more to unlock personalized insights.", icon: "Calendar", trend: "neutral" });
  return out;
}

/* ---------------------------------- GET --------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = sb();
    const url = new URL(req.url);
    const timeframe = url.searchParams.get("timeframe") || "week";
    const debug = url.searchParams.get("debug") === "1";

    const { start, end } = getDateRange(timeframe);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Sessions within window
    const { data: sessions, error: sessErr } = await supabase
      .from("ChatSession")
      .select("id,sessionId,userId,startTime,endTime,duration,messageCount")
      .eq("userId", userId)
      .gte("startTime", startISO)
      .lt("startTime", endISO)
      .order("startTime", { ascending: false });
    if (sessErr) throw sessErr;

    // Messages within window (filter by timestamp)
    const { data: messages, error: msgErr } = await supabase
      .from("ChatMessage")
      .select("sessionId,userId,role,content,emotion,intensity,timestamp,topics")
      .eq("userId", userId)
      .gte("timestamp", startISO)
      .lt("timestamp", endISO)
      .order("timestamp", { ascending: false });
    if (msgErr) throw msgErr;

    const msgs: ChatMessageRow[] = (messages || []) as ChatMessageRow[];
    const sess: ChatSessionRow[] = (sessions || []) as ChatSessionRow[];

    /* ---------------------- Current session summary ---------------------- */
    let currentSession: CurrentSession = {
      duration: "0 minutes",
      messagesExchanged: 0,
      dominantEmotion: "neutral",
      emotionIntensity: 5,
      fruit: "🍋",
      topics: [],
    };

    if (sess.length || msgs.length) {
      // total duration
      const totalDuration: number = sess.reduce<number>((acc: number, s: ChatSessionRow) => {
        if (typeof s.duration === "number") return acc + s.duration;
        const endTime = s.endTime ? new Date(s.endTime) : new Date();
        const mins = Math.max(0, Math.round((+endTime - +new Date(s.startTime)) / 60000));
        return acc + mins;
      }, 0);

      // dominant emotion
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
          // if looks like 1..10, normalize
          return v > 1.0001 ? Math.max(1, Math.min(10, v)) / 10 : Math.max(0, Math.min(1, v));
        });

      const avgIntensity01 =
        intensities.length > 0
          ? intensities.reduce<number>((a: number, b: number) => a + b, 0) / intensities.length
          : 0.5;

      const topics: string[] = [...new Set(msgs.flatMap((m) => parseTopics(m.topics)))].slice(0, 8);

      currentSession = {
        duration: totalDuration > 60 ? `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m` : `${totalDuration} minutes`,
        messagesExchanged: msgs.length,
        dominantEmotion,
        emotionIntensity: Math.round(avgIntensity01 * 10) / 10,
        fruit: getFruitForEmotion(dominantEmotion),
        topics,
      };
    }

    /* ----------------------------- Trends ------------------------------- */
    const weeklyTrends: WeeklyTrend[] = [];
    if (timeframe === "day" || timeframe === "week") {
      const days = timeframe === "day" ? 1 : 7;
      for (let i = 0; i < days; i++) {
        const dayStart = addDays(start, i);
        const dayEnd = addDays(dayStart, 1);

        const dayMsgs = msgs.filter((m) => {
          const t = new Date(m.timestamp);
          return t >= dayStart && t < dayEnd;
        });
        const daySessions = sess.filter((s) => {
          const t = new Date(s.startTime);
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
      // coarse for month/year
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
          const t = new Date(m.timestamp);
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
            const t = new Date(s.startTime);
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
    const totalEmotionMsgs = (Object.values(emotionCounts) as number[]).reduce((a, b) => a + b, 0);

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

    if (debug) {
      payload.__debug = {
        timeframe,
        window: { start: start.toISOString(), end: end.toISOString() },
        counts: { sessions: sess.length, messages: msgs.length },
        sample: {
          message: msgs[0] ?? null,
          session: sess[0]?.sessionId ?? null,
        },
      };
    }

    return NextResponse.json(payload);
  } catch (e) {
    console.error("GET /api/analytics/summary error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
