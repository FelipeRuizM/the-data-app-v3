import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../../test/fixture.json'
import type { RawWorkout } from '../../types'
import { toList } from '../../lib/normalize'

/** JSON infers a union of set shapes; this is the shape it really is. */
const fixtureWorkouts = fixture.workouts as unknown as Record<string, RawWorkout>

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

const { WorkoutsList } = await import('./WorkoutsList')
const { WorkoutDetail } = await import('./WorkoutDetail')
const { AuthProvider } = await import('../../auth/AuthProvider')

function renderList() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <WorkoutsList />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function renderDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/workouts/${id}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/workouts/:id" element={<WorkoutDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const firstWorkoutId = Object.keys(fixture.workouts)[0]!

/**
 * Wait for loaded content, not for "any listitem" — the loading skeleton is
 * itself a list, so waiting on listitems passes instantly and the assertion
 * then runs against the skeleton. The generous timeout covers the mocked auth
 * round-trip plus the profile read.
 */
const settled = (find: () => number) =>
  waitFor(() => expect(find()).toBeGreaterThan(0), { timeout: 5000 })

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  rolesEntry = null
  profileData = fixture
})

describe('WorkoutsList', () => {
  it('lists workouts as links to their detail pages', async () => {
    renderList()
    await settled(() => screen.queryAllByRole('link').length)
    const links = screen
      .getAllByRole('link')
      .filter((a) => (a.getAttribute('href') ?? '').startsWith('/workouts/'))
    expect(links.length).toBe(Object.keys(fixture.workouts).length)
  })

  it('shows the total count', async () => {
    renderList()
    const n = Object.keys(fixture.workouts).length
    await settled(() => screen.queryAllByText(`${n} workouts`).length)
    expect(screen.getByText(`${n} workouts`)).toBeInTheDocument()
  })

  it('filters by category and reports the narrowed count', async () => {
    const user = userEvent.setup()
    renderList()
    await settled(() => screen.queryAllByRole('link').length)
    const pushChip = screen.getByRole('button', { name: /^push$/i })
    await user.click(pushChip)

    await waitFor(() => expect(screen.getByText(/ of /)).toBeInTheDocument())
    const text = screen.getByText(/ of /).textContent ?? ''
    const [shown, total] = text.split(' of ').map((s) => Number(s.trim()))
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThan(total!)
  })

  it('clearing the filter restores every workout', async () => {
    const user = userEvent.setup()
    renderList()
    const pushChip = await screen.findByRole('button', { name: /^push$/i })
    await user.click(pushChip)
    await screen.findByText(/ of /)

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    const n = Object.keys(fixture.workouts).length
    expect(await screen.findByText(`${n} workouts`)).toBeInTheDocument()
  })

  it('offers an Uncategorized filter because the data contains one', async () => {
    renderList()
    await settled(() => screen.queryAllByRole('link').length)
    expect(screen.getByRole('button', { name: /uncategorized/i })).toBeInTheDocument()
  })

  it('shows a designed empty state, not a bare message, when nothing is logged', async () => {
    profileData = {}
    renderList()
    await settled(() => screen.queryAllByText('No workouts logged.').length)
    expect(screen.getByText('No workouts logged.')).toBeInTheDocument()
  })
})

describe('WorkoutDetail', () => {
  it('renders the exercises and their sets as a table', async () => {
    renderDetail(firstWorkoutId)
    await settled(() => screen.queryAllByRole('table').length)
    expect(
      screen.getAllByRole('columnheader', { name: 'Weight' }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('columnheader', { name: 'Reps' }).length,
    ).toBeGreaterThan(0)
  })

  it('renders bodyweight sets as BW rather than 0', async () => {
    // Find the fixture workout that actually has an absent weight_kg.
    const entry = Object.entries(fixtureWorkouts).find(([, w]) =>
      toList(w.exercises).some((e) => toList(e.sets).some((s) => s.weight_kg == null)),
    )
    expect(entry).toBeDefined()
    renderDetail(entry![0])
    await settled(() => screen.queryAllByRole('table').length)
    expect(screen.getAllByText('BW').length).toBeGreaterThan(0)
  })

  it('renders a genuine 0 kg set as 0 kg, not as BW', async () => {
    const entry = Object.entries(fixtureWorkouts).find(([, w]) =>
      toList(w.exercises).some((e) => toList(e.sets).some((s) => s.weight_kg === 0)),
    )
    expect(entry).toBeDefined()
    renderDetail(entry![0])
    await settled(() => screen.queryAllByRole('table').length)
    expect(screen.getAllByText('0 kg').length).toBeGreaterThan(0)
  })

  it('warns that bodyweight sets are excluded while no bodyweight is set', async () => {
    const entry = Object.entries(fixtureWorkouts).find(([, w]) =>
      toList(w.exercises).some((e) => toList(e.sets).some((s) => s.weight_kg == null)),
    )!
    renderDetail(entry[0])
    await settled(() => screen.queryAllByRole('table').length)
    expect(screen.getByText(/excluded from the volume/i)).toBeInTheDocument()
  })

  it('says so plainly when the id does not exist', async () => {
    renderDetail('no-such-id')
    await settled(() => screen.queryAllByText('No workout with that id.').length)
    expect(screen.getByText('No workout with that id.')).toBeInTheDocument()
  })

  it('shows no PR badges — the records engine is Phase 8', async () => {
    renderDetail(firstWorkoutId)
    await settled(() => screen.queryAllByRole('table').length)
    expect(screen.queryByText(/PR$/)).not.toBeInTheDocument()
  })
})
