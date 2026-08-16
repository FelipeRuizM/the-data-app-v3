import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../../test/fixture.json'

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let profileData: unknown = null

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({
  // initializeAuth, not getAuth: the app omits the popup/redirect resolver so
  // Firebase never loads its auth iframe (133 KiB of third-party JS).
  initializeAuth: () => ({}),
  browserLocalPersistence: {},
  indexedDBLocalPersistence: {},
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
  ref: (_db: unknown, path?: string) => path ?? '',
  get: async (path: string) => {
    if (path.startsWith('roles/')) return { exists: () => false, val: () => null }
    if (path.startsWith('users/')) {
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
}))

const { Records } = await import('./Records')
const { RecordDetail } = await import('./RecordDetail')
const { RunRecords } = await import('../runs/RunRecords')
const { AuthProvider } = await import('../../auth/AuthProvider')
const { ProfileProvider } = await import('../../data/ProfileProvider')

const settled = (find: () => number) =>
  waitFor(() => expect(find()).toBeGreaterThan(0), { timeout: 5000 })

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ProfileProvider>
          <Routes>
            <Route path="/workouts/records" element={<Records />} />
            <Route path="/workouts/records/:exercise" element={<RecordDetail />} />
            <Route path="/runs/records" element={<RunRecords />} />
          </Routes>
        </ProfileProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  profileData = fixture
})

describe('Records page', () => {
  it('lists exercises with records, linking to their detail pages', async () => {
    renderAt('/workouts/records')
    await settled(() => screen.queryAllByRole('link').length)
    const links = screen
      .getAllByRole('link')
      .filter((a) => (a.getAttribute('href') ?? '').includes('/workouts/records/'))
    expect(links.length).toBeGreaterThan(0)
  })

  it('shows a Hall of Fame grouped by muscle group', async () => {
    renderAt('/workouts/records')
    await settled(() => screen.queryAllByText('Hall of Fame').length)
    // Real muscle groups from the catalog, not invented headings.
    expect(
      screen.getAllByText(/Legs|Back|Chest|Arms|Shoulders/).length,
    ).toBeGreaterThan(0)
  })

  it('says records are never stored — they are recomputed', async () => {
    renderAt('/workouts/records')
    await settled(() => screen.queryAllByText(/Nothing here is stored/i).length)
    expect(screen.getByText(/Nothing here is stored/i)).toBeInTheDocument()
  })

  it('shows a designed empty state when there is no history', async () => {
    profileData = {}
    renderAt('/workouts/records')
    await settled(() => screen.queryAllByText('No records yet.').length)
    expect(screen.getByText('No records yet.')).toBeInTheDocument()
  })
})

describe('RecordDetail page', () => {
  it('renders the three maxima for a loaded exercise', async () => {
    renderAt(`/workouts/records/${encodeURIComponent('Bench Press (Barbell)')}`)
    await settled(() => screen.queryAllByText('Max weight').length)
    expect(screen.getByText('Max weight')).toBeInTheDocument()
    expect(screen.getByText('Max reps')).toBeInTheDocument()
    expect(screen.getByText('Max set volume')).toBeInTheDocument()
  })

  it('provides a text alternative table for every chart', async () => {
    // Triceps Pushdown spans 5 sessions; a chart only renders with more than
    // one point, so a single-session exercise would legitimately have none.
    renderAt(`/workouts/records/${encodeURIComponent('Triceps Pushdown')}`)
    await settled(() => screen.queryAllByText('Max weight').length)
    // Charts are SVG; the accessible equivalent is a visually-hidden table.
    expect(screen.queryAllByRole('table').length).toBeGreaterThan(0)
  })

  it('renders ONE set-by-set chart for an exercise with history (D-63)', async () => {
    renderAt(`/workouts/records/${encodeURIComponent('Triceps Pushdown')}`)
    await settled(() => screen.queryAllByText('Max weight').length)

    expect(screen.getByRole('heading', { name: 'Set by set' })).toBeInTheDocument()
    // One plot, not four. The per-session charts are gone entirely.
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.queryByText(/per session/i)).not.toBeInTheDocument()
    // And it carries its text alternative (§9).
    expect(screen.getByText('Every working set, oldest first')).toBeInTheDocument()
  })

  it('offers all three series, and refuses to turn the last one off', async () => {
    const user = userEvent.setup()
    renderAt(`/workouts/records/${encodeURIComponent('Triceps Pushdown')}`)
    await settled(() => screen.queryAllByRole('button', { name: 'reps' }).length)

    for (const key of ['reps', 'weight', 'volume']) {
      expect(screen.getByRole('button', { name: key })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }

    await user.click(screen.getByRole('button', { name: 'reps' }))
    expect(screen.getByRole('button', { name: 'reps' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(screen.getByRole('button', { name: 'weight' }))
    await user.click(screen.getByRole('button', { name: 'volume' }))
    // "Show me nothing" is not a question anyone asks of this chart.
    expect(screen.getByRole('button', { name: 'volume' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('says so plainly for an exercise that was never logged', async () => {
    renderAt('/workouts/records/Not%20A%20Real%20Exercise')
    await settled(() => screen.queryAllByText('No records for that exercise.').length)
    expect(screen.getByText('No records for that exercise.')).toBeInTheDocument()
  })
})

describe('RunRecords page', () => {
  it('lists one personal best per metric, linking to the run', async () => {
    renderAt('/runs/records')
    await settled(() => screen.queryAllByRole('link').length)
    expect(screen.getByText('Fastest pace')).toBeInTheDocument()
    expect(screen.getByText('Longest distance')).toBeInTheDocument()
    const links = screen
      .getAllByRole('link')
      .filter((a) => (a.getAttribute('href') ?? '').startsWith('/runs/'))
    expect(links.length).toBeGreaterThan(0)
  })

  it('shows an empty state when nothing is logged', async () => {
    profileData = {}
    renderAt('/runs/records')
    await settled(() => screen.queryAllByText('No run records yet.').length)
    expect(screen.getByText('No run records yet.')).toBeInTheDocument()
  })
})
