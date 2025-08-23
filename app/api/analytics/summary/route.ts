// app/api/insights/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PrismaClient } from "@prisma/client";
import { notifyInsightsUpdate } from "@/lib/sse-bus";

const g = global as unknown as { __PRISMA__?: PrismaClient };
export const prisma = g.__PRISMA__ ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__PRISMA__ = prisma;

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

function startOfDay(date: Date, tz?: string) {
  // simplify: create local midnight in that tz minus offset guess
  // avoids heavy deps; good enough for UI buckets
  const d = new Date(date);
  const local = new Date(
    d.toLocaleString("en-US", { timeZone: tz || "UTC" })
  );
  return new Date(local.getFullYear(), local.getMonth(), local.getDate());
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function getDateRange(timeframe: string, tz?: string): DateRange {
  const now = new Date();
  const today = startOfDay(now, tz);

  if (timeframe === "day") return { start: today, end: addDays(today, 1) };

  if (timeframe === "week") {
    const weekStart = addDays(today, -today.getDay());   // Sunday
    return { start: weekStart, end: addDays(weekStart, 7) };
  }

  if (timeframe === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { start, end };
  }

  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear() + 1, 0, 1);
  return { start, end };
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
function calculateMoodScore(emotion: string, intensity: number) {
  const pos = ["joy","excited","hopeful","content","energetic","happy","peaceful","grateful","calm"];
  const neu = ["neutral","focused","thoughtful","curious","calm"];
  if (pos.includes((emotion || "").toLowerCase())) return Math.min(10, 5 + intensity * 5);
  if (neu.includes((emotion || "").toLowerCase())) return 5 + (intensity - 0.5) * 2;
  return Math.max(1, 5 - intensity * 4);
}
function parseTopics(topics: unknown): string[] {
  if (Array.isArray(topics)) return topics.filter((t) => typeof t === "string");
  if (typeof topics === "string") {
    try { const p = JSON.parse(topics); return Array.isArray(p) ? p.filter((t) => typeof t === "string") : []; }
    catch { return []; }
  }
  return [];
}
function generateInsights(messages: any[], sessions: any[]): Insight[] {
  const out: Insight[] = [];
  if (messages.length) {
    const total = messages.length;
    const avgPerSession = sessions.length ? total / sessions.length : 0;
    if (avgPerSession > 10) out.push({ title: "Deep Conversations", description: `Avg ${Math.round(avgPerSession)} msgs per session.`, icon: "MessageCircle", trend: "positive" });

    const emos = messages.map((m) => m.emotion).filter((e: any) => typeof e === "string");
    const pos = emos.filter((e: string) => ["joy","excited","hopeful","content","happy","peaceful","grateful","calm"].includes(e));
    if (emos.length) {
      const pct = Math.round((pos.length / emos.length) * 100);
      if (pct >= 60) out.push({ title: "Positive Trend", description: `${pct}% of messages show positive emotion.`, icon: "TrendingUp", trend: "positive" });
      else if (pct <= 30) out.push({ title: "Support Opportunity", description: "Try mindfulness or stress‑management prompts.", icon: "Heart", trend: "neutral" });
    }

    const topics = [...new Set(messages.flatMap((m) => parseTopics(m.topics)))];
    if (topics.length >= 6) out.push({ title: "Diverse Topics", description: `Covered ${topics.length} topics recently.`, icon: "Brain", trend: "positive" });
  }
  if (!out.length) out.push({ title: "Getting Started", description: "Chat more to unlock personalized insights.", icon: "Calendar", trend: "neutral" });
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const requestedUserId = url.searchParams.get("userId");
    const timeframe = url.searchParams.get("timeframe") || "week";
    const tz = url.searchParams.get("tz") || undefined;

    if (requestedUserId && requestedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { start, end } = getDateRange(timeframe, tz);

    const [sessions, messages] = await Promise.all([
      prisma.chatSession.findMany({
        where: { userId, startTime: { gte: start, lt: end } },
        include: { messages: false },
        orderBy: { startTime: "desc" },
      }),
      prisma.chatMessage.findMany({
        where: { userId, timestamp: { gte: start, lt: end } },
        orderBy: { timestamp: "asc" },
      }),
    ]);

    // Optional: read mood calendar if model exists
    let moodLogs: { date: Date; mood: number; emotion?: string }[] = [];
    const moodModel =
      (prisma as any).moodLog || (prisma as any).moodEntry || (prisma as any).moodCalendar;
    if (moodModel) {
      try {
        const rows = await moodModel.findMany({
          where: { userId, date: { gte: start, lt: end } },
          orderBy: { date: "asc" },
        });
        moodLogs = rows.map((r: any) => ({
          date: new Date(r.date),
          mood: typeof r.mood === "number" ? r.mood : (typeof r.score === "number" ? r.score : 5),
          emotion: r.emotion || r.label || undefined,
        }));
      } catch {
        // ignore if schema name differs
      }
    }

    // ----- Current session summary -----
    let currentSession: CurrentSession = {
      duration: "0 minutes",
      messagesExchanged: 0,
      dominantEmotion: "neutral",
      emotionIntensity: 5,
      fruit: "🍋",
      topics: [],
    };

    if (sessions.length || messages.length) {
      const totalDuration = sessions.reduce((acc, s: any) => {
        if (typeof s.duration === "number") return acc + s.duration;
        const endTime = s.endTime || new Date();
        const mins = Math.max(0, Math.round((+endTime - +s.startTime) / 60000));
        return acc + mins;
      }, 0);

      const emotionList = messages.map((m: any) => m.emotion).filter((e: any) => typeof e === "string");
      const counts = emotionList.reduce((a: Record<string, number>, e: string) => ((a[e] = (a[e] || 0) + 1), a), {});
      const dominant = Object.entries(counts).sort(([,a],[,b]) => (b as number) - (a as number))[0]?.[0] || "neutral";

      const intensities = messages
        .filter((m: any) => m.emotion === dominant && typeof m.intensity === "number")
        .map((m: any) => m.intensity as number);
      const avgIntensity = intensities.length ? intensities.reduce((a,b)=>a+b,0)/intensities.length : 0.5;

      const topics = [...new Set(messages.flatMap((m: any) => parseTopics(m.topics)))].slice(0, 8);

      currentSession = {
        duration: totalDuration > 60 ? `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m` : `${totalDuration} minutes`,
        messagesExchanged: messages.length,
        dominantEmotion: dominant,
        emotionIntensity: Math.round(avgIntensity * 10) / 10,
        fruit: getFruitForEmotion(dominant),
        topics,
      };
    }

    // ----- Weekly trends (chat + calendar) -----
    const weeklyTrends: WeeklyTrend[] = [];
    if (timeframe === "day" || timeframe === "week") {
      const days = timeframe === "day" ? 1 : 7;
      const weekStart = timeframe === "day" ? startOfDay(new Date(), tz) : addDays(startOfDay(new Date(), tz), -new Date().getDay());

      for (let i = 0; i < days; i++) {
        const dStart = addDays(weekStart, i);
        const dEnd = addDays(dStart, 1);

        const dayMsgs = messages.filter((m: any) => m.timestamp >= dStart && m.timestamp < dEnd);
        const daySessions = sessions.filter((s: any) => s.startTime >= dStart && s.startTime < dEnd);

        // Prefer chat-derived mood; otherwise fall back to calendar
        let moodScore = 5;
        if (dayMsgs.length) {
          const scored = dayMsgs
            .filter((m: any) => typeof m.emotion === "string" && typeof m.intensity === "number")
            .map((m: any) => calculateMoodScore(m.emotion, m.intensity));
          if (scored.length) moodScore = Math.round((scored.reduce((a,b)=>a+b,0)/scored.length) * 10) / 10;
        } else {
          const cal = moodLogs.find((r) => r.date >= dStart && r.date < dEnd);
          if (cal) moodScore = Math.round(cal.mood);
        }

        weeklyTrends.push({
          day: timeframe === "day" ? "Today" : dStart.toLocaleDateString("en-US", { weekday: "short" }),
          mood: Math.max(1, Math.min(10, Math.round(moodScore))),
          sessions: daySessions.length,
          date: dStart.toISOString().split("T")[0],
        });
      }
    } else {
      // keep coarse aggregates for month/year
      const buckets = timeframe === "month" ? 4 : 12;
      for (let i = 0; i < buckets; i++) {
        weeklyTrends.push({
          day: timeframe === "month" ? `Week ${i + 1}` : new Date(new Date().getFullYear(), i).toLocaleDateString("en-US", { month: "short" }),
          mood: 6,
          sessions: 1,
          date: new Date().toISOString().split("T")[0],
        });
      }
    }

    // ----- Emotion breakdown -----
    const emotionCounts = messages.reduce((acc: Record<string, number>, m: any) => {
      if (typeof m.emotion === "string") acc[m.emotion] = (acc[m.emotion] || 0) + 1;
      return acc;
    }, {});
    const totalEmotionMsgs = Object.values(emotionCounts).reduce((a, b) => a + b, 0);
    const emotionBreakdown: EmotionBreakdown[] = Object.entries(emotionCounts)
      .map(([emotion, count]) => ({
        emotion,
        count: count as number,
        percentage: totalEmotionMsgs ? Math.round(((count as number) / totalEmotionMsgs) * 100) : 0,
        color: getEmotionColor(emotion),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const insights = generateInsights(messages, sessions);

    return NextResponse.json({ currentSession, weeklyTrends, emotionBreakdown, insights });
  } catch (e) {
    console.error("insights GET error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const headerKey = req.headers.get("x-slurpy-key") || req.headers.get("x-api-key");
    const secret = process.env.SLURPY_API_KEY || process.env.NEXT_PUBLIC_SLURPY_API_KEY;
    const hasServiceKey = Boolean(headerKey && secret && headerKey === secret);

    const { userId: clerkUserId } = await auth();
    if (!hasServiceKey && !clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      sessionId,
      message,
      role,
      emotion,
      intensity,
      topics,
      assistantReaction,
      userId: bodyUserId,
    } = body ?? {};

    const effectiveUserId = (hasServiceKey ? bodyUserId : clerkUserId) as string;
    if (!sessionId || !message || !role || !effectiveUserId) {
      return NextResponse.json({ error: "sessionId, message, role are required" }, { status: 400 });
    }

    let session = await prisma.chatSession.findUnique({ where: { sessionId } });
    if (!session) {
      session = await prisma.chatSession.create({
        data: { userId: effectiveUserId, sessionId, startTime: new Date(), messageCount: 0 },
      });
    }

    await prisma.chatMessage.create({
      data: {
        sessionId,
        userId: effectiveUserId,
        role,
        content: message,
        emotion: typeof emotion === "string" ? emotion : null,
        intensity: typeof intensity === "number" ? intensity : null,
        topics: Array.isArray(topics) ? topics.filter((t: any) => typeof t === "string") : [],
        assistantReaction: typeof assistantReaction === "string" ? assistantReaction : null,
        timestamp: new Date(),
      },
    });

    await prisma.chatSession.update({
      where: { sessionId },
      data: { messageCount: { increment: 1 }, endTime: new Date() },
    });

    try {
      notifyInsightsUpdate({ userId: effectiveUserId, reason: "message:created", timeframe: "week" });
    } catch {}

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    console.error("insights POST error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
