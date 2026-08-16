import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../test/fixture.json'

/**
 * Settings is where a click can rewrite history, so these tests care less about
 * layout than about which writes reach the database — and, for a delete, that
 * none does.
 */

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let profileData: unknown = null
let pushCounter = 0
const updateCalls: Record<string, unknown>[] = []

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
  push: (path: string) => ({ key: `${path}/generated-${++pushCounter}` }),
  update: vi.fn(async (_root: unknown, updates: Record<string, unknown>) => {
    updateCalls.push(updates)
  }),
  get: async (path: string) => {
    if (path.startsWith('roles/')) return { exists: () => false, val: () => null }
    // The cascade reads sub-nodes directly; everything else reads the profile.
    if (path.endsWith('/workouts')) {
      return { exists: () => true, val: () => fixture.workouts }
    }
    if (path.endsWith('/runs')) return { exists: () => true, val: () => fixture.runs }
    if (path.endsWith('/settings')) {
      return { exists: () => true, val: () => fixture.settings }
    }
    if (path.startsWith('users/')) {
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
}))

const { Settings } = await import('./Settings')
const { AuthProvider } = await import('../auth/AuthProvider')
const { ProfileProvider } = await import('../data/ProfileProvider')

function renderSettings() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProfileProvider>
          <Settings />
        </ProfileProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** Wait past the loading skeleton. */
async function ready() {
  await screen.findByRole('heading', { name: 'Weight units' })
}

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  profileData = fixture
  pushCounter = 0
  updateCalls.length = 0
})

/* ── units (D-18) ───────────────────────────────────────────────────────── */

describe('weight units', () => {
  it('saves the display unit and nothing else', async () => {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    await user.click(screen.getByRole('button', { name: 'lb' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(updateCalls[0]).toEqual({ [`users/${OWNER}/settings/units`]: 'lb' })
  })

  it('never writes a converted weight anywhere — storage stays kilograms', async () => {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    await user.click(screen.getByRole('button', { name: 'lb' }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const paths = Object.keys(updateCalls[0]!)
    expect(paths.some((p) => p.includes('weight'))).toBe(false)
  })
})

/* ── bodyweight (D-7) ───────────────────────────────────────────────────── */

describe('bodyweight', () => {
  it('stores kilograms whatever the display unit says', async () => {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    const input = screen.getByLabelText(/^Bodyweight \(kg\)$/)
    await user.type(input, '78.5')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(updateCalls[0]).toEqual({
      [`users/${OWNER}/settings/bodyweightKg`]: 78.5,
    })
  })
})

/* ── featured exercises (§6.3) ──────────────────────────────────────────── */

describe('featured exercises', () => {
  it('reorders and saves the whole list in one write', async () => {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    const stored = fixture.settings.featuredExercises
    await user.click(screen.getByRole('button', { name: `Move ${stored[1]} up` }))
    await user.click(screen.getByRole('button', { name: 'Save order' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const written = updateCalls[0]![
      `users/${OWNER}/settings/featuredExercises`
    ] as string[]
    expect(written[0]).toBe(stored[1])
    expect(written[1]).toBe(stored[0])
    expect(written).toHaveLength(stored.length)
  })

  it('refuses a name that is not a real exercise, since joins are by name', async () => {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    // Featuring is the one place free entry must NOT create: the shortlist
    // points at lifts you already have history for (§6.3), so a name outside
    // the catalog would feature an exercise with nothing behind it.
    await user.type(screen.getByLabelText('Add an exercise'), 'Not A Lift')
    await user.click(screen.getByRole('button', { name: 'Add to featured' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No exercise by that name/,
    )
    expect(updateCalls).toHaveLength(0)
  })
})

/* ── the rename cascade (D-5) ───────────────────────────────────────────── */

describe('rename cascade', () => {
  async function startRename(name: string, next: string) {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    const row = screen.getByText(name).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Rename' }))

    const input = screen.getByLabelText(`New name for ${name}`)
    await user.clear(input)
    await user.type(input, next)
    await user.click(within(row).getByRole('button', { name: 'Save' }))
    return user
  }

  it('states the affected record count before writing anything', async () => {
    await startRename('Place A', 'Place One')

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/will be rewritten/i)
    // Nothing is written by asking.
    expect(updateCalls).toHaveLength(0)
  })

  it('rewrites the catalog row and every referencing record in ONE update', async () => {
    const user = await startRename('Place A', 'Place One')

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const paths = Object.keys(updateCalls[0]!)
    expect(paths.some((p) => p.startsWith(`users/${OWNER}/gyms/`))).toBe(true)
    expect(paths.some((p) => p.endsWith('/gym'))).toBe(true)
  })

  it('cancelling writes nothing', async () => {
    const user = await startRename('Place A', 'Place One')

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(updateCalls).toHaveLength(0)
  })
})

/* ── deletion is blocked, not offered (D-5) ─────────────────────────────── */

describe('deleting a referenced entity', () => {
  it('offers a merge instead of a delete, and writes nothing until one is chosen', async () => {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    const row = screen.getByText('Place A').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/Still in use/i)
    expect(dialog).toHaveTextContent(/would orphan/i)
    // There is no confirm-anyway path: the only action is a merge.
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Merge' })).toBeDisabled()
    expect(updateCalls).toHaveLength(0)
  })

  it('merges into the chosen entry, moving records across in one write', async () => {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    const row = screen.getByText('Place A').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog')
    await user.selectOptions(within(dialog).getByLabelText('Merge into'), 'Place B')
    await user.click(within(dialog).getByRole('button', { name: 'Merge' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const updates = updateCalls[0]!
    const sourceRow = Object.keys(updates).find(
      (p) => p.startsWith(`users/${OWNER}/gyms/`) && updates[p] === null,
    )
    expect(sourceRow).toBeDefined()
    expect(
      Object.entries(updates).some(([p, v]) => p.endsWith('/gym') && v === 'Place B'),
    ).toBe(true)
  })
})

/* ── the user's own tier only (D-20) ────────────────────────────────────── */

describe('exercise catalog', () => {
  it('creates new exercises in the user’s own tier, never in /config', async () => {
    const user = userEvent.setup()
    renderSettings()
    await ready()

    await user.type(screen.getByLabelText('Add exercise'), 'Zercher Squat')
    await user.click(screen.getByRole('button', { name: 'Add exercise' }))

    await waitFor(() => expect(updateCalls.length).toBeGreaterThan(0))
    const path = Object.keys(updateCalls[0]!)[0]!
    expect(path.startsWith(`users/${OWNER}/exercises/`)).toBe(true)
    expect(path).not.toContain('config')
  })
})
