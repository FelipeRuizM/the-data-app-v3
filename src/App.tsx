import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { NotFound } from './pages/NotFound'
import { Placeholder } from './pages/Placeholder'
import { Styleguide } from './pages/Styleguide'

/**
 * HashRouter, not BrowserRouter. GitHub Pages has no SPA rewrite, so a deep
 * link under BrowserRouter 404s on refresh (CLAUDE.md §2). This is not a
 * preference — swapping it breaks the deployment.
 *
 * The route table mirrors CLAUDE.md §4. Pages arrive phase by phase; until then
 * each route renders a Placeholder naming the phase that builds it.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Placeholder title="Home" phase="Phase 3" />} />

          <Route
            path="workouts"
            element={<Placeholder title="Workouts" phase="Phase 4" />}
          />
          <Route
            path="workouts/records"
            element={<Placeholder title="Records" phase="Phase 8" />}
          />
          <Route
            path="workouts/calculator"
            element={
              <Placeholder title="Warm-up & feeder calculator" phase="Phase 11" />
            }
          />
          <Route
            path="workouts/:id"
            element={<Placeholder title="Workout detail" phase="Phase 4" />}
          />

          <Route path="runs" element={<Placeholder title="Runs" phase="Phase 5" />} />
          <Route
            path="runs/records"
            element={<Placeholder title="Run records" phase="Phase 8" />}
          />
          <Route
            path="runs/:id"
            element={<Placeholder title="Run detail" phase="Phase 5" />}
          />

          <Route
            path="reports/:month"
            element={<Placeholder title="Monthly report" phase="Phase 9" />}
          />
          <Route
            path="analytics"
            element={<Placeholder title="Analytics" phase="Phase 14" />}
          />
          <Route
            path="settings"
            element={<Placeholder title="Settings" phase="Phase 12" />}
          />
          <Route
            path="admin"
            element={<Placeholder title="Admin" phase="Phase 13" />}
          />
          <Route
            path="login"
            element={<Placeholder title="Sign in" phase="Phase 2" />}
          />

          <Route path="styleguide" element={<Styleguide />} />

          {/* Trailing-slash and legacy shapes shouldn't 404 */}
          <Route path="index.html" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
