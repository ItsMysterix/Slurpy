import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Minimal canary that mirrors backend calibration logic for visibility
  const raw = process.env.EMOTION_CALIB_JSON || "";
  let loaded = false;
  let canaryOk = true;
  let hash = 0;
  try {
    loaded = !!raw.trim();
    // Synthetic distribution and simple per-label temperature s' = s ** temp
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
    // apply temps
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
    // compute numeric hash consistent with backend weighting
    const weights: Record<string, number> = { joy: 3, sadness: 2, anger: 1 };
    const wsum = norm.reduce((acc, d) => acc + (d.score * (weights[d.label.toLowerCase()] ?? 0)), 0);
    hash = Math.round(wsum * 1_000_000);
  } catch {
    canaryOk = false;
  }
  const shadowEnabled = (process.env.EMOTION_CALIB_SHADOW || "").toLowerCase() === "true" || (process.env.EMOTION_CALIB_SHADOW || "") === "1" || (process.env.EMOTION_CALIB_SHADOW || "").toLowerCase() === "yes";
  const payload: any = { loaded, canaryOk, hash };
  if (shadowEnabled) {
    // Tiny numeric-only snapshot placeholder (Node cannot read Python memory)
    const ts = Math.floor(Date.now() / 1000);
    payload.shadow = { n: 0, labels: [], ts };
  }
  return NextResponse.json({ ok: true, emotionCalib: payload });
}
