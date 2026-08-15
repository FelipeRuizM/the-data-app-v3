import { useCallback, useEffect, useRef, useState } from 'react'
import { invalidateProfile } from '../../data/useProfile'

/**
 * The save lifecycle every Settings section shares.
 *
 * Each section owns its own instance, so a failed calculator save cannot make
 * the units toggle look broken — and a section that is saving disables only its
 * own button.
 *
 * On success the profile is invalidated, because Settings stays mounted after
 * it writes and a rename cascade changes far more than the row that was edited.
 */
export type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; message: string }

export function useSave(): {
  status: SaveStatus
  /** Runs the write, then refreshes the profile. Never throws at the caller. */
  save: (run: () => Promise<unknown>) => Promise<boolean>
  reset: () => void
} {
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' })
  const alive = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const reset = useCallback(() => setStatus({ state: 'idle' }), [])

  const save = useCallback(async (run: () => Promise<unknown>): Promise<boolean> => {
    setStatus({ state: 'saving' })
    try {
      await run()
      invalidateProfile()
      if (!alive.current) return true
      setStatus({ state: 'saved' })
      // The confirmation fades; the error does not. An error the user hasn't
      // read yet is not something to clear on a timer.
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        if (alive.current) setStatus({ state: 'idle' })
      }, 2500)
      return true
    } catch (e: unknown) {
      if (!alive.current) return false
      setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) })
      return false
    }
  }, [])

  return { status, save, reset }
}
