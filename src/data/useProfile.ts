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
 * Load the profile currently on screen — the viewer's own, or the owner's when
 * the viewer is a guest (D-23). The uid comes from the auth layer; no component
 * chooses it.
 */
export function useProfile(): ProfileState {
  const { status: authStatus, profileUid } = useAuth()
  const [state, setState] = useState<ProfileState>({ status: 'loading' })

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
    setState({ status: 'loading' })

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
  }, [authStatus, profileUid])

  return state
}
