import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../../test/fixture.json'

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let profileData: unknown = null
const updateCalls: Record<string, unknown>[] = []

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
    if (path.startsWith('roles/')) return { exists: () => false, val: () => null }
    if (path.endsWith('/workouts')) {
      return {
        exists: () => true,
        val: () => (profileData as { workouts: unknown }).workouts,
      }
    }
    if (path.startsWith('users/')) {
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
  update: async (_root: unknown, updates: Record<string, unknown>) => {
    updateCalls.push(updates)
  },
  remove: async () => {},
}))

const { FixTimes } = await import('./FixTimes')
const { AuthProvider } = await import('../../auth/AuthProvider')
const { ProfileProvider } = await import('../../data/ProfileProvider')

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProfileProvider>
          <FixTimes />
        </ProfileProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const settled = () =>
  waitFor(() =>
    expect(screen.getAllByLabelText(/New date and time/).length).toBeGreaterThan(0),
  )

const saveButton = () => screen.getByRole('button', { name: /save|no changes/i })

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  profileData = fixture
  updateCalls.length = 0
})

describe('FixTimes', () => {
  it('lists every workout with an editable timestamp', async () => {
    renderPage()
    await settled()
    expect(screen.getAllByLabelText(/New date and time/)).toHaveLength(
      Object.keys(fixture.workouts).length,
    )
  })

  it('has nothing to save until something is edited', async () => {
    renderPage()
    await settled()
    expect(saveButton()).toBeDisabled()
    expect(saveButton()).toHaveTextContent(/no changes/i)
  })

  it('writes ONLY the two timestamp paths — never the record, never the sets', async () => {
    const user = userEvent.setup()
    renderPage()
    await settled()

    const field = screen.getAllByLabelText(/New date and time/)[0]!
    await user.clear(field)
    await user.type(field, '2027-01-02T09:30')
    await user.click(saveButton())

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const paths = Object.keys(updateCalls[0]!)
    expect(paths).toHaveLength(2)
    // Anything that addressed the record itself would rewrite all of its sets.
    for (const path of paths) {
      expect(path).toMatch(/\/(start_time|end_time)$/)
      expect(path.startsWith(`users/${OWNER}/workouts/`)).toBe(true)
    }
  })

  it('leaves every other workout alone', async () => {
    const user = userEvent.setup()
    renderPage()
    await settled()

    const field = screen.getAllByLabelText(/New date and time/)[0]!
    await user.clear(field)
    await user.type(field, '2027-01-02T09:30')
    await user.click(saveButton())

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const touched = new Set(
      Object.keys(updateCalls[0]!).map((p) => p.split('/').slice(0, 4).join('/')),
    )
    expect(touched.size).toBe(1)
  })

  it('filters the list without losing an edit made before searching', async () => {
    const user = userEvent.setup()
    renderPage()
    await settled()

    const field = screen.getAllByLabelText(/New date and time/)[0]!
    await user.clear(field)
    await user.type(field, '2027-01-02T09:30')
    expect(saveButton()).toHaveTextContent(/save 1 change/i)

    await user.type(screen.getByLabelText('Find'), 'zzzz-no-match')
    await waitFor(() =>
      expect(screen.getByText('No workout matches that.')).toBeInTheDocument(),
    )
    // The pending edit is still pending — filtering is a view, not a discard.
    expect(saveButton()).toHaveTextContent(/save 1 change/i)
  })
})
