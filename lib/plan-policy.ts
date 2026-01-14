// Shared plan policy helpers (client + server safe)

export type Plan = "free" | "pro" | "elite";

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

export function canUseMemory(input?: UserLike | Plan | null): boolean {
  return isPro(input);
}

export function canUseInsightsMemory(input?: UserLike | Plan | null): boolean {
  return isPro(input);
}
