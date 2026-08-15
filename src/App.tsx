import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAdmin, RequireAuth, RequireWrite } from './auth/guards'
import { missingEnvVars } from './lib/firebase'
import { Label } from './components/ui'
import { Home } from './pages/Home'
import { MonthlyReport } from './pages/MonthlyReport'
import { WorkoutDetail } from './pages/workouts/WorkoutDetail'
import { WorkoutsList } from './pages/workouts/WorkoutsList'
import { WorkoutForm } from './pages/workouts/WorkoutForm'
import { Records } from './pages/workouts/Records'
import { Calculator } from './pages/workouts/Calculator'
import { RecordDetail } from './pages/workouts/RecordDetail'
import { RunDetail } from './pages/runs/RunDetail'
import { RunsList } from './pages/runs/RunsList'
import { RunForm } from './pages/runs/RunForm'
import { RunRecords } from './pages/runs/RunRecords'
import { Login } from './pages/Login'
import { NotFound } from './pages/NotFound'
import { Placeholder } from './pages/Placeholder'
import { Settings } from './pages/Settings'
import { Styleguide } from './pages/Styleguide'

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
            <Route
              path="analytics"
              element={<Placeholder title="Analytics" phase="Phase 14" />}
            />
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
                  <Placeholder title="Admin" phase="Phase 13" />
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
