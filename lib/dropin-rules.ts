// lib/dropin-rules.ts
import type { DropInKind } from "./dropins";

export type ConversationSignal = {
  msgId: string;
  text: string;
  affect?: { emotion?: "anger"|"anxiety"|"sadness"|string; arousal?: number; valence?: number; confidence?: number };
};

type Suggestion = {
  id: string;
  kind: DropInKind;
  title: string;
  cooldownKey: string;
  ttlMs?: number;
  meta?: Record<string, any>;
  priority: number;
};

const now = () => Date.now();

export function inferDropIns(
  recent: ConversationSignal[],
  lastShownAt: Record<string, number> // cooldown registry by cooldownKey
): Suggestion[] {
  if (!recent.length) return [];
  const last = recent[recent.length - 1];
  const txt = (last.text || "").toLowerCase();
  const a = last.affect;

  const out: Suggestion[] = [];
  const push = (s: Suggestion) => {
    const lastAt = lastShownAt[s.cooldownKey] ?? 0;
    if (now() - lastAt < 5 * 60_000) return; // 5 min per-key cooldown
    out.push(s);
  };

  // Anger spike → box breathing
  if (a && a.emotion === "anger" && (a.arousal ?? 0) > 0.6 && (a.confidence ?? 0) > 0.6) {
    push({
      id: `box-${last.msgId}`,
      kind: "box-breathing",
      title: "Breathe it down (4-4-4-4)",
      priority: 90,
      ttlMs: 120_000,
      cooldownKey: "anger-breath",
    });
  }

  // Anxiety / panic → grounding
  if ((a?.emotion === "anxiety" && (a.confidence ?? 0) > 0.5) ||
      /(panic|anxious|heart racing|overthinking|can't breathe)/i.test(txt)) {
    push({
      id: `g-${last.msgId}`,
      kind: "grounding-54321",
      title: "Ground with 5-4-3-2-1",
      priority: 95,
      ttlMs: 180_000,
      cooldownKey: "anxiety-ground",
    });
  }

  // Overwhelm → 10-3-1 triage
  if (/(too much|overwhelmed|so many things|idk where to start)/i.test(txt)) {
    push({
      id: `triage-${last.msgId}`,
      kind: "triage-10-3-1",
      title: "Let’s shrink the pile (10→3→1)",
      meta: { extract: last.text.slice(0, 400) },
      priority: 70,
      ttlMs: 180_000,
      cooldownKey: "overwhelm-triage",
    });
  }

  // Late-night wind-down
  const hour = new Date().getHours();
  if ((hour >= 23 || hour < 5) && /(tired|can't sleep|up late|insomnia)/i.test(txt)) {
    push({
      id: `sleep-${last.msgId}`,
      kind: "sleep-winddown",
      title: "2-min wind-down?",
      priority: 60,
      ttlMs: 120_000,
      cooldownKey: "sleep-winddown",
    });
  }

  // Low mood → reach-out + micro-activation
  if (a && (a.valence ?? 0) < -0.4 && (a.confidence ?? 0) > 0.5) {
    push({
      id: `reach-${last.msgId}`,
      kind: "reach-out",
      title: "Nudge a friendly ping",
      priority: 65,
      ttlMs: 180_000,
      cooldownKey: "low-reachout",
    });
    push({
      id: `act-${last.msgId}`,
      kind: "activation-120s",
      title: "120-second activation",
      priority: 50,
      ttlMs: 120_000,
      cooldownKey: "low-activation",
    });
  }

  // Map any other rules you like…

  return out.sort((a, b) => b.priority - a.priority).slice(0, 2);
}
