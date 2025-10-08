// hooks/useTTS.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Picks a decent-sounding voice:
 * 1) Prefer Google voices (Chrome)
 * 2) Then Microsoft (Edge)
 * 3) Then anything en-US
 * 4) Fallback to first available
 */
function pickBestVoice(voices: SpeechSynthesisVoice[], preferredName?: string) {
  if (!voices.length) return undefined;
  if (preferredName) {
    const exact = voices.find(v => v.name === preferredName);
    if (exact) return exact;
  }
  const by = (pred: (v: SpeechSynthesisVoice) => boolean) =>
    voices.find(pred);

  return (
    by(v => /Google/i.test(v.name) && /English|en/i.test(v.lang)) ||
    by(v => /Microsoft/i.test(v.name) && /English|en/i.test(v.lang)) ||
    by(v => /en(-|_)?US/i.test(v.lang)) ||
    voices[0]
  );
}

/** Split text into natural chunks (sentences first, then soft wrap). */
function chunkText(input: string, maxLen = 220): string[] {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return [];

  // Try sentence splits
  const sentences = text.split(/(?<=[.?!…])\s+(?=[A-Z0-9"“])/);
  const chunks: string[] = [];

  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length <= maxLen) {
      buf = (buf ? buf + " " : "") + s;
    } else {
      if (buf) chunks.push(buf);
      // If a single sentence is very long, soft-split by punctuation/space
      if (s.length > maxLen) {
        let rest = s;
        while (rest.length > maxLen) {
          // Try to cut on comma/semicolon/space near maxLen
          const window = rest.slice(0, maxLen + 40);
          const cut =
            window.lastIndexOf(", ") > 80 ? window.lastIndexOf(", ")
            : window.lastIndexOf("; ") > 80 ? window.lastIndexOf("; ")
            : window.lastIndexOf(" ") > 80 ? window.lastIndexOf(" ")
            : maxLen;
          chunks.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        if (rest) chunks.push(rest);
      } else {
        chunks.push(s);
      }
      buf = "";
    }
  }
  if (buf) chunks.push(buf);

  return chunks;
}

type SpeakOptions = {
  voiceName?: string;
  rate?: number;   // 0.1 – 10
  pitch?: number;  // 0 – 2
  volume?: number; // 0 – 1
  maxChunkLen?: number;
  lang?: string;
};

export function useTTS() {
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const currentUtterances = useRef<SpeechSynthesisUtterance[]>([]);
  const cancelled = useRef(false);

  // Load voices robustly across browsers
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v && v.length) {
        setVoices(v);
        setReady(true);
        return true;
      }
      return false;
    };

    // Try immediately
    if (!loadVoices()) {
      // Some browsers populate async
      const handler = () => {
        loadVoices();
      };
      speechSynthesis.addEventListener?.("voiceschanged", handler as any);
      // Fallback polling (Edge sometimes ignores event)
      const id = window.setInterval(() => {
        if (loadVoices()) {
          window.clearInterval(id);
          speechSynthesis.removeEventListener?.("voiceschanged", handler as any);
        }
      }, 300);

      return () => {
        window.clearInterval(id);
        speechSynthesis.removeEventListener?.("voiceschanged", handler as any);
      };
    }
  }, []);

  const defaultVoice = useMemo(() => pickBestVoice(voices), [voices]);

  const cancel = () => {
    if (!("speechSynthesis" in window)) return;
    cancelled.current = true;
    try {
      speechSynthesis.cancel();
    } catch {}
    currentUtterances.current = [];
    setSpeaking(false);
  };

  /**
   * Speaks text using chunked utterances, selecting a high-quality voice by default.
   */
  const speak = (text: string, opts?: SpeakOptions) =>
    new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      if (!text || !text.trim()) return resolve();

      // Stop anything queued
      cancel();
      cancelled.current = false;

      const maxChunkLen = opts?.maxChunkLen ?? 220;
      const parts = chunkText(text, maxChunkLen);
      if (!parts.length) return resolve();

      const voice =
        pickBestVoice(voices, opts?.voiceName) ||
        defaultVoice ||
        undefined;

      // Gentle defaults to reduce “robotic” feel
      const rate = opts?.rate ?? 1.02;
      const pitch = opts?.pitch ?? 1.05;
      const volume = opts?.volume ?? 1.0;
      const lang = opts?.lang ?? voice?.lang ?? "en-US";

      setSpeaking(true);

      // Queue utterances
      const queue: SpeechSynthesisUtterance[] = parts.map((chunk) => {
        const u = new SpeechSynthesisUtterance(chunk);
        if (voice) u.voice = voice;
        u.lang = lang;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = volume;
        return u;
      });

      currentUtterances.current = queue;

      // Chain them one-by-one with tiny gap to avoid clicks
      const playNext = () => {
        if (cancelled.current) {
          setSpeaking(false);
          resolve();
          return;
        }
        const u = currentUtterances.current.shift();
        if (!u) {
          setSpeaking(false);
          resolve();
          return;
        }
        u.onend = () => {
          // 30ms micro gap = smoother phrasing
          setTimeout(playNext, 30);
        };
        u.onerror = () => {
          // skip this chunk and continue
          setTimeout(playNext, 0);
        };
        try {
          speechSynthesis.speak(u);
        } catch {
          // If speak() throws (rare), continue
          setTimeout(playNext, 0);
        }
      };

      // Start
      // Some browsers need a user gesture to unlock audio; assume already satisfied
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
