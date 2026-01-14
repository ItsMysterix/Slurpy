// Shared plan policy helpers (client + server safe)

export type Plan = "free" | "pro" | "elite";

// Feature flags per plan tier
export const PLAN_FEATURES = {
  free: {
    memory: false,
    insights: false,
    voice: false,
    chatHistoryDays: 1, // 24h memory
  },
  pro: {
    memory: true,
    insights: true,
    voice: false,
    chatHistoryDays: 365, // Full retention
  },
  elite: {
    memory: true,
    insights: true,
    voice: true,
    chatHistoryDays: 365, // Full retention + voice
  },
} as const;

type UserLike = {
  user_metadata?: { plan?: string };
  plan?: string;
  plan_id?: string;
  [key: string]: any;
};

function normalizePlan(value?: string | null): Plan {
  const plan = (value || "").toLowerCase();
  if (plan === "pro" || plan === "elite") return plan as Plan;
  return "free";
}

export function getPlan(input?: UserLike | Plan | null): Plan {
  if (!input) return "free";
  if (typeof input === "string") return normalizePlan(input);
  return normalizePlan(input.user_metadata?.plan || input.plan || input.plan_id);
}

export function isPro(input?: UserLike | Plan | null): boolean {
  const plan = getPlan(input);
  return plan === "pro" || plan === "elite";
}

export function isElite(input?: UserLike | Plan | null): boolean {
  const plan = getPlan(input);
  return plan === "elite";
}

/**
 * Check if user can use a specific feature based on their plan
 * @param input User object or plan string
 * @param feature Feature key from PLAN_FEATURES
 * @returns Whether user can use this feature
 */
export function canUseFeature(
  input?: UserLike | Plan | null,
  feature: keyof typeof PLAN_FEATURES.free = "memory"
): boolean {
  const plan = getPlan(input);
  return PLAN_FEATURES[plan][feature as keyof typeof PLAN_FEATURES.free] as boolean;
}

// Backward compatibility aliases (deprecated - use canUseFeature instead)
export function canUseMemory(input?: UserLike | Plan | null): boolean {
  return canUseFeature(input, "memory");
}

export function canUseInsights(input?: UserLike | Plan | null): boolean {
  return canUseFeature(input, "insights");
}

export function canUseVoice(input?: UserLike | Plan | null): boolean {
  return canUseFeature(input, "voice");
}
