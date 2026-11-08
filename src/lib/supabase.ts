import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// Only the public anon/publishable key is ever used in the browser.
// All writes go through database functions that validate permissions.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 5 } },
})
