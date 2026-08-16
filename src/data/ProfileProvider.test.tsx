import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../test/fixture.json'

/**
 * The point of D-61, stated as tests: ONE read for the session, re-run on
 * exactly three signals — auth, a write, and coming back to a stale tab.
 */

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let profileData: unknown = null
/** Every `get` the app issues, by path — this is what the phase is about. */
let reads: string[] = []

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({
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
  push: () => ({ key: 'generated' }),
  get: async (path: string) => {
    reads.push(path)
    if (path.startsWith('roles/')) return { exists: () => false, val: () => null }
    if (path.startsWith('users/')) {
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
  update: async () => {},
  remove: async () => {},
}))

const { ProfileProvider } = await import('./ProfileProvider')
const { useProfile } = await import('./useProfile')
const { invalidateProfile } = await import('./profileContext')
const { AuthProvider } = await import('../auth/AuthProvider')

/** How many times the profile itself was fetched — not roles, not config. */
const profileReads = () => reads.filter((p) => p.startsWith('users/')).length

function Probe({ label }: { label: string }) {
  const state = useProfile()
  return (
    <div>
      <span data-testid="page">{label}</span>
      <span data-testid="status">{state.status}</span>
      <span data-testid="count">
        {state.status === 'ready' ? state.data.profile.workouts.length : '—'}
      </span>
    </div>
  )
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/a']}>
      <AuthProvider>
        <ProfileProvider>
          <Link to="/b">go to b</Link>
          <Link to="/a">go to a</Link>
          <Routes>
            <Route path="/a" element={<Probe label="a" />} />
            <Route path="/b" element={<Probe label="b" />} />
          </Routes>
        </ProfileProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const ready = () =>
  waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  profileData = fixture
  reads = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProfileProvider — one read, shared', () => {
  it('reads the profile exactly once on mount', async () => {
    renderApp()
    await ready()
    expect(profileReads()).toBe(1)
  })

  it('does NOT re-read when you navigate', async () => {
    // This is the whole phase. Every page used to hold its own state and its
    // own loadProfile, so a tap cost the entire profile again (~350 KB).
    const user = userEvent.setup()
    renderApp()
    await ready()
    expect(profileReads()).toBe(1)

    await user.click(screen.getByRole('link', { name: 'go to b' }))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('b'))
    await user.click(screen.getByRole('link', { name: 'go to a' }))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('a'))

    expect(profileReads()).toBe(1)
  })

  it('serves the new page from data that is already there', async () => {
    const user = userEvent.setup()
    renderApp()
    await ready()

    await user.click(screen.getByRole('link', { name: 'go to b' }))
    // No loading flash on arrival: the data was already in hand.
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
  })
})

describe('ProfileProvider — invalidateProfile', () => {
  it('re-reads, and resolves only once the new data is on screen', async () => {
    renderApp()
    await ready()
    expect(profileReads()).toBe(1)

    // The await is load-bearing: `saveWorkout` invalidates and the form then
    // navigates to the record it just wrote. Resolving early would land the
    // detail page on the old profile and render "no workout with that id".
    await invalidateProfile()

    expect(profileReads()).toBe(2)
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
  })

  it('keeps the old data on screen while re-reading, never a skeleton', async () => {
    renderApp()
    await ready()
    const before = screen.getByTestId('count').textContent

    const pending = invalidateProfile()
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(screen.getByTestId('count')).toHaveTextContent(before!)
    await pending
  })

  it('is a no-op rather than a crash when no provider is mounted', async () => {
    await expect(invalidateProfile()).resolves.toBeUndefined()
  })
})

describe('ProfileProvider — refetch on return to the tab', () => {
  const returnToTab = () => document.dispatchEvent(new Event('visibilitychange'))

  it('re-reads when the data has gone stale', async () => {
    const start = Date.now()
    renderApp()
    await ready()
    expect(profileReads()).toBe(1)

    vi.spyOn(Date, 'now').mockReturnValue(start + 60_000)
    returnToTab()

    await waitFor(() => expect(profileReads()).toBe(2))
  })

  it('does NOT re-read when what we hold is still fresh', async () => {
    // Switching to the camera and back must not re-download the profile.
    renderApp()
    await ready()
    returnToTab()
    window.dispatchEvent(new Event('focus'))

    await new Promise((r) => setTimeout(r, 20))
    expect(profileReads()).toBe(1)
  })

  it('ignores the event while the tab is hidden', async () => {
    const start = Date.now()
    renderApp()
    await ready()

    vi.spyOn(Date, 'now').mockReturnValue(start + 60_000)
    const hidden = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    returnToTab()

    await new Promise((r) => setTimeout(r, 20))
    expect(profileReads()).toBe(1)
    hidden.mockRestore()
  })
})

describe('useProfile', () => {
  it('throws a named error when there is no provider above it', () => {
    // A missing provider would otherwise present as a page that never loads.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe label="orphan" />)).toThrow(/ProfileProvider/)
    quiet.mockRestore()
  })
})

describe('the write-then-navigate path', () => {
  it('the destination NEVER renders against the old profile', async () => {
    // The regression this guards: `saveWorkout` writes, invalidates, and the
    // form navigates to the record it just created. If the refresh resolved
    // before the read landed, the detail page would mount against the old
    // profile and say "no workout with that id".
    //
    // React batches the state update with the navigate that follows it, so the
    // destination's FIRST render already has the new data. Asserting "ends up
    // correct" would pass even if it flashed the old count first, so this
    // records every value the destination ever rendered.
    const seen: number[] = []

    function Destination() {
      const state = useProfile()
      if (state.status === 'ready') seen.push(state.data.profile.workouts.length)
      return <span data-testid="page">b</span>
    }

    function Saver() {
      const navigate = useNavigate()
      return (
        <button
          type="button"
          onClick={() => {
            void (async () => {
              await invalidateProfile()
              navigate('/b')
            })()
          }}
        >
          save and go
        </button>
      )
    }

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/a']}>
        <AuthProvider>
          <ProfileProvider>
            <Routes>
              <Route path="/a" element={<Saver />} />
              <Route path="/b" element={<Destination />} />
            </Routes>
          </ProfileProvider>
        </AuthProvider>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'save and go' })).toBeInTheDocument(),
    )

    const before = (fixture as { workouts: Record<string, unknown> }).workouts
    const extended = structuredClone(fixture) as { workouts: Record<string, unknown> }
    extended.workouts['brand-new'] = {
      title: 'Just logged',
      description: '',
      start_time: '8 Apr 2026, 16:50',
      end_time: '8 Apr 2026, 17:50',
      gym: '',
      exercises: [],
    }
    profileData = extended

    await user.click(screen.getByRole('button', { name: 'save and go' }))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('b'))

    const expected = Object.keys(before).length + 1
    expect(seen.length).toBeGreaterThan(0)
    expect(seen).not.toContain(Object.keys(before).length)
    expect(seen.every((n) => n === expected)).toBe(true)
  })
})
