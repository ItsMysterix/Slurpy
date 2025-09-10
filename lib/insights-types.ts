// lib/insights-types.ts

/* ============================== Types ============================== */

export type TrendPoint = { date: string; label: string; valence: number }; // -1..1
export type EmotionSlice = { emotion: string; count: number; percentage: number };

export type InsightsResponse = {
  header: {
    periodLabel: string;          // UI-computed on page; can be empty from API
    totalMinutes: number;         // total minutes in selected period
    totalMessages: number;        // total messages in selected period
    currentEmotion: string;       // e.g., "anxious"
    currentFruit: string;         // not used for score; still handy for emoji fallback
    currentIntensity01: number;   // 0..1
    currentValenceNeg1To1: number;// -1..1
    topicSentence: string;        // one-liner summary of topics
  };
  trends: { last7Days: TrendPoint[] };
  breakdown: {
    emotions: EmotionSlice[];
    valence: { bucket: "negative" | "neutral" | "positive"; percentage: number }[];
  };
  insights: Array<{
    title: string;
    description: string;
    icon: "TrendingUp" | "Heart" | "Brain" | "Calendar";
    trend: "positive" | "neutral" | "negative";
    locked?: boolean;
    unlockHint?: string;
  }>;
  topics: Array<{ topic: string; count: number; lastSeenISO: string; href: string }>;
};

/* =========================== UI Helpers =========================== */

export function valenceLabel(v: number) {
  if (v <= -0.2) return "Negative";
  if (v >= 0.2) return "Positive";
  return "Neutral";
}

/** Tailwind classes for the Badge, tuned for your dark/glassy theme */
export function valenceClass(v: number): string {
  const neg =
    "bg-red-500/10 text-red-300 border-red-400/30 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/30";
  const neu =
    "bg-slate-800/60 text-slate-300 border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700/50";
  const pos =
    "bg-emerald-500/10 text-emerald-300 border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/30";

  if (!isFinite(v)) return neu;
  if (v <= -0.2) return neg;
  if (v >= 0.2) return pos;
  return neu;
}

/* ---------- Fruit/Icon mapping (files under /public) ---------- */
/* If a file isn't found, we fall back to /Slurpy.ico. */
const EMO_ICON_NAME: Record<string, string> = {
  // positive
  happy: "Mango Mania.ico",
  joy: "Mango Mania.ico",
  excited: "Pineapple punch.ico",
  energetic: "Cherry charge.ico",
  grateful: "Grape Expectations.ico",
  calm: "Watermelon Wave.ico",
  peaceful: "Watermelon Wave.ico",
  content: "Peachy Keen.ico",
  hopeful: "Kiwi Comeback.ico",
  // negative
  angry: "Fiery Guava.ico",
  frustrated: "Peer Pressure.ico",
  anxious: "Sour Lemon.ico",
  worried: "Sour Lemon.ico",
  stressed: "Spiky Papaya.ico",
  sad: "Strawberry Bliss.ico",
  // neutral/default
  neutral: "Slurpy.ico",
};

export function iconForEmotion(emotion: string) {
  const key = (emotion || "neutral").toLowerCase();
  const file = EMO_ICON_NAME[key] || EMO_ICON_NAME["neutral"];
  return `/${encodeURIComponent(file)}`;
}

/* ========================= Normalization ========================= */

