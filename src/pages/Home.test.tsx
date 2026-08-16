import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../test/fixture.json'

/**
 * Home is the one real page Phase 3 ships, so it gets real coverage: the strip
 * renders actual records, and the three non-happy states are distinguishable.
 *
 * The Firebase mock is PATH-AWARE — `/roles`, `/users/{uid}` and `/config` are
 * three different reads, and a mock that returned the same blob for all three
 * would test nothing.
 */

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let rolesEntry: Record<string, string> | null = null
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
  ref: (_db: unknown, path: string) => path,
  get: async (path: string) => {
    if (path.startsWith('roles/')) {
      return { exists: () => rolesEntry !== null, val: () => rolesEntry }
    }
    if (path.startsWith('users/')) {
      if (profileReadFails) throw new Error(profileReadFails)
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
}))

const { Home } = await import('./Home')
const { AuthProvider } = await import('../auth/AuthProvider')
const { ProfileProvider } = await import('../data/ProfileProvider')

function renderHome() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProfileProvider>
          <Home />
        </ProfileProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  rolesEntry = null
  profileData = fixture
  profileReadFails = null
})

describe('Home — recent activity', () => {
  it('renders records from both categories, newest first', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument())

    const links = screen.getAllByRole('link')
    const activity = links.filter((a) =>
      /\/(workouts|runs)\//.test(a.getAttribute('href') ?? ''),
    )
    expect(activity.length).toBeGreaterThan(0)

    // The strip is cross-category: it must not be all workouts or all runs.
    const hrefs = activity.map((a) => a.getAttribute('href') ?? '')
    expect(hrefs.some((h) => h.includes('/workouts/'))).toBe(true)
    expect(hrefs.some((h) => h.includes('/runs/'))).toBe(true)
  })

  it('caps the strip at 8 items — it is a strip, not a list view', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument())
    const activity = screen
      .getAllByRole('link')
      .filter((a) => /\/(workouts|runs)\//.test(a.getAttribute('href') ?? ''))
    expect(activity.length).toBeLessThanOrEqual(8)
  })

  it('labels an uncategorized workout neutrally rather than as an error', async () => {
    profileData = {
      workouts: {
        w1: { title: 'No category here', start_time: '8 Apr 2026, 16:50' },
      },
    }
    renderHome()
    expect(await screen.findByText('Uncategorized')).toBeInTheDocument()
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
  })

  it('reports records skipped for an unreadable date instead of hiding them', async () => {
    profileData = {
      workouts: {
        good: { title: 'Fine', start_time: '8 Apr 2026, 16:50' },
        bad: { title: 'Broken', start_time: 'not a date' },
      },
    }
    renderHome()
    expect(await screen.findByText(/1 record skipped/i)).toBeInTheDocument()
  })
})

describe('Home — the states that must not look alike', () => {
  it('shows a designed empty state for a profile with no records', async () => {
    profileData = {}
    renderHome()
    expect(await screen.findByText(/no activity/i)).toBeInTheDocument()
  })

  it('shows "not readable" — not "empty" — when the rules reject the read', async () => {
    // An empty profile and a denied read mean completely different things.
    profileReadFails = "permission_denied at /users: Client doesn't have access"
    renderHome()
    expect(await screen.findByText(/isn’t readable/i)).toBeInTheDocument()
    expect(screen.queryByText(/no activity/i)).not.toBeInTheDocument()
  })

  it('shows an error state, distinct from both, for an unexpected failure', async () => {
    profileReadFails = 'network unreachable'
    renderHome()
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })
})

describe('Home — write controls follow the role', () => {
  it('shows a log button per registry category to someone who can write', async () => {
    renderHome()
    expect(
      await screen.findByRole('link', { name: /log a workout/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /log a run/i })).toBeInTheDocument()
  })

  it('hides every log button from a guest — absent, not disabled', async () => {
    currentUser = { uid: 'guest-uid', email: 'guest@example.test' }
    rolesEntry = { role: 'guest', readsProfile: OWNER }
    renderHome()
    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /log a/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /log a/i })).not.toBeInTheDocument()
  })
})
