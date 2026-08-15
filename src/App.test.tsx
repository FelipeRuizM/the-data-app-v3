import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Firebase is mocked at the module boundary so these tests need no network,
   no emulator and no credentials. What's under test is the login wall and the
   role gating — the parts where a mistake leaks data. */

/** Must match VITE_OWNER_UID in .env.test — never the real owner UID. */
const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let rolesEntry: Record<string, string> | null = null
/** Set true to simulate the /roles read being denied or failing. */
let rolesReadFails = false

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))

vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    cb(currentUser)
    return () => {}
  },
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path: string) => path,
  get: async () => {
    if (rolesReadFails) throw new Error('permission denied')
    return {
      exists: () => rolesEntry !== null,
      val: () => rolesEntry,
    }
  },
}))

const { App } = await import('./App')

function signedOut() {
  currentUser = null
  rolesEntry = null
  rolesReadFails = false
}
function signedInAs(uid: string, entry: Record<string, string> | null) {
  currentUser = { uid, email: `${uid}@example.test` }
  rolesEntry = entry
  rolesReadFails = false
}

beforeEach(() => {
  window.location.hash = '#/'
  signedOut()
})

describe('the login wall', () => {
  it('shows the login screen to a signed-out visitor', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Sign in to continue.' }),
    ).toBeInTheDocument()
  })

  it('keeps a signed-out visitor off every other route', async () => {
    window.location.hash = '#/analytics'
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Sign in to continue.' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Primary' }),
    ).not.toBeInTheDocument()
  })

  it('keeps a signed-out visitor out of the admin panel', async () => {
    window.location.hash = '#/admin'
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Sign in to continue.' }),
    ).toBeInTheDocument()
  })

  it('refuses a signed-in account with no /roles entry — invite-only', async () => {
    signedInAs('stranger', null)
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: /doesn.t have access/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Primary' }),
    ).not.toBeInTheDocument()
  })

  it('fails closed when the /roles read is denied', async () => {
    // A denied lookup must not fall through to a usable session.
    signedInAs('stranger', null)
    rolesReadFails = true
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: /doesn.t have access/ }),
    ).toBeInTheDocument()
  })
})

describe('role gating', () => {
  it('lets the owner in as admin even with no /roles entry (bootstrap)', async () => {
    signedInAs(OWNER, null)
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it('hides the admin link from a plain user', async () => {
    signedInAs('friend', { role: 'user' })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('bounces a non-admin away from a typed /admin URL', async () => {
    // Hiding the link is not enough — the route itself must refuse.
    window.location.hash = '#/admin'
    signedInAs('friend', { role: 'user' })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument(),
    )
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('marks a guest read-only and keeps the admin link away', async () => {
    signedInAs('guest', { role: 'guest', readsProfile: OWNER })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument(),
    )
    expect(screen.getByText(/guest · read only/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('bounces a guest away from a typed write URL', async () => {
    // A guest must never reach a form it could never submit.
    window.location.hash = '#/workouts/new'
    signedInAs('guest', { role: 'guest', readsProfile: OWNER })
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument(),
    )
    expect(screen.queryByText('Log a workout')).not.toBeInTheDocument()
  })

  it('lets a user reach a write route', async () => {
    window.location.hash = '#/workouts/new'
    signedInAs('friend', { role: 'user' })
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Log a workout' }),
    ).toBeInTheDocument()
  })
})

describe('the shell, once signed in', () => {
  beforeEach(() => signedInAs(OWNER, null))

  it('renders primary navigation and the skip link', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument(),
    )
    for (const label of ['Home', 'Workouts', 'Runs', 'Analytics']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument()
  })

  it('shows the 404 page for an unknown route', async () => {
    window.location.hash = '#/no-such-page'
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'No such page.' }),
    ).toBeInTheDocument()
  })

  it('renders the styleguide with the validated palette warning intact', async () => {
    window.location.hash = '#/styleguide'
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'Categorical palette' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Do not brighten cat-1/i)).toBeInTheDocument()
  })
})
