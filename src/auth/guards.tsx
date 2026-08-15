import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Label } from '../components/ui'
import { useAuth } from './hooks'

/** Shown while the session and the /roles lookup resolve. */
function Resolving() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ground">
      <Label>Checking your session…</Label>
    </div>
  )
}

/**
 * The login wall. Every route except #/login sits behind this (D-3).
 *
 * `none` covers both signed-out visitors and signed-in accounts that aren't
 * provisioned — the app is invite-only, so valid credentials alone are not access.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, role } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Resolving />
  if (role === 'none') {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/**
 * Admin-only. Route-guarded *and* hidden from nav — hiding alone would leave a
 * typed URL working (CLAUDE.md §4).
 *
 * Sends non-admins home rather than to login: they are legitimately signed in,
 * just not allowed here, and bouncing them to a login screen would be a lie.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, role, isAdmin } = useAuth()

  if (status === 'loading') return <Resolving />
  if (role === 'none') return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * Write-route guard. A guest reaching #/workouts/new by typing it must not get
 * a form it can never submit.
 */
export function RequireWrite({ children }: { children: ReactNode }) {
  const { status, role, canWrite } = useAuth()

  if (status === 'loading') return <Resolving />
  if (role === 'none') return <Navigate to="/login" replace />
  if (!canWrite) return <Navigate to="/" replace />
  return <>{children}</>
}
