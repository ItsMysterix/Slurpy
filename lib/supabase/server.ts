// lib/supabase/server.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<any, "public", any>;

/**
 * Server-only "anon" client for request-bound operations.
 * - Uses NEXT_PUBLIC_SUPABASE_ANON_KEY on the server with no session persistence.
 * - Optionally forwards Authorization header if provided (for RLS auth when you mint a Supabase JWT).
 */
export function createServerAnonClient(headers?: Record<string, string>): Client {
  if (typeof window !== "undefined") throw new Error("createServerAnonClient() must run on the server");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: headers?.authorization ? { headers: { Authorization: headers.authorization } } : undefined,
  });
}

/**
 * Authoritative server-only admin client (SERVICE_ROLE).
 * Use this for all server-side service-role access; other server factories are legacy.
 */
export function createServerServiceClient(): Client {
  if (typeof window !== "undefined") throw new Error("createServerServiceClient() must run on the server");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer SUPABASE_SERVICE_ROLE, but fall back to SUPABASE_SERVICE_ROLE_KEY to avoid breaking existing envs.
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE(_KEY)");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Browser client (public anon). Do not leak service keys here. */
export function createBrowserSupabase(): Client {
  if (typeof window === "undefined") throw new Error("createBrowserSupabase() must run in the browser");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
}

/**
 * Optional defense-in-depth helper: returns the same client but expressed for clarity.
 * Prefer explicit filters in routes: `.from(tbl).select(...).eq("user_id", userId)`.
 */
export function scoped(client: Client) {
  return client;
}
