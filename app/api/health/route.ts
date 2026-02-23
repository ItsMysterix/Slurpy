import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SLICheck {
  ok: boolean;
  latency: number;
  error?: string;
}

interface HealthPayload {
  ok: boolean;
  timestamp: string;
  emotionCalib: any;
  sli_checks: Record<string, SLICheck>;
  slo_status: {
    availability: boolean;
    latency_ok: boolean;
  };
}

export async function GET() {
  const overallStart = Date.now();
  const sliChecks: Record<string, SLICheck> = {};

  // Emotion calibration (existing logic)
  const raw = process.env.EMOTION_CALIB_JSON || "";
  let loaded = false;
  let canaryOk = true;
  let hash = 0;
  try {
    loaded = !!raw.trim();
    const base = [
      { label: "joy", score: 0.6 },
      { label: "sadness", score: 0.3 },
      { label: "anger", score: 0.1 },
    ];
    let temps: Record<string, number> = {};
    let thresh: Record<string, number> = {};
    if (loaded) {
      const data = JSON.parse(raw);
      const t = data?.temperature;
      const h = data?.threshold ?? data?.thresholds;
      if (t && typeof t === "object") {
        for (const [k, v] of Object.entries(t)) {
          const key = String(k).toLowerCase();
          const fv = Math.max(0.3, Math.min(3.0, Number(v)));
          if (!Number.isNaN(fv)) temps[key] = fv;
        }
      }
      if (h && typeof h === "object") {
        for (const [k, v] of Object.entries(h)) {
          const key = String(k).toLowerCase();
          const fv = Math.max(0.0, Math.min(0.99, Number(v)));
          if (!Number.isNaN(fv)) thresh[key] = fv;
        }
      }
    }
    const adj = base.map((d) => ({
      label: d.label,
      score: Math.pow(d.score, temps[d.label.toLowerCase()] ?? 1.0),
    }));
    const sum = adj.reduce((a, b) => a + b.score, 0);
    const norm = sum > 0 ? adj.map((d) => ({ label: d.label, score: d.score / sum })) : adj;
    const top = [...norm].sort((a, b) => b.score - a.score)[0];
    const thr = thresh[top.label.toLowerCase()] ?? -1;
    const sel = thr >= 0 && top.score < thr ? "neutral" : top.label;
    canaryOk = typeof sel === "string" && sel.length > 0 && sum > 0 && sum < 2;
    const weights: Record<string, number> = { joy: 3, sadness: 2, anger: 1 };
    const wsum = norm.reduce((acc, d) => acc + (d.score * (weights[d.label.toLowerCase()] ?? 0)), 0);
    hash = Math.round(wsum * 1_000_000);
  } catch {
    canaryOk = false;
  }
  const shadowEnabled = (process.env.EMOTION_CALIB_SHADOW || "").toLowerCase() === "true" || (process.env.EMOTION_CALIB_SHADOW || "") === "1" || (process.env.EMOTION_CALIB_SHADOW || "").toLowerCase() === "yes";
  const emotionCalibPayload: any = { loaded, canaryOk, hash };
  if (shadowEnabled) {
    const ts = Math.floor(Date.now() / 1000);
    emotionCalibPayload.shadow = { n: 0, labels: [], ts };
  }

  // SLI Checks (new)

  // 1. Database connectivity
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const dbStart = Date.now();
    try {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { error } = await sb
        .from("safety_events")
        .select("count", { count: "exact", head: true });
      sliChecks["database"] = {
        ok: !error,
        latency: Date.now() - dbStart,
        error: error?.message,
      };
    } catch (e) {
      sliChecks["database"] = {
        ok: false,
        latency: Date.now() - dbStart,
        error: (e as Error).message,
      };
    }
  }

  // 2. Qdrant connectivity (if configured)
  if (process.env.QDRANT_URL) {
    const qdStart = Date.now();
    try {
      const resp = await fetch(`${process.env.QDRANT_URL}/health`, {
        method: "GET",
        headers: { "api-key": process.env.QDRANT_API_KEY || "" },
        timeout: 3000,
      });
      sliChecks["qdrant"] = {
        ok: resp.ok,
        latency: Date.now() - qdStart,
      };
    } catch (e) {
      sliChecks["qdrant"] = {
        ok: false,
        latency: Date.now() - qdStart,
        error: (e as Error).message,
      };
    }
  }

  // 3. OpenAI API (optional, non-blocking)
  if (process.env.OPENAI_API_KEY) {
    const aiStart = Date.now();
    try {
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        timeout: 3000,
      });
      sliChecks["openai"] = {
        ok: resp.status === 200,
        latency: Date.now() - aiStart,
      };
    } catch (e) {
      sliChecks["openai"] = {
        ok: false,
        latency: Date.now() - aiStart,
        error: (e as Error).message,
      };
    }
  }

  const totalLatency = Date.now() - overallStart;
  const criticalChecksOk = Object.entries(sliChecks)
    .filter(([k]) => k !== "openai") // openai is non-critical
    .every(([, v]) => v.ok);

  const payload: HealthPayload = {
    ok: criticalChecksOk,
    timestamp: new Date().toISOString(),
    emotionCalib: emotionCalibPayload,
    sli_checks: sliChecks,
    slo_status: {
      availability: criticalChecksOk,
      latency_ok: totalLatency < 2000, // p95 < 2s SLO
    },
  };

  const statusCode = criticalChecksOk ? 200 : 503;
  return NextResponse.json(payload, { status: statusCode });
}
