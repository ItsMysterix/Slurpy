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

/* ---------------- Helpers ---------------- */
type Msg = {
  userId?: string;
  role?: string;
  content?: string;
  text?: string;
  timestamp?: string;
  created_at?: string;
  topics?: string[] | string | null;
  emotion?: string | null;
  intensity?: number | null; // 0..1
};

const POS = new Set(["joy","excited","hopeful","content","energetic","happy","peaceful","grateful","calm"]);
const NEG = new Set(["sad","angry","anxious","worried","stressed","fear","panic","resentful","frustrated"]);
const toUTCStartOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
function emotionValence(emotion: string | null | undefined, intensity01: number | null | undefined) {
  const e = (emotion || "").toLowerCase();
  const i = Math.max(0, Math.min(1, Number(intensity01 ?? 0)));
  if (POS.has(e)) return +i;
  if (NEG.has(e)) return -i;
  return 0;
}
function parseTopics(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw === "string") { try { const j = JSON.parse(raw); return Array.isArray(j) ? j.filter((x) => typeof x === "string") : []; } catch { return []; } }
  return [];
}
const coalesceTs = (m: Msg) => m.timestamp || m.created_at || null;
const contentOf = (m: Msg) => (m.content ?? m.text ?? "").toString();

/* --------------------------------- POST --------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const supabase = sb();
    const { sessionId, endedAt, hints } = await req.json().catch(() => ({}));
    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

    // fetch all messages for the session
    let { data: msgs } = await supabase
      .from("ChatMessage")
      .select("userId,role,content,text,emotion,intensity,topics,timestamp,created_at")
      .eq("sessionId", sessionId)
      .order("timestamp", { ascending: true });

    if (!Array.isArray(msgs) || !msgs.length) {
      // fallback to snake
      const r2 = await supabase
        .from("ChatMessage")
        .select("userId,role,content,text,emotion,intensity,topics,timestamp,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      msgs = r2.data ?? [];
    }

    const all = (msgs ?? []) as Msg[];

    const endISO = (endedAt as string) || coalesceTs(all[all.length - 1] || {}) || new Date().toISOString();
    const startISO = coalesceTs(all[0] || { timestamp: endISO })!;
    const start = new Date(startISO); const end = new Date(endISO);
    const minutes = Math.max(0, Math.round((+end - +start) / 60000));
    const messageCount = all.length;

    const emoCounts = new Map<string, number>();
    for (const m of all) { const e = (m.emotion || "").toLowerCase(); if (e) emoCounts.set(e, (emoCounts.get(e) || 0) + 1); }
    let dominant = [...emoCounts.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] || (Array.isArray(hints) ? (hints.slice(-1)[0]?.label?.toLowerCase() ?? "neutral") : "neutral");

    const intensities = all.filter(m => (m.emotion || "").toLowerCase() === dominant)
      .map(m => Number(m.intensity ?? 0)).filter(Number.isFinite);
    const avgIntensity01 = intensities.length ? Math.max(0, Math.min(1, intensities.reduce((a,b)=>a+b,0)/intensities.length)) : 0.5;
    const valence = emotionValence(dominant, avgIntensity01);

    const topicsSet = new Set<string>();
    for (const m of all) {
      parseTopics(m.topics).forEach(t => topicsSet.add(t));
      (contentOf(m).match(/#([\p{L}\d_]+)/gu) ?? []).forEach(tag => topicsSet.add(tag.slice(1)));
    }
    const topics = Array.from(topicsSet).slice(0, 16);
    const userId = all.find(m => !!m.userId)?.userId ?? null;

    // update ChatSession snapshot (works for camel or snake installs)
    await supabase.from("ChatSession").update({
      endTime: end.toISOString(), updatedAt: end.toISOString(), duration: minutes, messageCount,
      dominantEmotion: dominant, avgIntensity: avgIntensity01, valence, topics,
      end_time: end.toISOString(), updated_at: end.toISOString(), message_count: messageCount,
      last_emotion: dominant, last_intensity: avgIntensity01, themes: topics,
    }).eq("id", sessionId);

    // Upsert DailyMood row for trends
    const day = toUTCStartOfDay(end).toISOString();
    const intensity10 = Math.round(Math.max(1, Math.min(10, avgIntensity01 * 10)));
    await supabase.from("DailyMood").upsert({
      userId, user_id: userId, date: day, emotion: dominant, intensity: intensity10, valence, fruit: "🍋",
    }, { onConflict: "userId,date" } as any);

    // 🔔 Notify day/week listeners
    if (userId) {
      notifyInsightsUpdate({ userId, reason: "finalize", timeframe: "day" });
      notifyInsightsUpdate({ userId, reason: "finalize", timeframe: "week" });
    }

    return NextResponse.json({
      ok: true,
      session: { sessionId, userId, startTime: start.toISOString(), endTime: end.toISOString(), duration: minutes, messageCount, dominantEmotion: dominant, avgIntensity01, valence, topics },
    });
  } catch (e: any) {
    console.error("Finalize error:", e?.message || e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
