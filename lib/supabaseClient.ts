"use client";

import { createClient } from "@supabase/supabase-js";

// Legacy browser anon client. Prefer server-side factories in lib/supabase/server.ts for privileged access.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(url, anon);
