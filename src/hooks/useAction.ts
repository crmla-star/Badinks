import { useCallback, useRef, useState } from 'react'
import { BENIGN_ERRORS, type ApiError } from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * Runs one server action at a time. While an action is pending every other
 * action is ignored, which (together with the server-side checks) prevents
 * accidental double taps from doing anything twice.
 */
export function useAction(refresh: () => Promise<void>) {
  const [pending, setPending] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string, quiet: string[] = []): Promise<T | undefined> => {
      if (pendingRef.current) return undefined
      pendingRef.current = key
      setPending(key)
      try {
        const result = await fn()
        if (success) showToast(success, 'success')
        return result
      } catch (e) {
        const err = e as ApiError
        if (!BENIGN_ERRORS.has(err.code) && !quiet.includes(err.code)) showToast(err.message, 'error')
        throw err
      } finally {
        pendingRef.current = null
        setPending(null)
        void refresh()
      }
    },
    [refresh],
  )

  /** Same as run, but swallows errors (they were already shown as a toast). */
  const fire = useCallback(
    <T,>(key: string, fn: () => Promise<T>, success?: string) => {
      run(key, fn, success).catch(() => {})
    },
    [run],
  )

  return { pending, run, fire }
}
