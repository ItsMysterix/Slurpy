// Centralized API authentication middleware
// Replaces scattered getAuthOrThrow calls with consistent, verified auth

import { NextRequest } from "next/server";
import { createServerServiceClient } from "./supabase/server";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AuthContext {
  userId: string;
  userIdAsUuid: string; // UUID format (without text conversion)
  bearer: string;
  email?: string;
}

/**
 * Extract and verify authentication from request
 * Supports: Authorization Bearer header, __session cookie
 * @throws UnauthorizedError if no valid auth found
 */
export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const bearer = extractBearer(request);
  if (!bearer) {
    throw new UnauthorizedError("Missing authorization header or session cookie");
  }

  // Verify token with Supabase
  const supabase = await createServerServiceClient();
  const { data, error } = await supabase.auth.getUser(bearer);

  if (error || !data.user) {
    throw new UnauthorizedError("Invalid or expired token");
  }

  return {
    userId: data.user.id, // UUID as string
    userIdAsUuid: data.user.id, // Same as userId
    bearer,
    email: data.user.email,
  };
}

/**
 * Extract auth but don't require it
 * Returns null if not authenticated
 */
export async function optionalAuth(request: NextRequest): Promise<AuthContext | null> {
  const bearer = extractBearer(request);
  if (!bearer) {
    return null;
  }

  try {
    const supabase = await createServerServiceClient();
    const { data, error } = await supabase.auth.getUser(bearer);

    if (error || !data.user) {
      return null;
    }

    return {
      userId: data.user.id,
      userIdAsUuid: data.user.id,
      bearer,
      email: data.user.email,
    };
  } catch {
    return null;
  }
}

/**
 * Extract bearer token from request
 * Tries Authorization header first, then __session cookie
 */
export function extractBearer(request: NextRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check __session cookie (Supabase sets this)
  const sessionCookie = request.cookies.get("__session")?.value;
  if (sessionCookie) {
    return sessionCookie;
  }

  // E2E testing bypass (NEVER enable in production)
  const e2eBypass = request.headers.get("x-e2e-bypass-auth");
  if (e2eBypass === process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH) {
    // Return a fake UUID for testing
    return "test-token-" + Math.random().toString(36).substring(7);
  }

  return null;
}

/**
 * JSON error response helper
 */
export function authErrorResponse(message: string, status = 401) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "content-type": "application/json" },
    }
  );
}

/**
 * Wraps an API handler with authentication
 * Usage: export const POST = withAuth(async (req, auth) => { ... })
 */
export function withAuth<T extends any[], R>(
  handler: (request: NextRequest, auth: AuthContext, ...args: T) => Promise<Response>
) {
  return async (request: NextRequest, ...args: T): Promise<Response> => {
    try {
      const auth = await requireAuth(request);
      return await handler(request, auth, ...args);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return authErrorResponse(error.message);
      }
      throw error;
    }
  };
}

/**
 * Wraps an API handler with optional authentication
 */
export function withOptionalAuth<T extends any[], R>(
  handler: (request: NextRequest, auth: AuthContext | null, ...args: T) => Promise<Response>
) {
  return async (request: NextRequest, ...args: T): Promise<Response> => {
    try {
      const auth = await optionalAuth(request);
      return await handler(request, auth, ...args);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return authErrorResponse(error.message);
      }
      throw error;
    }
  };
}
