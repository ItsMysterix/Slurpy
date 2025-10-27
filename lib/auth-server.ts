// lib/auth-server.ts
// Centralized server-side auth helpers for Supabase migration.
// - Provides minimal auth context
// - Supports an E2E bypass hook via header X-E2E-USER when NEXT_PUBLIC_E2E_BYPASS_AUTH=true

import { cookies, headers } from "next/headers";

export type MinimalAuth = {
  userId: string;
  // Optional bearer token forwarded by clients
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
 * Attempts to resolve a bearer token in a safe order:
 * 1) Authorization: Bearer <token>
 * 2) __session cookie (legacy, if set)
 */
async function resolveBearer(): Promise<string | undefined> {
  let token = "";
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
 * Decode a JWT payload without verifying signature (best-effort) and return the JSON payload.
 * Safe for extracting non-sensitive claims like `sub`.
 */
function decodeJwtPayload(token: string): any | undefined {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    const b64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return undefined;
  }
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
  // Resolve bearer from header or cookie, then extract `sub` as userId
  const bearer = await resolveBearer();
  if (bearer) {
    const payload = decodeJwtPayload(bearer);
    const sub = payload?.sub || payload?.user_id || payload?.uid || "";
    if (typeof sub === "string" && sub) {
      return { userId: sub, bearer };
    }
  }
  // As a last resort, support explicit header (legacy/testing)
  try {
    const hdrs = await headers();
    const u = hdrs.get("x-user") || "";
    if (u) return { userId: u, bearer };
  } catch {}
  throw new UnauthorizedError();
}

/** Optional auth context; undefined when unauthenticated. */
export async function getOptionalAuth(): Promise<MinimalAuth | undefined> {
  try {
    return await getAuthOrThrow();
  } catch {
    return undefined;
  }
}
