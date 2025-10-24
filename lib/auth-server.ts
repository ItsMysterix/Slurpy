// lib/auth-server.ts
// Centralized server-side auth helpers.
// - Provides minimal auth context
// - Resolves a Clerk JWT for backend calls when needed
// - Supports an E2E bypass hook via header X-E2E-USER when NEXT_PUBLIC_E2E_BYPASS_AUTH=true

import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";

export type MinimalAuth = {
  userId: string;
  // Optional Clerk session token to forward to backend calls (bearer)
  bearer?: string;
};

export class UnauthorizedError extends Error {
  status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Attempts to resolve a Clerk session token in a safe order:
 * 1) getToken({ template: "backend" })
 * 2) Authorization: Bearer <token>
 * 3) Clerk __session cookie
 */
async function resolveClerkBearer(getToken?: (opts?: any) => Promise<string | null>): Promise<string | undefined> {
  let token = "";
  try {
    if (getToken) token = (await getToken({ template: "backend" })) || "";
  } catch {
    // ignore; fallbacks below
  }
  if (!token) {
    try {
      const hdrs = await headers();
      const authz = hdrs.get("authorization") || hdrs.get("Authorization");
      if (authz?.startsWith("Bearer ")) token = authz.slice(7).trim();
    } catch {}
  }
  if (!token) {
    try {
      const jar = await cookies();
      token = jar.get("__session")?.value ?? "";
    } catch {}
  }
  return token || undefined;
}

/**
 * Returns minimal auth context or throws UnauthorizedError.
 * In E2E mode (NEXT_PUBLIC_E2E_BYPASS_AUTH=true) allows overriding user via header X-E2E-USER.
 */
export async function getAuthOrThrow(): Promise<MinimalAuth> {
  // E2E bypass hook for server-only contexts
  if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true") {
    try {
      const hdrs = await headers();
      const testUser = hdrs.get("x-e2e-user");
      if (testUser) {
        return { userId: testUser, bearer: "e2e-token" };
      }
    } catch {}
  }

  const { userId, getToken } = await auth();
  if (!userId) throw new UnauthorizedError();
  const bearer = await resolveClerkBearer(getToken);
  return { userId, bearer };
}

/** Optional auth context; undefined when unauthenticated. */
export async function getOptionalAuth(): Promise<MinimalAuth | undefined> {
  try {
    return await getAuthOrThrow();
  } catch {
    return undefined;
  }
}
