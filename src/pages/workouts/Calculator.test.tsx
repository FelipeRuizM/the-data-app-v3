import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

const { Calculator } = await import('./Calculator')
const { AuthProvider } = await import('../../auth/AuthProvider')
const { ProfileProvider } = await import('../../data/ProfileProvider')

const settled = (find: () => number) =>
  waitFor(() => expect(find()).toBeGreaterThan(0), { timeout: 5000 })

function renderCalc() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProfileProvider>
          <Calculator />
        </ProfileProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** Weight cells only — the table is set / % / weight / reps. */
function weightCells() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[2]!.textContent!.trim())
}

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  profileData = fixture
})

describe('Calculator', () => {
  it('waits for a working weight rather than showing a table of zeroes', async () => {
    renderCalc()
    await settled(() => screen.queryAllByText('Enter a working weight.').length)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('builds the ramp from the typed working weight', async () => {
    const user = userEvent.setup()
    renderCalc()
    await settled(() => screen.queryAllByLabelText(/Working weight/).length)

    await user.type(screen.getByLabelText(/Working weight/), '100')
    await settled(() => screen.queryAllByRole('table').length)

    const weights = weightCells()
    // 2 warm-ups + 3 feeders + the working set
    expect(weights).toHaveLength(6)
    expect(weights[0]).toMatch(/^20\b/)
    expect(weights.at(-1)).toMatch(/^100\b/)
  })

  it('rounds every ramp weight to a loadable increment', async () => {
    const user = userEvent.setup()
    renderCalc()
    await settled(() => screen.queryAllByLabelText(/Working weight/).length)

    await user.type(screen.getByLabelText(/Working weight/), '87.5')
    await settled(() => screen.queryAllByRole('table').length)

    // Every ramp weight (all but the working set) is a multiple of 2.5.
    for (const cell of weightCells().slice(0, -1)) {
      const n = Number(cell.replace(/[^\d.]/g, ''))
      expect(n % 2.5, `${cell} is not loadable`).toBe(0)
    }
  })

  it('leaves the working weight exactly as typed', async () => {
    const user = userEvent.setup()
    renderCalc()
    await settled(() => screen.queryAllByLabelText(/Working weight/).length)

    await user.type(screen.getByLabelText(/Working weight/), '101')
    await settled(() => screen.queryAllByRole('table').length)
    expect(weightCells().at(-1)).toMatch(/^101\b/)
  })

  it('shows set, percent, weight and reps columns (§8)', async () => {
    const user = userEvent.setup()
    renderCalc()
    await settled(() => screen.queryAllByLabelText(/Working weight/).length)
    await user.type(screen.getByLabelText(/Working weight/), '100')
    await settled(() => screen.queryAllByRole('table').length)

    for (const h of ['Set', '%', 'Weight', 'Reps']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
  })

  it('never shows a plate breakdown — one total number per set (D-12)', async () => {
    const user = userEvent.setup()
    renderCalc()
    await settled(() => screen.queryAllByLabelText(/Working weight/).length)
    await user.type(screen.getByLabelText(/Working weight/), '100')
    await settled(() => screen.queryAllByRole('table').length)

    expect(screen.queryByText(/per side/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/plate/i)).not.toBeInTheDocument()
  })

  it('offers the exercise’s record as a starting point', async () => {
    const user = userEvent.setup()
    renderCalc()
    await settled(() => screen.queryAllByLabelText(/Exercise/).length)

    await user.type(screen.getByLabelText(/Exercise/), 'Bench Press (Barbell)')
    await settled(() => screen.queryAllByRole('button', { name: /use record/i }).length)

    await user.click(screen.getByRole('button', { name: /use record/i }))
    await settled(() => screen.queryAllByRole('table').length)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
