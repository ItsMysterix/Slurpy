// hooks/useTTS.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Voice priority list (best → ok). We match by case-insensitive substring. */
const VOICE_PRIORITY = [
  // Chrome
  "Google US English",
  "Google en-US",
  "Google English",
  // Edge (Natural voices)
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Microsoft Aria - English (United States)",
  "Microsoft Jenny - English (United States)",
  "Microsoft Aria",
  "Microsoft Jenny",
  // Safari/macOS
  "Samantha",
  // Other common mac voices if Samantha missing
  "Alex",
  "Victoria",
];

function findPreferredVoice(
  voices: SpeechSynthesisVoice[],
  requested?: string
) {
  if (!voices.length) return undefined;

  // 1) Exact request
  if (requested) {
    const exact = voices.find((v) => v.name === requested);
    if (exact) return exact;
  }

  // 2) Priority by substring
  const lower = (s: string) => s.toLowerCase();
  for (const wanted of VOICE_PRIORITY) {
    const hit = voices.find((v) => lower(v.name).includes(lower(wanted)));
    if (hit) return hit;
  }

  // 3) en-US, then any English, then first
  return (
    voices.find((v) => /^en[-_]?US$/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0]
  );
}

/** Mild sentence-based chunking to avoid long utterances. */
function chunkBySentence(text: string, maxLen = 320): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?…])\s+(?=[A-Z0-9"“])/);
  const out: string[] = [];
  let buf = "";

  for (const s of parts) {
    const candidate = buf ? `${buf} ${s}` : s;
    if (candidate.length <= maxLen) {
      buf = candidate;
    } else {
      if (buf) out.push(buf);
      if (s.length <= maxLen) {
        out.push(s);
        buf = "";
      } else {
        // soft wrap mega-sentences
        let rest = s;
        while (rest.length > maxLen) {
          const window = rest.slice(0, maxLen + 60);
          const cut =
            window.lastIndexOf(". ") > 120
              ? window.lastIndexOf(". ")
              : window.lastIndexOf(", ") > 120
              ? window.lastIndexOf(", ")
              : window.lastIndexOf(" ") > 120
              ? window.lastIndexOf(" ")
              : maxLen;
          out.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        if (rest) out.push(rest);
        buf = "";
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}

type SpeakOptions = {
  voiceName?: string;
  rate?: number;   // 0.1–10
  pitch?: number;  // 0–2
  volume?: number; // 0–1
  maxChunkLen?: number;
  lang?: string;
};

export function useTTS() {
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const queueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const cancelled = useRef(false);

  // Load voices across browsers reliably
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const load = () => {
      const v = speechSynthesis.getVoices();
      if (v && v.length) {
        setVoices(v);
        setReady(true);
        return true;
      }
      return false;
    };

    if (!load()) {
      const onVoices = () => load();
      speechSynthesis.addEventListener?.("voiceschanged", onVoices as any);

      const id = window.setInterval(() => {
        if (load()) {
          window.clearInterval(id);
          speechSynthesis.removeEventListener?.("voiceschanged", onVoices as any);
        }
      }, 300);

      return () => {
        window.clearInterval(id);
        speechSynthesis.removeEventListener?.("voiceschanged", onVoices as any);
      };
    }
  }, []);

  const defaultVoice = useMemo(() => findPreferredVoice(voices), [voices]);

  const cancel = () => {
    if (!("speechSynthesis" in window)) return;
    cancelled.current = true;
    try {
      speechSynthesis.cancel();
    } catch {}
    queueRef.current = [];
    setSpeaking(false);
  };

  const speak = (text: string, opts?: SpeakOptions) =>
    new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const content = (text ?? "").trim();
      if (!content) return resolve();

      // stop anything in flight
      cancel();
      cancelled.current = false;

      const voice =
        findPreferredVoice(voices, opts?.voiceName) || defaultVoice;

      // Neutral, chatbot-y defaults (less robotic)
      const rate = Math.min(Math.max(opts?.rate ?? 1.0, 0.1), 2.0);
      const pitch = Math.min(Math.max(opts?.pitch ?? 1.0, 0.1), 2.0);
      const volume = Math.min(Math.max(opts?.volume ?? 1.0, 0), 1);
      const lang = opts?.lang ?? voice?.lang ?? "en-US";
      const maxChunkLen = opts?.maxChunkLen ?? 320;

      const parts = chunkBySentence(content, maxChunkLen);
      if (!parts.length) return resolve();

      setSpeaking(true);

      queueRef.current = parts.map((t) => {
        const u = new SpeechSynthesisUtterance(t);
        if (voice) u.voice = voice;
        u.lang = lang;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = volume;
        return u;
      });

      const playNext = () => {
        if (cancelled.current) {
          setSpeaking(false);
          resolve();
          return;
        }
        const u = queueRef.current.shift();
        if (!u) {
          setSpeaking(false);
          resolve();
          return;
        }
        u.onend = () => setTimeout(playNext, 50); // tiny gap smooths phrasing
        u.onerror = () => setTimeout(playNext, 0);
        try {
          speechSynthesis.speak(u);
        } catch {
          setTimeout(playNext, 0);
        }
      };

      playNext();
    });

  return {
    ready,
    speaking,
    voices,
    defaultVoiceName: defaultVoice?.name,
    speak,
    cancel,
  };
}
