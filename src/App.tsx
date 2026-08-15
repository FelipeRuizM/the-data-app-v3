import { lazy } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAdmin, RequireAuth, RequireWrite } from './auth/guards'
import { missingEnvVars } from './lib/firebase'
import { Label } from './components/ui'
import { Login } from './pages/Login'

/**
 * Every page is its own chunk (§9's Lighthouse target). Firebase, date-fns and
 * the chart code stop being part of the first paint.
 *
 * Login is the exception and stays eager: it is the only route an
 * unauthenticated visitor can reach, so lazy-loading it would put a fallback in
 * front of the very first paint for the one case with nothing cached.
 *
 * Written out one by one rather than through a helper. A generic wrapper reads
 * as tidier but erases each page's props — WorkoutForm and RunForm take a
 * `mode`, and the first attempt at a helper silently typed it away.
 */
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })))
const MonthlyReport = lazy(() =>
  import('./pages/MonthlyReport').then((m) => ({ default: m.MonthlyReport })),
)
const WorkoutsList = lazy(() =>
  import('./pages/workouts/WorkoutsList').then((m) => ({ default: m.WorkoutsList })),
)
const WorkoutDetail = lazy(() =>
  import('./pages/workouts/WorkoutDetail').then((m) => ({ default: m.WorkoutDetail })),
)
const WorkoutForm = lazy(() =>
  import('./pages/workouts/WorkoutForm').then((m) => ({ default: m.WorkoutForm })),
)
const Records = lazy(() =>
  import('./pages/workouts/Records').then((m) => ({ default: m.Records })),
)
const RecordDetail = lazy(() =>
  import('./pages/workouts/RecordDetail').then((m) => ({ default: m.RecordDetail })),
)
const Calculator = lazy(() =>
  import('./pages/workouts/Calculator').then((m) => ({ default: m.Calculator })),
)
const RunsList = lazy(() =>
  import('./pages/runs/RunsList').then((m) => ({ default: m.RunsList })),
)
const RunDetail = lazy(() =>
  import('./pages/runs/RunDetail').then((m) => ({ default: m.RunDetail })),
)
const RunForm = lazy(() =>
  import('./pages/runs/RunForm').then((m) => ({ default: m.RunForm })),
)
const RunRecords = lazy(() =>
  import('./pages/runs/RunRecords').then((m) => ({ default: m.RunRecords })),
)
const Analytics = lazy(() =>
  import('./pages/Analytics').then((m) => ({ default: m.Analytics })),
)
const Settings = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings })),
)
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })))
const Styleguide = lazy(() =>
  import('./pages/Styleguide').then((m) => ({ default: m.Styleguide })),
)
const NotFound = lazy(() =>
  import('./pages/NotFound').then((m) => ({ default: m.NotFound })),
)

/** Build-time config is missing — the single most likely deployment failure. */
function ConfigError({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <Label>Configuration error</Label>
      <h1 className="m-0 text-2xl font-semibold text-ink-0">
        This build is missing its Firebase config.
      </h1>
      <p className="m-0 text-ink-1">
        These variables weren&rsquo;t injected at build time. Add them as repository
        <em> variables</em> (not secrets) and re-run the deploy.
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {missing.map((k) => (
          <li key={k} className="font-mono text-sm text-accent">
            {k}
          </li>
        ))}
      </ul>
    </main>
  )
}

/**
 * HashRouter, not BrowserRouter. GitHub Pages has no SPA rewrite, so a deep
 * link under BrowserRouter 404s on refresh (CLAUDE.md §2).
 *
 * Every route except /login sits inside <RequireAuth>. Write routes add
 * <RequireWrite> so a guest typing the URL doesn't get a form it can never
 * submit; /admin adds <RequireAdmin>. The rules are still the real boundary —
 * these guards only keep the UI honest.
 */
export function App() {
  const missing = missingEnvVars()
  if (missing.length > 0) return <ConfigError missing={missing} />

  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />

            <Route path="workouts" element={<WorkoutsList />} />
            <Route
              path="workouts/new"
              element={
                <RequireWrite>
                  <WorkoutForm mode="create" />
                </RequireWrite>
              }
            />
            <Route path="workouts/records" element={<Records />} />
            <Route path="workouts/records/:exercise" element={<RecordDetail />} />
            <Route path="workouts/calculator" element={<Calculator />} />
            <Route path="workouts/:id" element={<WorkoutDetail />} />
            <Route
              path="workouts/:id/edit"
              element={
                <RequireWrite>
                  <WorkoutForm mode="edit" />
                </RequireWrite>
              }
            />

            <Route path="runs" element={<RunsList />} />
            <Route
              path="runs/new"
              element={
                <RequireWrite>
                  <RunForm mode="create" />
                </RequireWrite>
              }
            />
            <Route path="runs/records" element={<RunRecords />} />
            <Route path="runs/:id" element={<RunDetail />} />
            <Route
              path="runs/:id/edit"
              element={
                <RequireWrite>
                  <RunForm mode="edit" />
                </RequireWrite>
              }
            />

            <Route path="reports/:month" element={<MonthlyReport />} />
            <Route path="analytics" element={<Analytics />} />
            {/* Per-account, and every control on it is a mutating one — so a
                guest is bounced rather than shown a page it cannot use (§4). */}
            <Route
              path="settings"
              element={
                <RequireWrite>
                  <Settings />
                </RequireWrite>
              }
            />
            <Route
              path="admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />

            <Route path="styleguide" element={<Styleguide />} />

            <Route path="index.html" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}
