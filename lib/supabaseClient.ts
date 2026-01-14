"use client";

import { createClient } from "@supabase/supabase-js";

// Legacy browser anon client. Prefer server-side factories in lib/supabase/server.ts for privileged access.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Only create client if both env vars are set, otherwise create a dummy client
export const supabase = url && anon 
  ? createClient(url, anon)
  : createClient("http://localhost:54321", "dummy-key");
