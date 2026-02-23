// lib/authz.ts
import { headers } from "next/headers";
import { createServerServiceClient } from "@/lib/supabase/server";
import { isE2EBypassEnabled } from "@/lib/runtime-safety";

export type Role = "user" | "ops" | "admin";

export async function deriveRoles(userId: string): Promise<Role[]> {
  // E2E: allow overriding via header when bypass is enabled
  if (isE2EBypassEnabled()) {
    try {
      const hdrs = await headers();
      const raw = hdrs.get("x-e2e-roles");
      if (raw) {
        const roles = raw
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean) as Role[];
        if (roles.length) return Array.from(new Set(["user" as Role, ...roles]));
      }
    } catch {}
  }

  // Dev shortcut
  if (process.env.NODE_ENV !== "production") {
    const raw = process.env.SHORTCUT_ROLES_FOR_DEV || "";
    if (raw) {
      const roles = raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean) as Role[];
      if (roles.length) return Array.from(new Set(["user" as Role, ...roles]));
    }
  }

  // Optional: check membership table if available
  try {
    const sb = createServerServiceClient();
    const { data, error } = await sb
      .from("users_roles")
      .select("role")
      .eq("user_id", userId);
    if (!error && Array.isArray(data) && data.length) {
      const roles = data
        .map((r: any) => String(r.role || "").toLowerCase())
        .filter(Boolean) as Role[];
      if (roles.length) return Array.from(new Set(["user" as Role, ...roles]));
    }
  } catch {}

  return ["user"];
}

export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function requireRole(ctxRoles: Role[], ...needed: Role[]) {
  if (!needed.length) return;
  const ok = ctxRoles.some((r) => needed.includes(r));
  if (!ok) throw new ForbiddenError();
}

export function requireSelfOrRole(
  params: { requesterId: string; ownerId: string; roles: Role[] },
  ...needed: Role[]
) {
  if (params.requesterId === params.ownerId) return;
  requireRole(params.roles, ...needed);
}
