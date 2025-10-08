// hooks/useDropIns.ts
"use client";
import { useCallback, useRef, useState } from "react";
import type { DropIn, DropInKind, DropInSignals } from "@/lib/dropins";
import { COOLDOWN_MS } from "@/lib/dropins";

const now = () => Date.now();

export function useDropIns() {
  const [queue, setQueue] = useState<DropIn[]>([]);
  const lastFired = useRef<Map<DropInKind, number>>(new Map());

  const cooldownOk = (kind: DropInKind) => {
    const last = lastFired.current.get(kind) ?? 0;
    return now() - last >= (COOLDOWN_MS[kind] ?? 0);
  };

  const enqueue = useCallback((kind: DropInKind, title: string, meta?: Record<string, any>) => {
    if (!cooldownOk(kind)) return;
    lastFired.current.set(kind, now());
    setQueue((q) => [{ id: crypto.randomUUID(), kind, title, meta }, ...q].slice(0, 3));
  }, []);

  const dismiss = useCallback((id: string) => {
    setQueue((q) => q.filter((d) => d.id !== id));
  }, []);

  const maybeFromSignals = useCallback((s: DropInSignals) => {
    const text = (s.text ?? "").toLowerCase();
    const hour = s.hour ?? new Date().getHours();

    // 1) Grounding 5-4-3-2-1
    if ((s.anxiety ?? 0) > 0.78 || /i can.?t breathe|spiral|spinning/.test(text)) {
      if ((s.wpm ?? 0) > 220 || (s.editsIn5m ?? 0) > 3) {
        enqueue("grounding-54321", "Grounding (5-4-3-2-1)");
        return;
      }
    }

    // 2) Vagus humming
    if ((s.anxiety ?? 0) > 0.7 && /\b(panic|overwhelmed)\b/.test(text) && hour >= 21) {
      enqueue("vagus-hum", "Vagus Nerve Reset (Humming)");
      return;
    }

    // 3) Cold splash for anger
    if ((s.anger ?? 0) > 0.78 && (/[A-Z]{4,}/.test(s.text ?? "") || /f\*+|fuck|shit|damn|snap/i.test(text))) {
      enqueue("cold-splash", "Cool Down (45s)");
      return;
    }

    // 4) Progressive muscle micro
    if (/\b(tired|exhausted|drained|tense|tight)\b/.test(text)) {
      enqueue("progressive-micro", "Micro Body Scan (60s)");
      return;
    }

    // 5) Thought defusion
    const repeats = (s.recentUserUtterances ?? []).slice(-4);
    if (repeats.length >= 3 && repeats.every(u => u && u.length && Math.abs(u.length - repeats[0]!.length) < 12)) {
      enqueue("thought-defusion", "Pin the thought (Defusion)");
      return;
    }
    if (/\bwhat if\b/.test(text)) {
      enqueue("thought-defusion", "Pin the thought (Defusion)");
      return;
    }

    // 6) CBT 3-column
    if (/\b(i.?m (useless|idiot|failure|worthless|terrible))\b/.test(text)) {
      enqueue("cbt-3col", "3-Column Reframe");
      return;
    }

    // 7) Values compass (anger + injustice words)
    if ((s.anger ?? 0) > 0.6 && /\b(unfair|respect|rights|autonomy|justice|rude|disrespect)\b/.test(text)) {
      enqueue("values-compass", "Anger → Value Compass");
      return;
    }

    // 8) 120-second activation
    if (/\b(can.?t start|stuck|no motivation|procrastinat)\b/.test(text)) {
      enqueue("activation-120s", "120-Second Activation");
      return;
    }

    // 9) 10-3-1 triage
    if (/\b(too much to do|overwhelmed|so many tasks|to.?do list|backlog)\b/.test(text)) {
      enqueue("triage-10-3-1", "10-3-1 Triage");
      return;
    }

    // 10) Focus bubble
    if (/\b(need to focus|distracted|deep work|concentrate)\b/.test(text) && hour >= 8 && hour <= 20) {
      enqueue("focus-25", "25-min Focus Bubble");
      return;
    }

    // 11) Blue-light kill switch
    if (hour >= 23 && (s.anxiety ?? 0) > 0.4) {
      enqueue("blue-kill-switch", "Land the plane?");
      return;
    }

    // 12) Racing thoughts
    if (/\b(can.?t sleep|wide awake|racing thoughts|mind racing)\b/.test(text)) {
      enqueue("racing-thoughts", "Catch Racing Thoughts");
      return;
    }

    // 13) Micro-gratitude
    if (/\b(sad|down|empty|numb)\b/.test(text)) {
      enqueue("gratitude-3x10s", "Micro-Gratitude (3×10s)");
      return;
    }

    // 14) Self-compassion
    if (/\b(my fault|ashamed|embarrassed|guilty|guilt)\b/.test(text)) {
      enqueue("self-compassion", "Self-Compassion Postcard");
      return;
    }

    // 15) Repair nudge
    if (/\b(argued|fight|said something|hurt.*feelings)\b/.test(text)) {
      enqueue("repair-nudge", "Draft an I-Statement?");
      return;
    }

    // 16) Tiny win
    if (/\b(i did it|finished|got through|shipped|nailed it|passed|accepted)\b/.test(text)) {
      enqueue("tiny-win", "Bank the win?");
      return;
    }

    // 17) Streak care
    if ((s.turns ?? 0) === 1 && (s.lastUserAt ?? 0) > 0) {
      enqueue("streak-care", "You’re back—glad you’re here");
      return;
    }

    // Also keep your older hooks:
    if (/\b(interview|exam|deadline|presentation|meeting|test)\b/.test(text) &&
        /\b(nervous|anxious|stressed|worried|panic|overwhelmed)\b/.test(text)) {
      enqueue("calendar-suggest", "Add to calendar + reminder?");
      return;
    }
  }, [enqueue]);

  return { queue, enqueue, dismiss, maybeFromSignals };
}
