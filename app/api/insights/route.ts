// app/api/insights/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

/* ----------------------------- Types ----------------------------- */
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

/* ------------------------- Date utilities (UTC) ------------------------- */
const toUTCStartOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDaysUTC = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

function getUTCDateRange(timeframe: string): DateRange {
  const now = new Date();
  const today = toUTCStartOfDay(now);

  if (timeframe === "day") return { start: today, end: addDaysUTC(today, 1) };

  if (timeframe === "week") {
    // Week starts on Sunday (getUTCDay = 0..6)
    const start = addDaysUTC(today, -today.getUTCDay());
    return { start, end: addDaysUTC(start, 7) };
  }

  if (timeframe === "month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }

  // year
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  return { start, end };
}

const weekdayShortUTC = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);

/* -------------------------- Emotion helpers -------------------------- */
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

/**
 * Calculates a 1..10 mood score from emotion + intensity.
 * - ChatMessage.intensity is typically 0..1
 * - DailyMood.intensity is 1..10 (we rescale to 0..1 internally)
 */
function calculateMoodScore(emotion: string, intensity01: number) {
  const pos = ["joy", "excited", "hopeful", "content", "energetic", "happy", "peaceful", "grateful", "calm"];
  const neu = ["neutral", "focused", "thoughtful", "curious", "calm"];
  const e = (emotion || "").toLowerCase();

  if (pos.includes(e)) return Math.min(10, 5 + intensity01 * 5);        // 5..10
  if (neu.includes(e)) return 5 + (intensity01 - 0.5) * 2;               // ~4..6
  return Math.max(1, 5 - intensity01 * 4);                                // 1..5
}

