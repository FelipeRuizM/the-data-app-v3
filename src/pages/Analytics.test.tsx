import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../test/fixture.json'

/**
 * Analytics is the §1 registry rule's payoff, so the load-bearing test is that
 * BOTH categories reach every cross-category aggregate — not just workouts,
 * which is what a hardcoded page would quietly do.
 */

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let profileData: unknown = null
let profileReadFails: string | null = null

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
      if (profileReadFails) throw new Error(profileReadFails)
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
}))

const { Analytics } = await import('./Analytics')
const { AuthProvider } = await import('../auth/AuthProvider')

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Analytics />
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function ready() {
  await screen.findByRole('heading', { name: 'Everything, all together' })
}

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  profileData = fixture
  profileReadFails = null
})

/* ── the registry drives it ─────────────────────────────────────────────── */

describe('registry-driven aggregation', () => {
  it('counts activities from EVERY category, not just workouts', async () => {
    renderPage()
    await ready()

    const total =
      Object.keys(fixture.workouts).length + Object.keys(fixture.runs).length
    const section = screen
      .getByRole('heading', { name: 'Everything, all together' })
      .closest('section')!
    expect(within(section).getByText(String(total))).toBeInTheDocument()
  })

  it('renders one headline per registry entry, named by the category', async () => {
    renderPage()
    await ready()
    // The page never says "volume" or "distance" itself — the registry does.
    expect(screen.getByText('Total volume')).toBeInTheDocument()
    expect(screen.getByText('Total distance')).toBeInTheDocument()
    expect(screen.getByText('Workouts')).toBeInTheDocument()
    expect(screen.getByText('Runs')).toBeInTheDocument()
  })
})

/* ── the sections §4 asks for ───────────────────────────────────────────── */

describe('sections', () => {
  it('renders totals, streaks, rhythm, trend, balance, places and people', async () => {
    renderPage()
    await ready()
    for (const name of [
      'Everything, all together',
      'Streaks',
      'Rhythm',
      'Month by month',
      'Muscle-group balance',
      'Places and people',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  it('says weeks run Sunday to Saturday, so the streak rule is legible (D-15)', async () => {
    renderPage()
    await ready()
    const section = screen.getByRole('heading', { name: 'Streaks' }).closest('section')!
    expect(section).toHaveTextContent(/Sunday to Saturday/i)
    expect(section).toHaveTextContent(/rest day never breaks/i)
  })
})

/* ── charts carry a text alternative (§5, §9) ───────────────────────────── */

describe('accessibility', () => {
  it('gives the heatmap a real table of the same numbers', async () => {
    renderPage()
    await ready()

    const alt = screen.getByRole('table', { name: /Activities by weekday and hour/i })
    expect(within(alt).getByRole('rowheader', { name: 'Sun' })).toBeInTheDocument()
    expect(within(alt).getByRole('rowheader', { name: 'Sat' })).toBeInTheDocument()
  })

  it('names the place and partner breakdowns rather than leaving bare bars', async () => {
    renderPage()
    await ready()
    expect(screen.getByRole('heading', { name: 'Places' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Training partners' }),
    ).toBeInTheDocument()
  })
})

/* ── empty and denied read differently (§9) ─────────────────────────────── */

describe('states', () => {
  it('designs the empty state instead of rendering zeroes', async () => {
    profileData = {}
    renderPage()

    expect(await screen.findByText('No activity to analyse.')).toBeInTheDocument()
    // Not a wall of 0s and em dashes.
    expect(screen.queryByRole('heading', { name: 'Streaks' })).toBeNull()
  })

  it('distinguishes a DENIED read from an empty profile', async () => {
    // A missing node is an empty profile; a rules rejection is not. They must
    // never render the same thing (§9).
    profileReadFails = 'permission_denied at /users'
    renderPage()
    expect(await screen.findByText(/isn’t readable/)).toBeInTheDocument()
    expect(screen.queryByText('No activity to analyse.')).toBeNull()
  })
})
