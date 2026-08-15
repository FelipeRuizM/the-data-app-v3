import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { get, ref } from 'firebase/database'
import { OWNER_UID, auth, db } from '../lib/firebase'
import { AuthContext, type AuthState } from './context'
import {
  canWrite as canWriteFn,
  isAdmin as isAdminFn,
  resolveProfileUid,
  resolveRole,
  type RolesEntry,
} from './roles'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [entry, setEntry] = useState<RolesEntry | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const unsub = onAuthStateChanged(auth(), (next) => {
      setStatus('loading')
      if (!next) {
        if (cancelled) return
        setUser(null)
        setEntry(null)
        setStatus('ready')
        return
      }

      // Role lives in /roles, not in the token, so the session isn't "ready"
      // until this read resolves. Rendering before it would flash the wrong
      // permissions — briefly showing write controls to a guest.
      void get(ref(db(), `roles/${next.uid}`))
        .then((snap) => {
          if (cancelled) return
          setUser(next)
          setEntry(snap.exists() ? (snap.val() as RolesEntry) : null)
          setStatus('ready')
        })
        .catch(() => {
          // A denied or failed /roles read must fail CLOSED: no entry means the
          // account resolves to `none` and sees the login screen.
          if (cancelled) return
          setUser(next)
          setEntry(null)
          setStatus('ready')
        })
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  /**
   * The only way in. Email/password for every role — admin, user and guest
   * alike (D-27). Accounts are created by the owner in the Firebase console;
   * there is no registration path, and there is no Google provider.
   */
  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    try {
      await signInWithEmailAndPassword(auth(), email, password)
    } catch (e) {
      setError(messageFor(e))
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    await fbSignOut(auth())
  }, [])

  const value = useMemo<AuthState>(() => {
    const uid = user?.uid ?? null
    const role = resolveRole(uid, OWNER_UID, entry)
    const profileUid = resolveProfileUid(uid, role, entry)
    return {
      status,
      user,
      role,
      profileUid,
      isAdmin: isAdminFn(role),
      canWrite: canWriteFn(uid, role, profileUid),
      error,
      signIn,
      signOut,
    }
  }, [status, user, entry, error, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Firebase error codes are not user-facing copy. Translate the ones we expect. */
function messageFor(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      // Deliberately one message for all four: distinguishing "no such account"
      // from "wrong password" tells an attacker which emails are registered.
      return 'That email and password combination is not right.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.'
    case 'auth/network-request-failed':
      return 'Network problem — check your connection and try again.'
    case 'auth/user-disabled':
      return 'That account has been disabled.'
    default:
      return 'Sign-in failed. Try again.'
  }
}
