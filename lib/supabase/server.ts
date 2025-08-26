import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  // Don't leak secrets—just say what's missing
  console.error(
    "[Supabase] Missing env:",
    !SUPABASE_URL ? "SUPABASE_URL" : "",
    !SUPABASE_SERVICE_ROLE ? "SUPABASE_SERVICE_ROLE" : ""
  )
  // Keep going so the app boots, but your API route will 500 with a clear message
}

export const supabaseAdmin = createClient(
  SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE ?? "",
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetch as any },
  }
)
