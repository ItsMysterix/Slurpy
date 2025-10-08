// lib/dropins.ts
export type DropInKind =
  | "grounding-54321"
  | "vagus-hum"
  | "cold-splash"
  | "progressive-micro"
  | "thought-defusion"
  | "cbt-3col"
  | "values-compass"
  | "activation-120s"
  | "triage-10-3-1"
  | "focus-25"
  | "blue-kill-switch"
  | "racing-thoughts"
  | "gratitude-3x10s"
  | "self-compassion"
  | "repair-nudge"
  | "tiny-win"
  | "streak-care"
  | "calendar-suggest"     // from earlier set
  | "micro-break"          // from earlier set
  | "reach-out"            // from earlier set
  | "sleep-winddown"       // from earlier set
  | "box-breathing"        // from earlier set
  | "heat-release"         // from earlier set
  | "mood-checkin"         // from earlier set
  ;

export type DropIn = {
  id: string;
  kind: DropInKind;
  title: string;
  meta?: Record<string, any>;
};

export type DropInSignals = {
  anger?: number;     // 0..1
  anxiety?: number;   // 0..1
  sentiment?: number; // -1..1
  hour?: number;      // 0..23
  wpm?: number;
  text?: string;
  turns?: number;
  editsIn5m?: number; // message edits within 5m
  lastUserAt?: number;
  recentUserUtterances?: string[];
};

export const COOLDOWN_MS: Record<DropInKind, number> = {
  "grounding-54321":   10 * 60 * 1000,
  "vagus-hum":          8 * 60 * 1000,
  "cold-splash":       10 * 60 * 1000,
  "progressive-micro": 12 * 60 * 1000,
  "thought-defusion":  12 * 60 * 1000,
  "cbt-3col":          12 * 60 * 1000,
  "values-compass":    12 * 60 * 1000,
  "activation-120s":   10 * 60 * 1000,
  "triage-10-3-1":     20 * 60 * 1000,
  "focus-25":          25 * 60 * 1000,
  "blue-kill-switch":  60 * 60 * 1000,
  "racing-thoughts":   20 * 60 * 1000,
  "gratitude-3x10s":   30 * 60 * 1000,
  "self-compassion":   30 * 60 * 1000,
  "repair-nudge":      30 * 60 * 1000,
  "tiny-win":           5 * 60 * 1000,
  "streak-care":       12 * 60 * 1000,

  "calendar-suggest":  30 * 60 * 1000,
  "micro-break":       15 * 60 * 1000,
  "reach-out":         30 * 60 * 1000,
  "sleep-winddown":    30 * 60 * 1000,
  "box-breathing":     10 * 60 * 1000,
  "heat-release":      10 * 60 * 1000,
  "mood-checkin":      60 * 60 * 1000,
};
