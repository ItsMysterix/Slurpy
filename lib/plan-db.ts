// Server-side plan retrieval from database
// Use this for authoritative plan checks in API endpoints

import { createServerServiceClient } from "./supabase/server";
import { Plan } from "./plan-policy";

/**
 * Get the user's plan from the profiles table (authoritative source)
 * Falls back to user_metadata for backward compatibility during migration
 */
export async function getUserPlanFromDB(userId: string): Promise<Plan> {
  const supabase = await createServerServiceClient();

  // Try to get from profiles table first (new source of truth)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .single();

  if (!profileError && profile?.plan) {
    return (profile.plan as Plan).toLowerCase() as Plan;
  }

  // Fallback: get from auth.users.user_metadata (old location)
  const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);

  if (!userError && user?.user?.user_metadata && typeof user.user.user_metadata === 'object' && 'plan' in user.user.user_metadata) {
    const plan = (user.user.user_metadata as any).plan as string;
    return (plan.toLowerCase() as Plan);
  }

  return "free" as Plan; // Default plan
}

/**
 * Initialize profile for a new user
 * Call this on signup/first login
 */
export async function initializeUserProfile(
  userId: string,
  plan: Plan = "free" as Plan
) {
  const supabase = await createServerServiceClient();

  const { error } = await supabase.from("profiles").insert({
    user_id: userId,
    plan,
  });

  if (error) {
    console.error("Failed to initialize user profile:", error);
    throw error;
  }
}

/**
 * Update user's plan (admin/payment endpoint)
 */
export async function updateUserPlan(userId: string, newPlan: Plan) {
  const supabase = await createServerServiceClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      plan: newPlan,
      plan_updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to update user plan:", error);
    throw error;
  }
}

/**
 * Ensure profile exists (idempotent - safe to call multiple times)
 */
export async function ensureUserProfile(userId: string) {
  const supabase = await createServerServiceClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!existing) {
    await initializeUserProfile(userId, "free" as Plan);
  }
}
