"use client";
import { useUser } from "@/lib/auth-hooks";

export type Plan = "free" | "pro" | "elite";

export function usePlan(): { plan: Plan; isPro: boolean; isElite: boolean; loading: boolean } {
  const { user, isLoaded } = useUser();
  const plan = (user?.user_metadata?.plan as Plan) || "free";
  return {
    plan,
    isPro: plan === "pro" || plan === "elite",
    isElite: plan === "elite",
    loading: !isLoaded,
  };
}
