import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { loadProfile } from '../lib/db'
import { useAuth } from '../auth/hooks'
import {
  ProfileContext,
  setProfileRefresher,
  type ProfileState,
} from './profileContext'

/**
 * The profile, loaded once for the whole app (D-61).
 *
 * Before this, `useProfile` was a per-component hook: every page held its own
 * state and issued its own `loadProfile`, so **every navigation re-downloaded
 * the entire profile** — all 81 workouts, every set, plus `/config`. Correct,
 * and roughly 350 KB per tap on mobile data, growing with the log.
 *
 * Now there is one read, shared. Which means the app has to say explicitly when
 * that read happens again, and there are exactly three answers:
 *
 *  1. **auth changes** — a different account is a different profile;
 *  2. **a write** — `invalidateProfile()`, awaited so the caller can navigate
 *     into the data it just wrote;
 *  3. **coming back to the tab**, if what we hold has gone stale.
 *
 * Reads stay one-shot `get()`, not `onValue` subscriptions. A live subscription
 * would keep a socket open for a single-user app that is looked at a few times
 * a day, and (3) covers the case it would buy.
 */

/**
 * How old the data must be before returning to the tab re-reads it.
 *
 * Not zero: switching to the camera and back should not re-download the profile
 * every time. Not long either — a minute-old profile is the thing you came back
 * to look at.
 */
const STALE_AFTER_MS = 30_000

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, profileUid } = useAuth()
  const [state, setState] = useState<ProfileState>({ status: 'loading' })
  const loadedAt = useRef(0)
  /** Supersedes an in-flight read, so a slow one can't overwrite a newer one. */
  const runId = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const id = ++runId.current

    if (authStatus !== 'ready') {
      setState({ status: 'loading' })
      return
    }
    if (!profileUid) {
      setState({ status: 'denied' })
      return
    }

    // On a re-read the previous data stays on screen. Flashing the whole app
    // back to a skeleton because a units toggle was saved would be a worse lie
    // than showing data that is one moment stale.
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))

    try {
      const data = await loadProfile(profileUid)
      if (id !== runId.current) return
      loadedAt.current = Date.now()
      setState({ status: 'ready', data })
    } catch (e: unknown) {
      if (id !== runId.current) return
      const message = e instanceof Error ? e.message : String(e)
      // A rules rejection is not an empty profile; say so plainly.
      setState(
        /permission|denied/i.test(message)
          ? { status: 'denied' }
          : { status: 'error', message },
      )
    }
  }, [authStatus, profileUid])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setProfileRefresher(load)
    return () => setProfileRefresher(null)
  }, [load])

  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - loadedAt.current < STALE_AFTER_MS) return
      void load()
    }
    // Both events: `visibilitychange` is what fires when you switch apps on a
    // phone, `focus` is what fires when you click back into a desktop window.
    window.addEventListener('focus', maybeRefresh)
    document.addEventListener('visibilitychange', maybeRefresh)
    return () => {
      window.removeEventListener('focus', maybeRefresh)
      document.removeEventListener('visibilitychange', maybeRefresh)
    }
  }, [load])

  return <ProfileContext.Provider value={state}>{children}</ProfileContext.Provider>
}
