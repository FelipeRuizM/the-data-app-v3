import { useEffect, useState } from 'react'
import { loadProfile, type LoadResult } from '../lib/db'
import { useAuth } from '../auth/hooks'

export type ProfileState =
  | { status: 'loading' }
  /** The read was denied. Distinct from empty — they must never look the same. */
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: LoadResult }

/**
 * Tell every mounted `useProfile` to re-read.
 *
 * Needed because Settings stays on screen after it writes — unlike the forms,
 * which navigate away and remount. A rename cascade changes workouts as well as
 * the catalog, so nothing short of a real re-read is honest about the result.
 *
 * A module-level set rather than a context: this is a one-way signal with no
 * state of its own, and threading a refetch through the auth context would make
 * every consumer re-render for something only one page uses.
 */
const listeners = new Set<() => void>()

export function invalidateProfile(): void {
  for (const notify of listeners) notify()
}

/**
 * Load the profile currently on screen — the viewer's own, or the owner's when
 * the viewer is a guest (D-23). The uid comes from the auth layer; no component
 * chooses it.
 */
export function useProfile(): ProfileState {
  const { status: authStatus, profileUid } = useAuth()
  const [state, setState] = useState<ProfileState>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const notify = () => setNonce((n) => n + 1)
    listeners.add(notify)
    return () => {
      listeners.delete(notify)
    }
  }, [])

  useEffect(() => {
    if (authStatus !== 'ready') {
      setState({ status: 'loading' })
      return
    }
    if (!profileUid) {
      setState({ status: 'denied' })
      return
    }

    let cancelled = false
    // On a re-read, the previous data stays on screen. Flashing the whole page
    // back to a skeleton because a units toggle was saved would be a worse lie
    // than showing data that is one moment stale.
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))

    loadProfile(profileUid)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        // A rules rejection is not an empty profile; say so plainly.
        setState(
          /permission|denied/i.test(message)
            ? { status: 'denied' }
            : { status: 'error', message },
        )
      })

    return () => {
      cancelled = true
    }
  }, [authStatus, profileUid, nonce])

  return state
}
