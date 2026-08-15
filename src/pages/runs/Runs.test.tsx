import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../../test/fixture.json'
import type { RawRun } from '../../types'

const fixtureRuns = fixture.runs as unknown as Record<string, RawRun>

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let rolesEntry: Record<string, string> | null = null
let profileData: unknown = null

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    cb(currentUser)
    return () => {}
  },
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path: string) => path,
  get: async (path: string) => {
    if (path.startsWith('roles/')) {
      return { exists: () => rolesEntry !== null, val: () => rolesEntry }
    }
    if (path.startsWith('users/')) {
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
}))

const { RunsList } = await import('./RunsList')
const { RunDetail } = await import('./RunDetail')
const { AuthProvider } = await import('../../auth/AuthProvider')

function renderList() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RunsList />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function renderDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/runs/${id}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/runs/:id" element={<RunDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const firstRunId = Object.keys(fixtureRuns)[0]!

const settled = (find: () => number) =>
  waitFor(() => expect(find()).toBeGreaterThan(0), { timeout: 5000 })

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  rolesEntry = null
  profileData = fixture
})

describe('RunsList', () => {
  it('lists every run as a link to its detail page', async () => {
    renderList()
    await settled(
      () =>
        screen
          .queryAllByRole('link')
          .filter(
            (a) =>
              /^\/runs\/[^/]+$/.test(a.getAttribute('href') ?? '') &&
              a.getAttribute('href') !== '/runs/records',
          ).length,
    )
    const links = screen
      .getAllByRole('link')
      .filter(
        (a) =>
          /^\/runs\/[^/]+$/.test(a.getAttribute('href') ?? '') &&
          a.getAttribute('href') !== '/runs/records',
      )
    expect(links.length).toBe(Object.keys(fixtureRuns).length)
  })

  it('shows the total count', async () => {
    renderList()
    const n = Object.keys(fixtureRuns).length
    await settled(() => screen.queryAllByText(`${n} runs`).length)
    expect(screen.getByText(`${n} runs`)).toBeInTheDocument()
  })

  it('filters by type and narrows the count', async () => {
    const user = userEvent.setup()
    renderList()
    await settled(
      () =>
        screen
          .queryAllByRole('link')
          .filter(
            (a) =>
              /^\/runs\/[^/]+$/.test(a.getAttribute('href') ?? '') &&
              a.getAttribute('href') !== '/runs/records',
          ).length,
    )
    const otherChip = screen.getByRole('button', { name: /^other$/i })
    await user.click(otherChip)

    await waitFor(() => expect(screen.getByText(/ of /)).toBeInTheDocument())
    const text = screen.getByText(/ of /).textContent ?? ''
    const [shown, total] = text.split(' of ').map((s) => Number(s.trim()))
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThanOrEqual(total!)
  })

  it('renders the registry-driven route without a hardcoded id', async () => {
    // RunsList never imports "runs" as a literal path segment for its rows —
    // it comes from CategoryDefinition.basePath via the Link in RunRow.
    renderList()
    await settled(
      () =>
        screen
          .queryAllByRole('link')
          .filter(
            (a) =>
              /^\/runs\/[^/]+$/.test(a.getAttribute('href') ?? '') &&
              a.getAttribute('href') !== '/runs/records',
          ).length,
    )
    const link = screen
      .getAllByRole('link')
      .find((a) => (a.getAttribute('href') ?? '').startsWith('/runs/'))
    expect(link).toBeDefined()
  })

  it('links to Run records and the Monthly report', async () => {
    renderList()
    await settled(
      () =>
        screen
          .queryAllByRole('link')
          .filter(
            (a) =>
              /^\/runs\/[^/]+$/.test(a.getAttribute('href') ?? '') &&
              a.getAttribute('href') !== '/runs/records',
          ).length,
    )
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '')
    expect(hrefs).toContain('/runs/records')
    expect(hrefs.some((h) => /^\/reports\/\d{4}-\d{2}$/.test(h))).toBe(true)
  })

  it('shows a designed empty state when nothing is logged', async () => {
    profileData = {}
    renderList()
    await settled(() => screen.queryAllByText('No runs logged.').length)
    expect(screen.getByText('No runs logged.')).toBeInTheDocument()
  })
})

describe('RunDetail', () => {
  it('renders derived pace, elevation, difficulty, steps, calories, shoes and watch', async () => {
    renderDetail(firstRunId)
    await settled(() => screen.queryAllByText('Distance').length)
    for (const label of [
      'Distance',
      'Pace',
      'Duration',
      'Avg heart rate',
      'Elevation gain',
      'Max elevation',
      'Difficulty',
      'Steps',
      'Calories',
      'Shoes',
      'Watch',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('never renders a "splits" section — they are not derivable (D-16)', async () => {
    renderDetail(firstRunId)
    await settled(() => screen.queryAllByText('Distance').length)
    expect(screen.queryByText(/split/i)).not.toBeInTheDocument()
  })

  it('shows no PR badges — the records engine is Phase 8', async () => {
    renderDetail(firstRunId)
    await settled(() => screen.queryAllByText('Distance').length)
    expect(screen.queryByText(/PR$/)).not.toBeInTheDocument()
  })

  it('renders the 0 heart-rate sentinel as an em dash, not as 0', async () => {
    const entry = Object.entries(fixtureRuns).find(([, r]) => r.avg_heart_rate === 0)
    expect(entry, 'fixture lost its zero-HR run').toBeDefined()
    renderDetail(entry![0])
    await settled(() => screen.queryAllByText('Distance').length)
    const hr = screen.getByText('Avg heart rate').closest('dt')?.previousElementSibling
    expect(hr?.textContent).toBe('—')
  })

  it('renders the 0 calories sentinel as an em dash, not as 0', async () => {
    const entry = Object.entries(fixtureRuns).find(([, r]) => r.calories === 0)
    expect(entry, 'fixture lost its zero-calorie run').toBeDefined()
    renderDetail(entry![0])
    await settled(() => screen.queryAllByText('Distance').length)
    const cal = screen.getByText('Calories').closest('dt')?.previousElementSibling
    expect(cal?.textContent).toBe('—')
  })

  it('flags the one run whose stored pace disagrees with the derived value', async () => {
    const entry = Object.entries(fixtureRuns).find(([, r]) => {
      if (!r.pace || !r.duration_seconds || !r.distance_km) return false
      const parts = r.pace.split(':').map(Number)
      const stored = (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
      const derived = r.duration_seconds / r.distance_km
      return Math.abs(stored - derived) > 3
    })
    expect(entry, 'fixture lost its pace-mismatch run').toBeDefined()
    renderDetail(entry![0])
    await settled(() => screen.queryAllByText('Distance').length)
    expect(screen.getByText(/wasn.t used/i)).toBeInTheDocument()
  })

  it('does not flag agreement runs', async () => {
    const entry = Object.entries(fixtureRuns).find(([, r]) => {
      if (!r.pace || !r.duration_seconds || !r.distance_km) return false
      const parts = r.pace.split(':').map(Number)
      const stored = (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
      const derived = r.duration_seconds / r.distance_km
      return Math.abs(stored - derived) <= 3
    })
    expect(entry).toBeDefined()
    renderDetail(entry![0])
    await settled(() => screen.queryAllByText('Distance').length)
    expect(screen.queryByText(/wasn.t used/i)).not.toBeInTheDocument()
  })

  it('says so plainly when the id does not exist', async () => {
    renderDetail('no-such-id')
    await settled(() => screen.queryAllByText('No run with that id.').length)
    expect(screen.getByText('No run with that id.')).toBeInTheDocument()
  })
})
