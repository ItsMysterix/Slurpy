// app/api/insights/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PrismaClient } from "@prisma/client";

// If you use Prisma on Vercel/Next dev, keep a singleton
const g = global as unknown as { __PRISMA__?: PrismaClient };
export const prisma = g.__PRISMA__ ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__PRISMA__ = prisma;

// Ensure this route is not cached
export const dynamic = "force-dynamic";

// ---------- Types ----------
interface DateRange { start: Date; end: Date; }
interface WeeklyTrend { day: string; mood: number; sessions: number; date: string; }
interface EmotionBreakdown { emotion: string; count: number; percentage: number; color: string; }
interface Insight { title: string; description: string; icon: string; trend: "positive" | "neutral" | "negative"; }
interface CurrentSession {
  duration: string;
  messagesExchanged: number;
  dominantEmotion: string;
  emotionIntensity: number;
  fruit: string;
  topics: string[];
}

// ---------- Helpers ----------
function parseTopics(topics: unknown): string[] {
  if (Array.isArray(topics)) return topics.filter((t) => typeof t === "string");
  if (typeof topics === "string") {
    try {
      const parsed = JSON.parse(topics);
      return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
    } catch { return []; }
  }
  return [];
}

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function getDateRange(timeframe: string): DateRange {
  const now = new Date();
  const today = startOfDay(now);

  switch (timeframe) {
    case "day": {
      const start = today;
      const end = addDays(start, 1);
      return { start, end };
    }
    case "week": {
      // Sunday → Saturday
      const start = addDays(today, -today.getDay());
      const end = addDays(start, 7);
      return { start, end };
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

function getFruitForEmotion(emotion: string): string {
  const fruits: Record<string, string> = {
    joy: "🥭", joyful: "🥭",
    frustrated: "🍋",
    excited: "🍍",
    anxious: "🍌",
    angry: "🔥",
    aggressive: "🌶️",
    calm: "🍉",
    exhausted: "🫐",
    hopeful: "🍇",
    content: "🍑",
    focused: "🍎",
    energetic: "🍒",
    resilient: "🥝",
    worried: "🍐",
    sad: "🌰",
    thoughtful: "🍇",
    passionate: "🍎",
    neutral: "🍋",
    happy: "😊",
    peaceful: "🌱",
    curious: "🤔",
    grateful: "🙏",
  };
  return fruits[emotion?.toLowerCase()] || "🍋";
}

function val(v: unknown, d: number) { return typeof v === "number" && !Number.isNaN(v) ? v : d; }

// emotion ∈ ℝ, intensity ∈ [0,1] → 1..10 mood score
function calculateMoodScore(emotion: string, intensity: number): number {
  const e = (emotion || "").toLowerCase();
  const pos = ["joy","joyful","excited","hopeful","content","energetic","happy","peaceful","grateful"];
  const neu = ["calm","focused","thoughtful","curious","neutral"];
  if (pos.includes(e)) return Math.min(10, 5 + intensity * 5);      // 5..10
  if (neu.includes(e)) return 5 + (intensity - 0.5) * 2;            // ~4..6
  return Math.max(1, 5 - intensity * 4);                            // ~1..5
}

function getEmotionColor(emotion: string): string {
  const colorMap: Record<string, string> = {
    happy: "bg-yellow-100 text-yellow-700",
    joy: "bg-yellow-100 text-yellow-700",
    joyful: "bg-yellow-100 text-yellow-700",
    excited: "bg-orange-100 text-orange-700",
    sad: "bg-blue-100 text-blue-700",
    angry: "bg-red-100 text-red-700",
    anxious: "bg-purple-100 text-purple-700",
    calm: "bg-green-100 text-green-700",
    neutral: "bg-gray-100 text-gray-700",
  };
  return colorMap[emotion?.toLowerCase()] || "bg-gray-100 text-gray-700";
}

// ---------- Optional LLM insights over recent DB messages ----------
async function generateLLMInsightsViaRAG(
  rows: Array<{ role: string; content: string; emotion: string | null; intensity: number | null; timestamp: Date; topics: string[] }>,
  timeframe: string
): Promise<Insight[] | null> {
  try {
    if (!process.env.SLURPY_LLM_INSIGHTS || process.env.SLURPY_LLM_INSIGHTS === "0") return null;
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: key });

    const recent = rows
      .sort((a, b) => +b.timestamp - +a.timestamp)
      .slice(0, 60)
      .map(r => `- [${r.timestamp.toISOString()}] (${r.role}) ${r.content} {emotion=${r.emotion ?? "?"}, intensity=${r.intensity ?? "?"}, topics=${r.topics.join(",")}}`)
      .join("\n");

    const sys = `You are an analyst for a mental-health journaling app called Slurpy. 
Summarize key, actionable insights in 3-5 bullets. Tag each with a trend: positive | neutral | negative.
Prefer concrete observations (emotions, topics, changes, routines). Avoid medical claims.`;

    const prompt = `TIMEFRAME: ${timeframe}
RECENT CONVERSATION DATA:
${recent}

Return JSON with: [{ title, description, icon, trend }]. Choose an icon from: TrendingUp | Heart | Brain | Calendar.`;

    const completion = await openai.chat.completions.create({
      model: process.env.SLURPY_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" as any }
    });

    const text = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed.items || parsed.data || [];
    if (!Array.isArray(arr)) return null;

    // Sanitize
    const out: Insight[] = arr.slice(0, 5).map((x: any) => ({
      title: String(x?.title ?? "Insight"),
      description: String(x?.description ?? ""),
      icon: ["TrendingUp","Heart","Brain","Calendar"].includes(String(x?.icon)) ? String(x.icon) : "Brain",
      trend: ["positive","neutral","negative"].includes(String(x?.trend)) ? String(x.trend) as any : "neutral",
    }));
    return out.length ? out : null;
  } catch (e) {
    console.warn("LLM insights generation failed:", e);
    return null;
  }
}

// ---------- Calendar mood fetching (model-agnostic) ----------
/**
 * We don't know your exact Prisma model for calendar moods.
 * Set SLURPY_MOOD_MODEL to the model name, e.g. "MoodEntry", "DailyMood", "CalendarMood".
 * The model is expected to have:
 *   - a date/time field: "date" or "createdAt"
 *   - "emotion" (string)
 *   - "intensity" (number; either 1..10 or 0..1)
 */
async function fetchCalendarMoods(userId: string, start: Date, end: Date) {
  const modelName = process.env.SLURPY_MOOD_MODEL || "MoodEntry";
  const repo = (prisma as any)[modelName];
  if (!repo?.findMany) return [];

  // Try common date field names
  const whereBlock = {
    userId,
    OR: [
      { date: { gte: start, lt: end } },
      { createdAt: { gte: start, lt: end } },
    ],
  };

  let rows: any[] = [];
  try {
    rows = await repo.findMany({ where: whereBlock, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  } catch {
    // Try again with only createdAt filter
    try {
      rows = await repo.findMany({ where: { userId, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: "desc" } });
    } catch {
      rows = [];
    }
  }

  // Normalize
  return rows
    .map((r) => {
      const when: Date | null = r?.date ? new Date(r.date) : (r?.createdAt ? new Date(r.createdAt) : null);
      const emotion: string | null = typeof r?.emotion === "string" ? r.emotion : (typeof r?.mood === "string" ? r.mood : null);
      let intensity: number | null =
        typeof r?.intensity === "number" ? r.intensity :
        typeof r?.score === "number" ? r.score : null;

      if (intensity != null) {
        // If intensity seems 1..10, normalize to 0..1
        if (intensity > 1.0001) intensity = Math.max(1, Math.min(10, intensity)) / 10;
        intensity = Math.max(0, Math.min(1, intensity));
      }

      return when && emotion
        ? { timestamp: when, emotion, intensity: intensity ?? 0.6 }
        : null;
    })
    .filter(Boolean) as Array<{ timestamp: Date; emotion: string; intensity: number }>;
}

// ---------- Heuristic insights ----------
function generateHeuristicInsights(messages: any[], sessions: any[]): Insight[] {
  const insights: Insight[] = [];
  const totalMessages = messages.length;
  const avgPerSession = sessions.length ? totalMessages / sessions.length : 0;

  if (avgPerSession > 10) {
    insights.push({
      title: "Deep Conversations",
      description: `Your sessions average ${Math.round(avgPerSession)} messages, showing meaningful engagement with Slurpy.`,
      icon: "MessageCircle",
      trend: "positive",
    });
  }

  const emo = messages.map((m: any) => m.emotion).filter((e: any): e is string => typeof e === "string");
  const positive = emo.filter((e) => ["joy","joyful","excited","hopeful","content","happy","peaceful","grateful"].includes(e));
  if (emo.length > 0) {
    const pct = Math.round((positive.length / emo.length) * 100);
    insights.push({
      title: pct >= 60 ? "Positive Emotional Trend" : pct <= 30 ? "Support Opportunity" : "Balanced Pattern",
      description:
        pct >= 60
          ? `${pct}% of your conversations show positive emotions.`
          : pct <= 30
          ? "Consider exploring mindfulness techniques or discussing stress management strategies."
          : "Your emotional signals look balanced across recent sessions.",
      icon: pct >= 60 ? "TrendingUp" : pct <= 30 ? "Heart" : "Brain",
      trend: pct >= 60 ? "positive" : pct <= 30 ? "neutral" : "neutral",
    });
  }

  const allTopics = messages.flatMap((m: any) => parseTopics(m.topics));
  const uniqueTopics = [...new Set(allTopics)];
  if (uniqueTopics.length >= 5) {
    insights.push({
      title: "Diverse Conversations",
      description: `You've explored ${uniqueTopics.length} different topics, showing healthy emotional range.`,
      icon: "Brain",
      trend: "positive",
    });
  }

  if (!insights.length) {
    insights.push({
      title: "Getting Started",
      description: `Start more conversations to see personalized insights about your emotional patterns.`,
      icon: "Calendar",
      trend: "neutral",
    });
  }
  return insights;
}

// ---------- GET ----------
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const timeframe = url.searchParams.get("timeframe") || "week";
    const debug = url.searchParams.get("debug") === "1";

    const { start, end } = getDateRange(timeframe);

    // 1) Fetch from Prisma: sessions + messages
    const sessions = await prisma.chatSession.findMany({
      where: { userId, startTime: { gte: start, lt: end } },
      include: { messages: { orderBy: { timestamp: "desc" } } },
      orderBy: { startTime: "desc" },
    });

    const messages = await prisma.chatMessage.findMany({
      where: { userId, timestamp: { gte: start, lt: end } },
      orderBy: { timestamp: "desc" },
    });

    // 2) Also fetch calendar moods (if the model exists)
    const calendarMoods = await fetchCalendarMoods(userId, start, end);

    // ---------- Current session summary ----------
    let currentSession: CurrentSession = {
      duration: "0 minutes",
      messagesExchanged: 0,
      dominantEmotion: "neutral",
      emotionIntensity: 5,
      fruit: "🍋",
      topics: [],
    };

    if (sessions.length > 0 || messages.length > 0 || calendarMoods.length > 0) {
      const totalMessages = messages.length;

      // total duration from sessions (mins)
      const totalDuration = sessions.reduce((acc: number, s: any) => {
        if (typeof s.duration === "number") return acc + s.duration;
        const endTime = s.endTime || new Date();
        const mins = Math.max(0, Math.round((+endTime - +s.startTime) / 60000));
        return acc + mins;
      }, 0);

      // dominant emotion from union of chat messages + calendar moods
      const emotionList: string[] = [
        ...messages.map((m: any) => m.emotion).filter((e: any): e is string => typeof e === "string"),
        ...calendarMoods.map((m) => m.emotion),
      ];
      const emoCount = emotionList.reduce((a: Record<string, number>, e) => { a[e] = (a[e] || 0) + 1; return a; }, {});
      const dominantEmotion = Object.entries(emoCount).sort(([,a],[,b]) => (b as number) - (a as number))?.[0]?.[0] || "neutral";

      // avg intensity for dominant emotion (use chat + calendar)
      const relevantIntensities: number[] = [
        ...messages.filter((m: any) => m.emotion === dominantEmotion && typeof m.intensity === "number").map((m: any) => m.intensity as number),
        ...calendarMoods.filter(m => m.emotion === dominantEmotion).map(m => m.intensity),
      ];
      const avgIntensity01 = relevantIntensities.length
        ? relevantIntensities.reduce((x, y) => x + y, 0) / relevantIntensities.length
        : 0.5;

      const topics = messages.flatMap((m: any) => parseTopics(m.topics));
      const uniqTopics = [...new Set(topics)].slice(0, 8);

      currentSession = {
        duration: totalDuration > 60 ? `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m` : `${totalDuration} minutes`,
        messagesExchanged: totalMessages,
        dominantEmotion,
        emotionIntensity: Math.round(avgIntensity01 * 10) / 10,
        fruit: getFruitForEmotion(dominantEmotion),
        topics: uniqTopics,
      };
    }

    // ---------- Weekly (or daily) trends ----------
    const weeklyTrends: WeeklyTrend[] = [];
    if (timeframe === "day" || timeframe === "week") {
      const days = timeframe === "day" ? 1 : 7;
      for (let i = 0; i < days; i++) {
        const dayStart = addDays(start, i);
        const dayEnd = addDays(dayStart, 1);

        const dayMsgs = messages.filter((m: any) => m.timestamp >= dayStart && m.timestamp < dayEnd);
        const daySessions = sessions.filter((s: any) => s.startTime >= dayStart && s.startTime < dayEnd);
        const dayMoods = calendarMoods.filter((m) => m.timestamp >= dayStart && m.timestamp < dayEnd);

        // chat-driven mood
        let chatScore: number | null = null;
        const emoScored = dayMsgs.filter((m: any) => typeof m.emotion === "string" && typeof m.intensity === "number");
        if (emoScored.length) {
          const scores = emoScored.map((m: any) => calculateMoodScore(m.emotion, m.intensity));
          chatScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        }

        // calendar-driven mood
        let calScore: number | null = null;
        if (dayMoods.length) {
          const scores = dayMoods.map((m) => calculateMoodScore(m.emotion, m.intensity));
          calScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        }

        // combine (prefer chat if present, else calendar; or weighted avg if both)
        let moodScore = 5;
        if (chatScore != null && calScore != null) moodScore = (chatScore * 0.6 + calScore * 0.4);
        else if (chatScore != null) moodScore = chatScore;
        else if (calScore != null) moodScore = calScore;

        weeklyTrends.push({
          day: timeframe === "day" ? "Today" : dayStart.toLocaleDateString("en-US", { weekday: "short" }),
          mood: Math.round(moodScore),
          sessions: daySessions.length,
          date: dayStart.toISOString().split("T")[0],
        });
      }
    } else {
      // Month/year coarse view (still derived from actual data)
      // Split month into 4 weeks, year into 12 months
      const buckets = timeframe === "month" ? 4 : 12;
      for (let b = 0; b < buckets; b++) {
        const segStart = new Date(
          timeframe === "month" ? start.getFullYear() : start.getFullYear(),
          timeframe === "month" ? start.getMonth() : b,
          timeframe === "month" ? (1 + Math.floor((b * (end.getDate() - start.getDate())) / buckets)) : 1
        );
        const segEnd = timeframe === "month"
          ? addDays(segStart, Math.ceil((end.getDate() - start.getDate()) / buckets))
          : new Date(start.getFullYear(), b + 1, 1);

        const segMsgs = messages.filter((m: any) => m.timestamp >= segStart && m.timestamp < segEnd);
        const segMoods = calendarMoods.filter((m) => m.timestamp >= segStart && m.timestamp < segEnd);

        let segScore = 5;
        const msgScored = segMsgs.filter((m: any) => typeof m.emotion === "string" && typeof m.intensity === "number");
        const moodScored = segMoods;
        const scores = [
          ...msgScored.map((m: any) => calculateMoodScore(m.emotion, m.intensity)),
          ...moodScored.map((m) => calculateMoodScore(m.emotion, m.intensity)),
        ];
        if (scores.length) segScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        weeklyTrends.push({
          day: timeframe === "month" ? `W${b + 1}` : new Date(start.getFullYear(), b).toLocaleDateString("en-US", { month: "short" }),
          mood: Math.round(segScore),
          sessions: sessions.filter((s: any) => s.startTime >= segStart && s.startTime < segEnd).length,
          date: segStart.toISOString().split("T")[0],
        });
      }
    }

    // ---------- Emotion breakdown (chat + calendar) ----------
    const emoCounts = new Map<string, number>();
    for (const m of messages) {
      if (typeof (m as any).emotion === "string") emoCounts.set((m as any).emotion, (emoCounts.get((m as any).emotion) || 0) + 1);
    }
    for (const m of calendarMoods) {
      emoCounts.set(m.emotion, (emoCounts.get(m.emotion) || 0) + 1);
    }
    const totalEmo = Array.from(emoCounts.values()).reduce((a, b) => a + b, 0) || 1;

    const emotionBreakdown: EmotionBreakdown[] = Array.from(emoCounts.entries())
      .map(([emotion, count]) => ({
        emotion,
        count,
        percentage: Math.round((count / totalEmo) * 100),
        color: getEmotionColor(emotion),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // ---------- Insights ----------
    // Heuristics first
    let insights: Insight[] = generateHeuristicInsights(messages, sessions);

    // Try LLM overlay if enabled
    const llmRows = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
      emotion: m.emotion,
      intensity: m.intensity,
      timestamp: m.timestamp,
      topics: parseTopics(m.topics),
    }));
    const llm = await generateLLMInsightsViaRAG(llmRows, timeframe);
    if (llm && llm.length) {
      // Merge, keeping uniqueness by title
      const byTitle = new Map<string, Insight>();
      for (const it of [...llm, ...insights]) if (!byTitle.has(it.title)) byTitle.set(it.title, it);
      insights = Array.from(byTitle.values()).slice(0, 6);
    }

    const payload: any = { currentSession, weeklyTrends, emotionBreakdown, insights };

    if (debug) {
      payload.__debug = {
        timeframe,
        window: { start: start.toISOString(), end: end.toISOString() },
        counts: {
          sessions: sessions.length,
          messages: messages.length,
          calendarMoods: calendarMoods.length,
        },
        sample: {
          message: messages[0] ?? null,
          session: sessions[0]?.sessionId ?? null,
          calendarMood: calendarMoods[0] ?? null,
        },
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error fetching insights:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------- POST (ingest a single chat message) ----------
export async function POST(req: NextRequest) {
  try {
    // Optional service key to bypass Clerk for backend ingestion
    const headerKey = req.headers.get("x-slurpy-key") || req.headers.get("x-api-key");
    const secret = process.env.SLURPY_API_KEY || process.env.NEXT_PUBLIC_SLURPY_API_KEY;
    const hasServiceKey = Boolean(headerKey && secret && headerKey === secret);

    const { userId: clerkUserId } = await auth();
    if (!hasServiceKey && !clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, message, role, emotion, intensity, topics, userId: bodyUserId } = body ?? {};
    if (!sessionId || !message || !role) {
      return NextResponse.json({ error: "sessionId, message, and role are required" }, { status: 400 });
    }

    const effectiveUserId = (hasServiceKey ? bodyUserId : clerkUserId) as string;
    if (!effectiveUserId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // Ensure session row
    let session = await prisma.chatSession.findUnique({ where: { sessionId } });
    if (!session) {
      session = await prisma.chatSession.create({
        data: { userId: effectiveUserId, sessionId, startTime: new Date(), messageCount: 0 },
      });
    }

    // Store message
    const chatMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        userId: effectiveUserId,
        role,
        content: message,
        emotion: typeof emotion === "string" ? emotion : null,
        intensity: typeof intensity === "number" ? intensity : null, // expected 0..1
        topics: Array.isArray(topics) ? topics.filter((t: any) => typeof t === "string") : [],
      },
    });

    // Update session counters + end time
    await prisma.chatSession.update({
      where: { sessionId },
      data: { messageCount: { increment: 1 }, endTime: new Date() },
    });

    return NextResponse.json({ success: true, messageId: chatMessage.id }, { status: 201 });
  } catch (error) {
    console.error("Error storing chat message:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
