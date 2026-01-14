"use client";
import { useUser } from "@/lib/auth-hooks";
import { getPlan, isPro } from "@/lib/plan-policy";

export type Plan = "free" | "pro" | "elite";

export function usePlan(): { plan: Plan; isPro: boolean; isElite: boolean; loading: boolean } {
  const { user, isLoaded } = useUser();
  const plan = getPlan(user);
  return {
    plan,
    isPro: isPro(plan),
    isElite: plan === "elite",
    loading: !isLoaded,
  };
}
