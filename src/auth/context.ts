import { createContext } from 'react'
import type { User } from 'firebase/auth'
import type { Role } from './roles'

/**
 * Lives apart from AuthProvider so that file exports only a component — mixing
 * a context export with a component export breaks React Fast Refresh.
 */
export type AuthState = {
  /** 'loading' until Firebase has resolved the session AND the /roles lookup. */
  status: 'loading' | 'ready'
  user: User | null
  role: Role
  /** Whose data is on screen. Null when signed out or unprovisioned. */
  profileUid: string | null
  isAdmin: boolean
  canWrite: boolean
  error: string | null
  /** Email/password is the only provider — every role signs in this way (D-27). */
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
