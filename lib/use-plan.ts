"use client";
import { useUser } from "@clerk/nextjs";

export type Plan = "free" | "pro" | "elite";

export function usePlan(): { plan: Plan; isPro: boolean; isElite: boolean; loading: boolean } {
  const { user, isLoaded } = useUser();
  const plan = (user?.publicMetadata?.plan as Plan) || "free";
  return {
    plan,
    isPro: plan === "pro" || plan === "elite",
    isElite: plan === "elite",
    loading: !isLoaded,
  };
}
