// lib/persona.ts
export const PERSONA_MODES = [
  { id: "parent",          name: "Parent" },
  { id: "partner",         name: "Partner" },
  { id: "boss",            name: "Boss" },
  { id: "inner_critic",    name: "Inner Critic" },
  { id: "self_compassion", name: "Self-Compassion" },
] as const;

export type ModeId = typeof PERSONA_MODES[number]["id"];
