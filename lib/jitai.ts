// lib/jitai.ts
// Lightweight client-side detectors + copy for inline interventions (JITAI)
// States: anxious, heated (anger), foggy (cognitive overload), meaning (emptiness)

export type DropState = "anxious" | "heated" | "foggy" | "meaning";

/** Titles for the InterventionCard */
export const TITLES: Record<DropState, string> = {
  anxious: "Calm the spiral",
  heated: "Release the heat",
  foggy: "Clear the fog",
  meaning: "Find your footing",
};

/** Optional: different subtitles per state (if you want). */
export const SUBTITLES: Record<DropState, string> = {
  anxious: "Noticed anxious language—want a 60-sec reset right here?",
  heated: "Sensed anger rising—want a quick cool-down together?",
  foggy: "Feeling mentally jammed—try a short reset?",
  meaning: "Feeling empty or lost—want a grounding pause?",
};

/** Basic cooldown gate (leave true; we handle time gating in page.tsx). */
export function allowDropIn(): boolean {
  return true;
}

/** Small helpers */
const hasAny = (txt: string, list: string[]) =>
  list.some((k) => txt.includes(k));

/**
 * detectState — heuristics-only; fast and robust to common slang/typos.
 * Return one of the states or null when nothing is detected.
 */
export function detectState(text: string): DropState | null {
  const t = (text || "").toLowerCase().trim();

  // quick exits
  if (t.length < 2) return null;

  // ---- ANXIOUS ----
  const anxiousWords = [
    "anxious",
    "anxiety",
    "panic",
    "panicked",
    "panicking",
    "worried",
    "worry",
    "nervous",
    "on edge",
    "edgy",
    "spiral",
    "racing heart",
    "heart is racing",
    "overthinking",
    "over-think",
    "overwhelm",
    "overwhelmed",
    "tight chest",
    "shaky",
    "jitters",
  ];
  if (hasAny(t, anxiousWords)) return "anxious";

  // ---- HEATED / ANGER ----
  const angerWords = [
    "angry",
    "anger",
    "mad",
    "furious",
    "pissed",
    "irritated",
    "annoyed",
    "rage",
    "raging",
    "heated",
    "fuming",
    "seething",
    "snapped",
    "blew up",
    "blow up",
    "lose it",
    "lost it",
  ];
  // also catch patterns like ALL CAPS + ! which often signal heat
  const looksHeated =
    hasAny(t, angerWords) || /!{2,}/.test(t) || (t === t.toUpperCase() && t.length >= 4);
  if (looksHeated) return "heated";

  // ---- FOGGY / COGNITIVE OVERLOAD ----
  const foggyWords = [
    "foggy",
    "fog",
    "stuck",
    "numb",
    "blank",
    "can't think",
    "cannot think",
    "confused",
    "lost",
    "burnt out",
    "burned out",
    "exhausted",
    "tired",
    "brain fog",
    "fried",
  ];
  if (hasAny(t, foggyWords)) return "foggy";

  // ---- MEANING / EMPTINESS ----
  const meaningWords = [
    "empty",
    "pointless",
    "meaningless",
    "what's the point",
    "whats the point",
    "hopeless",
    "why try",
    "nothing matters",
    "lost purpose",
    "no purpose",
  ];
  if (hasAny(t, meaningWords)) return "meaning";

  return null;
}

/**
 * normalizeEmotion — optional helper if you also map classifier outputs.
 * Example: map “panicked/panicking” → “anxious”, “heated/irritated” → “angry”, etc.
 */
export function normalizeEmotion(label?: string): string {
  const l = (label || "neutral").toLowerCase();
  if (["fear", "panic", "panicked", "panicking"].includes(l)) return "anxious";
  if (["irritated", "heated", "mad"].includes(l)) return "angry";
  if (["tired", "numb", "exhausted"].includes(l)) return "sad";
  return l;
}
