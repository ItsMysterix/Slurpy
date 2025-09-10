// lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Client = SupabaseClient<any, 'public', any>

/** Auto-picks admin (server) or anon (browser) safely. */
export function createSupabase(): Client {
  return typeof window === 'undefined'
    ? createServerSupabase()
    : createBrowserSupabase()
}

/** Server-only admin client (uses SERVICE_ROLE). */
export function createServerSupabase(): Client {
  if (typeof window !== 'undefined') {
    throw new Error('createServerSupabase() must run on the server')
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Browser client (uses public anon key). */
export function createBrowserSupabase(): Client {
  if (typeof window === 'undefined') {
    throw new Error('createBrowserSupabase() must run in the browser')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
}