export function normalizeInsights(api: any): InsightsResponse {
  // Even if API claims to be "new shape", fill safe defaults for optional fields.
  if (api?.header && api?.trends && api?.breakdown) {
    const header = api.header ?? {};
    const trends = api.trends ?? {};
    const breakdown = api.breakdown ?? {};
    const insightsArr = Array.isArray(api.insights) ? api.insights : [];
    const topicsArr = Array.isArray(api.topics) ? api.topics : [];

    return {
      header: {
        periodLabel: String(header.periodLabel ?? ""),
        totalMinutes: Number(header.totalMinutes ?? 0),
        totalMessages: Number(header.totalMessages ?? 0),
        currentEmotion: String(header.currentEmotion ?? "neutral"),
        currentFruit: String(header.currentFruit ?? "🍋"),
        currentIntensity01: Number(header.currentIntensity01 ?? 0.5),
        currentValenceNeg1To1: Number(header.currentValenceNeg1To1 ?? 0),
        topicSentence: String(header.topicSentence ?? "No topics identified yet."),
      },
      trends: {
        last7Days: Array.isArray(trends.last7Days) ? trends.last7Days : [],
      },
      breakdown: {
        emotions: Array.isArray(breakdown.emotions) ? breakdown.emotions : [],
        valence: Array.isArray(breakdown.valence) ? breakdown.valence : [
          { bucket: "negative", percentage: 0 },
          { bucket: "neutral",  percentage: 100 },
          { bucket: "positive", percentage: 0 },
        ],
      },
      insights: insightsArr.map((x: any) => ({
        title: String(x?.title ?? "Getting Started"),
        description: String(x?.description ?? "Chat more to unlock personalized insights."),
        icon: (x?.icon as any) ?? "Calendar",
        trend: (x?.trend as any) ?? "neutral",
        locked: Boolean(x?.locked ?? false),
        unlockHint: x?.unlockHint ? String(x.unlockHint) : undefined,
      })),
      topics: topicsArr,
    };
  }

  // Back-compat with the earlier /api/insights result
  const nowISO = new Date().toISOString();

  const cs = api?.currentSession ?? {};
  const weekly = Array.isArray(api?.weeklyTrends) ? api.weeklyTrends : [];
  const breakdown = Array.isArray(api?.emotionBreakdown) ? api.emotionBreakdown : [];
  const insights = Array.isArray(api?.insights) ? api.insights : [];

  const emotion = String(cs?.dominantEmotion ?? "neutral").toLowerCase();
  const intensity01 = Number(cs?.emotionIntensity ?? 0.5);
  const currentValence = emotionValence(emotion, intensity01);

  const last7Days: TrendPoint[] = weekly.map((w: any) => {
    // Old API uses mood 1..10 — map to valence in [-1..1]
    const mood = Number(w?.mood ?? 5);
    const v = Math.max(-1, Math.min(1, (mood - 5) / 5));
    return {
      date: String(w?.date ?? nowISO.slice(0, 10)),
      label: String(w?.day ?? "—"),
      valence: isFinite(v) ? v : 0,
    };
  });

  const topicsArr: string[] = Array.isArray(cs?.topics) ? cs.topics : [];
  const topicSentence = topicsArr.length ? summarizeTopics(topicsArr) : "No topics identified yet.";

  const valBuckets = valenceBuckets(last7Days.map((t) => t.valence));

  const topics = topicsArr.slice(0, 12).map((t) => ({
    topic: t,
    count: 1,
    lastSeenISO: nowISO,
    href: `/chat?topic=${encodeURIComponent(t)}`,
  }));

  return {
    header: {
      periodLabel: "",
      totalMinutes: parseDurationToMinutes(String(cs?.duration ?? "0 minutes")),
      totalMessages: Number(cs?.messagesExchanged ?? 0),
      currentEmotion: emotion || "neutral",
      currentFruit: String(cs?.fruit ?? "🍋"),
      currentIntensity01: intensity01,
      currentValenceNeg1To1: currentValence,
      topicSentence,
    },
    trends: { last7Days },
    breakdown: {
      emotions: breakdown.map((e: any) => ({
        emotion: String(e?.emotion ?? "neutral"),
        count: Number(e?.count ?? 0),
        percentage: Number(e?.percentage ?? 0),
      })),
      valence: valBuckets,
    },
    insights: insights.map((x: any) => ({
      title: String(x?.title ?? "Getting Started"),
      description: String(x?.description ?? "Chat more to unlock personalized insights."),
      icon: (x?.icon as any) ?? "Calendar",
      trend: (x?.trend as any) ?? "neutral",
      locked: Boolean(x?.locked ?? false),
      unlockHint: x?.unlockHint ? String(x.unlockHint) : undefined,
    })),
    topics,
  };
}

/* ========================= Math & Parsing ========================= */

export function emotionValence(emotion: string, intensity01: number) {
  const pos = new Set([
    "joy", "excited", "hopeful", "content", "energetic", "happy", "peaceful", "grateful", "calm",
  ]);
  const neg = new Set([
    "sad", "angry", "anxious", "worried", "stressed", "fear", "panic", "resentful", "frustrated",
  ]);
  const e = (emotion || "").toLowerCase();
  const i = clamp01(Number(intensity01));
  if (pos.has(e)) return +i;
  if (neg.has(e)) return -i;
  return 0;
}

function clamp01(n: number) {
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function parseDurationToMinutes(s: string): number {
  if (!s) return 0;
  const h = s.match(/(\d+)\s*h/i)?.[1];
  const m = s.match(/(\d+)\s*m/i)?.[1] ?? s.match(/(\d+)\s*minute/i)?.[1];
  return (h ? Number(h) : 0) * 60 + (m ? Number(m) : 0);
}

function summarizeTopics(ts: string[]) {
  const uniq = Array.from(new Set(ts)).slice(0, 3);
  if (uniq.length === 0) return "No topics identified yet.";
  if (uniq.length === 1) return `Mostly about ${uniq[0]}.`;
  if (uniq.length === 2) return `About ${uniq[0]} and ${uniq[1]}.`;
  return `About ${uniq[0]}, ${uniq[1]}, and ${uniq[2]}.`;
}

function valenceBuckets(vs: number[]) {
  const n = vs.length || 1;
  const neg = vs.filter((v) => v < -0.2).length;
  const neu = vs.filter((v) => v >= -0.2 && v <= 0.2).length;
  const pos = vs.filter((v) => v > 0.2).length;
  return [
    { bucket: "negative" as const, percentage: Math.round((neg / n) * 100) },
    { bucket: "neutral"  as const, percentage: Math.round((neu / n) * 100) },
    { bucket: "positive" as const, percentage: Math.round((pos / n) * 100) },
  ];
}