function parseTopics(topics: unknown): string[] {
  if (Array.isArray(topics)) return topics.filter((t) => typeof t === "string");
  if (typeof topics === "string") {
    try {
      const parsed = JSON.parse(topics);
      return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

/* ------------------- Supabase (server; service role) ------------------- */
function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE env");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/* --------------------------------- GET --------------------------------- */
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
    if (!effectiveUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = sb();
    const { start, end } = getUTCDateRange(timeframe);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Fetch everything in parallel
    const [sessionsRes, messagesRes, moodsRes] = await Promise.all([
      supabase
        .from("ChatSession")
        .select("id, sessionId, userId, startTime, endTime, duration, messageCount")
        .eq("userId", effectiveUserId)
        .gte("startTime", startISO)
        .lt("startTime", endISO)
        .order("startTime", { ascending: false }),

      supabase
        .from("ChatMessage")
        .select("id, sessionId, userId, role, content, emotion, intensity, timestamp, topics")
        .eq("userId", effectiveUserId)
        .gte("timestamp", startISO)
        .lt("timestamp", endISO)
        .order("timestamp", { ascending: true }),

      supabase
        .from("DailyMood")
        .select("id, userId, date, emotion, intensity, fruit")
        .eq("userId", effectiveUserId)
        .gte("date", startISO)
        .lt("date", endISO)
        .order("date", { ascending: true }),
    ]);

    // Surface DB errors explicitly
    if (sessionsRes.error) {
      console.error("Supabase ChatSession error:", sessionsRes.error);
      return NextResponse.json({ error: "DB error: ChatSession" }, { status: 500 });
    }
    if (messagesRes.error) {
      console.error("Supabase ChatMessage error:", messagesRes.error);
      return NextResponse.json({ error: "DB error: ChatMessage" }, { status: 500 });
    }
    if (moodsRes.error) {
      console.error("Supabase DailyMood error:", moodsRes.error);
      return NextResponse.json({ error: "DB error: DailyMood" }, { status: 500 });
    }

    const sessions = sessionsRes.data ?? [];
    const messages = messagesRes.data ?? [];
    const dailyMoods = moodsRes.data ?? [];

    /* --------------------- Current session summary --------------------- */
    let currentSession: CurrentSession = {
      duration: "0 minutes",
      messagesExchanged: 0,
      dominantEmotion: "neutral",
      emotionIntensity: 0.5,
      fruit: getFruitForEmotion("neutral"),
      topics: [],
    };

    if (sessions.length || messages.length) {
      const totalDuration = sessions.reduce((acc: number, s: any) => {
        if (typeof s?.duration === "number") return acc + s.duration;
        const endTime = s?.endTime ? new Date(s.endTime) : new Date();
        const startTime = new Date(s.startTime);
        const mins = Math.max(0, Math.round((+endTime - +startTime) / 60000));
        return acc + mins;
      }, 0);

      const emotionList = messages
        .map((m: any) => m?.emotion)
        .filter((e: any): e is string => typeof e === "string" && e.length > 0);

      const counts = emotionList.reduce((a: Record<string, number>, e: string) => {
        a[e] = (a[e] || 0) + 1;
        return a;
      }, {});

      const dominant =
        Object.entries(counts).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || "neutral";

      const intensities = messages
        .filter((m: any) => m?.emotion === dominant && typeof m?.intensity === "number")
        .map((m: any) => Number(m.intensity)); // ChatMessage intensity expected 0..1

      const avgIntensity01 = intensities.length
        ? Math.max(0, Math.min(1, intensities.reduce((a, b) => a + b, 0) / intensities.length))
        : 0.5;

      const topics = [...new Set(messages.flatMap((m: any) => parseTopics(m?.topics)))].slice(0, 8);

      currentSession = {
        duration:
          totalDuration < 60 ? `${totalDuration} minutes` : `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m`,
        messagesExchanged: messages.length,
        dominantEmotion: dominant,
        emotionIntensity: Math.round(avgIntensity01 * 10) / 10, // 0..1 rounded to 0.1
        fruit: getFruitForEmotion(dominant),
        topics,
      };
    }

    /* ------------------------ Weekly trends data ----------------------- */
    const weeklyTrends: WeeklyTrend[] = [];
    if (timeframe === "day" || timeframe === "week") {
      const days = timeframe === "day" ? 1 : 7;
      const base = timeframe === "day"
        ? toUTCStartOfDay(new Date())
        : addDaysUTC(toUTCStartOfDay(new Date()), -new Date().getUTCDay());

      for (let i = 0; i < days; i++) {
        const dStart = addDaysUTC(base, i);
        const dEnd = addDaysUTC(dStart, 1);

        const dayMsgs = messages.filter((m: any) => {
          const t = new Date(m.timestamp);
          return t >= dStart && t < dEnd;
        });

        const daySessions = sessions.filter((s: any) => {
          const t = new Date(s.startTime);
          return t >= dStart && t < dEnd;
        });

        const dayMoods = dailyMoods.filter((m: any) => {
          const t = new Date(m.date);
          return t >= dStart && t < dEnd;
        });

        let moodScore = 5;
        if (dayMsgs.length) {
          const scored = dayMsgs
            .filter((m: any) => typeof m.emotion === "string" && typeof m.intensity === "number")
            .map((m: any) => calculateMoodScore(m.emotion, Math.max(0, Math.min(1, Number(m.intensity)))));
          if (scored.length) moodScore = scored.reduce((a, b) => a + b, 0) / scored.length;
        } else if (dayMoods.length) {
          // DailyMood.intensity is 1..10 → scale to 0..1
          const scored = dayMoods.map((m: any) =>
            calculateMoodScore(m.emotion, Math.max(0, Math.min(1, Number(m.intensity) / 10)))
          );
          if (scored.length) moodScore = scored.reduce((a, b) => a + b, 0) / scored.length;
        }

        weeklyTrends.push({
          day: timeframe === "day" ? "Today" : weekdayShortUTC(dStart),
          mood: Math.max(1, Math.min(10, Math.round(moodScore))),
          sessions: daySessions.length,
          date: dStart.toISOString().split("T")[0],
        });
      }
    } else {
      // For month/year: keep your simple placeholders (can be enhanced later)
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
    for (const m of messages) {
      const e = (m as any).emotion;
      if (typeof e === "string" && e) {
        emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1);
      }
    }
    for (const m of dailyMoods) {
      const e = (m as any).emotion;
      if (typeof e === "string" && e) {
        emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1);
      }
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
      if (messages.length) {
        const avgPerSession = sessions.length ? messages.length / sessions.length : 0;
        if (avgPerSession > 10)
          out.push({
            title: "Deep Conversations",
            description: `Avg ${Math.round(avgPerSession)} msgs/session.`,
            icon: "MessageCircle",
            trend: "positive",
          });

        const emos = messages
          .map((m: any) => m.emotion)
          .filter((e: any): e is string => typeof e === "string" && e.length > 0);

        const positiveSet = new Set([
          "joy",
          "excited",
          "hopeful",
          "content",
          "happy",
          "peaceful",
          "grateful",
          "calm",
          "energetic",
        ]);

        if (emos.length) {
          const posCount = emos.filter((e) => positiveSet.has(e.toLowerCase())).length;
          const pct = Math.round((posCount / emos.length) * 100);
          if (pct >= 60)
            out.push({
              title: "Positive Trend",
              description: `${pct}% of messages show positive emotion.`,
              icon: "TrendingUp",
              trend: "positive",
            });
          else if (pct <= 30)
            out.push({
              title: "Support Opportunity",
              description: "Try mindfulness or stress-management prompts.",
              icon: "Heart",
              trend: "neutral",
            });
        }

        const topics = [...new Set(messages.flatMap((m: any) => parseTopics(m.topics)))];
        if (topics.length >= 6)
          out.push({
            title: "Diverse Topics",
            description: `Covered ${topics.length} topics recently.`,
            icon: "Brain",
            trend: "positive",
          });
      }

      if (!out.length) {
        out.push({
          title: "Getting Started",
          description: "Chat more to unlock personalized insights.",
          icon: "Calendar",
          trend: "neutral",
        });
      }
      return out;
    })();

    return NextResponse.json({ currentSession, weeklyTrends, emotionBreakdown, insights });
  } catch (e: any) {
    console.error("Error in /api/insights:", e?.message || e, e?.stack);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
