import { NextResponse } from "next/server";
import { pipeline, env as xenEnv } from "@xenova/transformers";
import { franc } from "franc";

// keep wasm conservative on threads in edge-ish envs
xenEnv.backends.onnx.wasm.numThreads = 1;

// lazy singletons
let sentimentPipe: any | null = null;
let emotionPipe: any | null = null;
let toxicPipe: any | null = null;

async function getSentiment() {
  if (!sentimentPipe) {
    sentimentPipe = await pipeline(
      "text-classification",
      "Xenova/distilbert-base-uncased-finetuned-sst-2-english"
    );
  }
  return sentimentPipe;
}

async function getEmotion() {
  if (!emotionPipe) {
    emotionPipe = await pipeline(
      "text-classification",
      "Xenova/joeddav-distilbert-go-emotions"
    );
  }
  return emotionPipe;
}

async function getToxic() {
  if (!toxicPipe) {
    toxicPipe = await pipeline(
      "text-classification",
      "Xenova/unitary-toxic-bert"
    );
  }
  return toxicPipe;
}

// simple RAKE-lite keyword extractor
const STOP = new Set([
  "i","me","my","we","our","you","your","he","she","it","they","them",
  "a","an","the","and","or","but","if","then","so","because","as",
  "to","of","in","on","for","with","at","by","from","up","down","over","under",
  "is","am","are","was","were","be","been","being","do","does","did","done",
  "have","has","had","this","that","these","those"
]);

function keywords(text: string, max = 5) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const uni: Record<string, number> = {};
  const bi: Record<string, number> = {};

  for (let i = 0; i < tokens.length; i++) {
    const t1 = tokens[i];
    if (!STOP.has(t1)) uni[t1] = (uni[t1] || 0) + 1;
    if (i < tokens.length - 1) {
      const t2 = tokens[i + 1];
      if (!STOP.has(t1) && !STOP.has(t2)) {
        const k = `${t1} ${t2}`;
        bi[k] = (bi[k] || 0) + 1;
      }
    }
  }

  const scored = [
    ...Object.entries(bi).map(([k, v]) => ({ phrase: k, score: v * 2 })),
    ...Object.entries(uni).map(([k, v]) => ({ phrase: k, score: v })),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.phrase);

  return scored;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = (searchParams.get("text") || "").trim();

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // 1) language (ISO-639-3)
  const langCode = franc(text);
  const lang = langCode === "und" ? "unknown" : langCode; // 'eng', 'ben', etc.

  // 2) sentiment
  const sPipe = await getSentiment();
  const sRes = await sPipe(text, { topk: 2 });
  const sentiment = sRes.map((r: any) => ({
    label: r.label.toLowerCase(),
    score: r.score
  }));

  // 3) emotions
  const ePipe = await getEmotion();
  const eRes = await ePipe(text, { topk: 5 });
  const emotions = eRes.map((r: any) => ({
    label: r.label.toLowerCase(),
    score: r.score
  }));

  // 4) toxicity
  const tPipe = await getToxic();
  const tRes = await tPipe(text, { topk: 5 });
  const toxicity = tRes.map((r: any) => ({
    label: r.label.toLowerCase(),
    score: r.score
  }));

  // 5) keywords
  const topKeywords = keywords(text, 5);

  return NextResponse.json({
    lang,
    sentiment,
    emotions,
    toxicity,
    keywords: topKeywords
  });
}
