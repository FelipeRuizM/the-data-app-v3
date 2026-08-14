import { useContext } from 'react'
import { AuthContext, type AuthState } from './context'

/**
 * The single sources of truth for identity in the UI. Nothing else compares
 * UIDs or role strings (CLAUDE.md §2).
 *
 * There is deliberately no `useIsOwner()`. It encoded a single-owner model that
 * D-3 replaced, and it cannot express "may write to their own profile but not
 * to yours." Re-adding it is a bug, not a convenience.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function useRole() {
  return useAuth().role
}

export function useIsAdmin(): boolean {
  return useAuth().isAdmin
}

/**
 * Whether the viewer can write to the profile on screen.
 *
 * Pass a `profileUid` to ask about a specific profile; omit it to ask about the
 * one currently loaded. Guests are always false.
 */
export function useCanWrite(profileUid?: string): boolean {
  const { canWrite, profileUid: current } = useAuth()
  if (profileUid === undefined) return canWrite
  return canWrite && current === profileUid
}

/** Whose data is on screen — the viewer's own, or the owner's for a guest. */
export function useProfileUid(): string | null {
  return useAuth().profileUid
}
