import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { RouteErrorBoundary } from '../RouteErrorBoundary'

/**
 * Nav is derived from a list, not hand-written per page. In Phase 3 the
 * category entries come from the registry (CLAUDE.md §1) so a future category
 * appears here without editing this file.
 */
const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/workouts', label: 'Workouts', end: false },
  { to: '/runs', label: 'Runs', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
] as const

export function AppLayout() {
  const location = useLocation()

  return (
    <div className="min-h-dvh bg-ground">
      {/* Skip link — first tab stop, keyboard users shouldn't traverse nav on every page */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:border focus:border-accent focus:bg-ground focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:text-ink-0"
      >
        Skip to content
      </a>

      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-4xl flex-wrap items-baseline gap-x-5 gap-y-2 px-5 py-4">
          <span className="font-mono text-label uppercase tracking-[0.14em] text-ink-3">
            the data app
          </span>
          <nav aria-label="Primary" className="flex flex-wrap gap-x-4 gap-y-1">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  'font-mono text-label uppercase tracking-[0.12em] no-underline transition-colors duration-[120ms] ' +
                  (isActive ? 'text-ink-0' : 'text-ink-2 hover:text-ink-1')
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl px-5 pb-24">
        {/* Keyed on pathname so the boundary remounts on navigation — otherwise a
            thrown error sticks and every subsequent page renders the fallback. */}
        <RouteErrorBoundary key={location.pathname}>
          <Outlet />
        </RouteErrorBoundary>
      </main>
    </div>
  )
}
