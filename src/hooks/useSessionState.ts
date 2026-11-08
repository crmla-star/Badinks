import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { SessionState } from '../lib/types'

export type LoadStatus = 'loading' | 'ready' | 'notFound' | 'error'
export type LiveStatus = 'connecting' | 'live' | 'offline'

/**
 * Loads a session and keeps it in sync across devices.
 *
 * Every change bumps `sessions.version`, so we subscribe to that single row via
 * Supabase Realtime and re-fetch the full state (one consistent snapshot) when
 * it changes. We also re-fetch after reconnecting, when the tab becomes visible
 * again, when the browser comes back online, and poll slowly while offline.
 */
export function useSessionState(code: string) {
  const [state, setState] = useState<SessionState | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<LiveStatus>('connecting')
  // when the fetch that produced `state` STARTED (lets callers ignore stale snapshots)
  const [fetchedAt, setFetchedAt] = useState(0)

  const inFlight = useRef(false)
  const again = useRef(false)
  const versionRef = useRef(-1)

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    try {
      do {
        again.current = false
        const startedAt = Date.now()
        try {
          const next = await api.getState(code)
          if (!next) {
            setState(null)
            setStatus('notFound')
          } else {
            versionRef.current = next.session.version
            setState(next)
            setFetchedAt(startedAt)
            setStatus('ready')
            setError(null)
          }
        } catch (e) {
          setError((e as ApiError).message)
          setStatus((s) => (s === 'ready' ? 'ready' : 'error'))
        }
      } while (again.current)
    } finally {
      inFlight.current = false
    }
  }, [code])

  // initial load
  useEffect(() => {
    void refresh()
  }, [refresh])

  // realtime subscription once we know the session id
  const sessionId = state?.session.id
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const v = (payload.new as { version?: number }).version
          if (v === undefined || v !== versionRef.current) void refresh()
        },
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          setLive('live')
          void refresh() // catch anything missed while (re)connecting
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setLive('offline')
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, refresh])

  // refetch on focus / network regained
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOnline = () => void refresh()
    const onOffline = () => setLive('offline')
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refresh])

  // safety net: poll while realtime is not connected
  useEffect(() => {
    if (live === 'live') return
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 8000)
    return () => window.clearInterval(t)
  }, [live, refresh])

  return { state, status, error, live, refresh, fetchedAt }
}
