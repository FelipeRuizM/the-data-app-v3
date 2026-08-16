import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { RouteErrorBoundary } from '../RouteErrorBoundary'
import { useAuth } from '../../auth/hooks'
import { CATEGORIES } from '../../categories/registry'
import { APP_VERSION } from '../../version'

/**
 * The category links (Workouts, Runs, …) come from the registry (CLAUDE.md
 * §1) — adding "Flights" later means adding a module and a registry entry,
 * not editing this file. Home and Analytics aren't categories, so they stay
 * as fixed entries either side of the iterated list.
 */
const linkClass = ({ isActive }: { isActive: boolean }) =>
  'font-mono text-label uppercase tracking-[0.12em] no-underline transition-colors duration-[120ms] ' +
  (isActive ? 'text-ink-0' : 'text-ink-2 hover:text-ink-1')

/** The same quiet mono voice as every other transient state — never a spinner. */
function RouteFallback() {
  return (
    <div className="py-16">
      <span className="font-mono text-label tracking-[0.14em] text-ink-2 uppercase">
        Loading…
      </span>
    </div>
  )
}

export function AppLayout() {
  const location = useLocation()
  const { role, canWrite, user, signOut } = useAuth()

  return (
    <div className="min-h-dvh bg-ground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:border focus:border-accent focus:bg-ground focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:text-ink-0"
      >
        Skip to content
      </a>

      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-4xl flex-wrap items-baseline gap-x-5 gap-y-2 px-5 py-4">
          <span className="font-mono text-label tracking-[0.14em] text-ink-2 uppercase">
            the data app{' '}
            {/* Stays at ink-2 with the name rather than dropping to ink-3 —
                that token is axes and disabled states only, 2.23:1 on the
                ground and never text. The "v" is what sets it apart. */}
            <span className="tabular-nums">v{APP_VERSION}</span>
          </span>

          <nav aria-label="Primary" className="flex flex-wrap gap-x-4 gap-y-1">
            <NavLink to="/" end className={linkClass}>
              Home
            </NavLink>
            {CATEGORIES.map((c) => (
              <NavLink key={c.id} to={c.basePath} className={linkClass}>
                {c.label}
              </NavLink>
            ))}
            <NavLink to="/analytics" className={linkClass}>
              Analytics
            </NavLink>
            {/* Settings is per-account and entirely mutating controls, so the
                read-only guest has nothing to do there (§4). */}
            {canWrite ? (
              <NavLink to="/settings" className={linkClass}>
                Settings
              </NavLink>
            ) : null}
            {/* Admin is NOT here any more (D-62) — it is a sub-page of Settings,
                the same shape as Records and the monthly report. Still
                route-guarded by <RequireAdmin>; the guard was always the real
                boundary and the nav entry only ever advertised it. */}
          </nav>

          <div className="ml-auto flex items-baseline gap-3">
            {role === 'guest' ? (
              <span
                className="font-mono text-label tracking-[0.12em] text-accent uppercase"
                title="Read-only. Every write control is hidden and the rules reject writes."
              >
                guest · read only
              </span>
            ) : (
              <span className="hidden font-mono text-label text-ink-2 sm:inline">
                {user?.email ?? ''}
              </span>
            )}
            {/* Sign out lives at the bottom of Settings now (D-62) — EXCEPT for
                a viewer who cannot reach Settings. Settings is behind
                <RequireWrite>, so removing this outright would leave the guest
                account signed in with no way out. */}
            {canWrite ? null : (
              <button
                type="button"
                onClick={() => void signOut()}
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-ink-2 uppercase transition-colors duration-[120ms] hover:text-ink-0"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl px-5 pb-24">
        {/* Keyed on pathname so the boundary remounts on navigation — otherwise a
            thrown error sticks and every subsequent page renders the fallback. */}
        <RouteErrorBoundary key={location.pathname}>
          {/* Every page is a lazy chunk (§9). The boundary sits INSIDE the
              layout so the header and nav stay put while one arrives —
              swapping the whole screen for a fallback would make a 40ms chunk
              fetch look like a page reload. */}
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
    </div>
  )
}
