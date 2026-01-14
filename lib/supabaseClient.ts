"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Legacy browser anon client. Prefer server-side factories in lib/supabase/server.ts for privileged access.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!url || !anon) {
    throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!cached) {
    cached = createClient(url, anon);
  }
  return cached;
}

// Export a lazy proxy that defers creation until actually used at runtime.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as any, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
