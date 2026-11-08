import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Accepts the common ways a Supabase URL gets pasted (missing https://,
 * surrounding spaces or quotes, trailing slash, /rest/v1 suffix) and returns
 * a clean origin, or null if it still isn't a valid URL.
 */
export function normalizeSupabaseUrl(raw: string | undefined): string | null {
  let v = (raw ?? '').trim().replace(/^['"]|['"]$/g, '').trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null
    return u.origin
  } catch {
    return null
  }
}

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim().replace(/^['"]|['"]$/g, '')
const url = normalizeSupabaseUrl(rawUrl)

/** Human-readable reason the app can't start, or null when configuration is fine. */
export const configProblem: string | null = !rawUrl?.trim()
  ? 'VITE_SUPABASE_URL is not set.'
  : !url
    ? `VITE_SUPABASE_URL is not a valid URL (got "${rawUrl}"). It should look like https://abcdefgh.supabase.co`
    : !anonKey
      ? 'VITE_SUPABASE_ANON_KEY is not set.'
      : null

export const isConfigured = configProblem === null

function makeClient(): SupabaseClient {
  // Only the public anon/publishable key is ever used in the browser.
  // All writes go through database functions that validate permissions.
  return createClient(url ?? 'http://localhost', anonKey || 'missing-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  })
}

export const supabase = makeClient()
