// lib/tenant.ts
import type { Role } from "@/lib/authz";
import { createServerServiceClient } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/authz";

export async function assertProjectAccess(
  ctx: { userId: string; roles: Role[] },
  projectId: string
) {
  if (ctx.roles.includes("admin") || ctx.roles.includes("ops")) return;
  try {
  const sb = createServerServiceClient();
    const { data, error } = await sb
      .from("users_projects")
      .select("project_id")
      .eq("user_id", ctx.userId)
      .eq("project_id", projectId)
      .limit(1)
      .maybeSingle();
    if (error || !data) throw new ForbiddenError();
  } catch (e) {
    // On any error assume forbidden to avoid leakage
    throw new ForbiddenError();
  }
}

export function qdrantTenantFilter(ctx: { userId: string }) {
  return { must: [{ key: "tenant_id", match: { value: ctx.userId } }] };
}

export function collectionForTenant(base: string, userId: string) {
  return `${base}_${userId}`;
}
