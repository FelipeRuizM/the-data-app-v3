import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../test/fixture.json'

/**
 * The admin panel writes global vocabulary every account reads, so these check
 * where the writes land — `/config`, never a user subtree — and that a rename
 * carries the admin's own records with it while a delete deliberately doesn't.
 */

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
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
    if (path.endsWith('/workouts')) {
      return { exists: () => true, val: () => fixture.workouts }
    }
    if (path.endsWith('/runs')) return { exists: () => true, val: () => fixture.runs }
    if (path.endsWith('/settings')) {
      return { exists: () => true, val: () => fixture.settings }
    }
    if (path.startsWith('users/')) return { exists: () => true, val: () => fixture }
    return { exists: () => false, val: () => null }
  },
}))

const { Admin } = await import('./Admin')
const { AuthProvider } = await import('../auth/AuthProvider')
const { ProfileProvider } = await import('../data/ProfileProvider')

function renderAdmin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProfileProvider>
          <Admin />
        </ProfileProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function ready() {
  await screen.findByRole('heading', { name: 'Workout categories' })
}

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  pushCounter = 0
  updateCalls.length = 0
})

/* ── the sections the checklist names ───────────────────────────────────── */

describe('the panel', () => {
  it('renders every global config section', async () => {
    renderAdmin()
    await ready()

    for (const name of [
      'Workout categories',
      'Run types',
      'Muscle groups',
      'Rep-based exercises',
      'Base exercise catalog',
      'Shoes',
      'Watches',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  it('offers Core as a muscle group (D-4)', async () => {
    renderAdmin()
    await ready()
    const section = screen
      .getByRole('heading', { name: 'Muscle groups' })
      .closest('section')!
    expect(within(section).getByText('Core')).toBeInTheDocument()
  })
})

/* ── colours are token ids (D-17) ───────────────────────────────────────── */

describe('category colours', () => {
  it('picks from the validated palette and stores a token id, not a hex', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await ready()

    await user.click(screen.getByRole('button', { name: 'cat-4 for Push' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(updateCalls[0]!['config/workoutCategories/push']).toMatchObject({
      name: 'Push',
      colorToken: 'cat-4',
    })
    const written = JSON.stringify(updateCalls[0])
    expect(written).not.toMatch(/#[0-9a-f]{6}/i)
  })
})

/* ── rename cascades the admin's own records (D-32) ─────────────────────── */

describe('renaming a category', () => {
  async function startRename(from: string, to: string) {
    const user = userEvent.setup()
    renderAdmin()
    await ready()

    const row = screen.getByText(from).closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Rename' }))
    const input = screen.getByLabelText(`New name for ${from}`)
    await user.clear(input)
    await user.type(input, to)
    await user.click(within(row).getByRole('button', { name: 'Save' }))
    return user
  }

  it('says how many of the admin’s own records it will rewrite, before writing', async () => {
    await startRename('Push', 'Press')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/will be rewritten to match|carry the old name/)
    expect(updateCalls).toHaveLength(0)
  })

  it('is explicit that other profiles are NOT rewritten', async () => {
    await startRename('Push', 'Press')
    const dialog = await screen.findByRole('alertdialog')
    // The limitation is stated, not hidden — an account can write only its own
    // data, so this is the honest description of what the button does.
    expect(dialog).toHaveTextContent(/Only your own records are rewritten/i)
  })

  it('writes the config row and the workouts together', async () => {
    const user = await startRename('Push', 'Press')
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const paths = Object.keys(updateCalls[0]!)
    expect(paths).toContain('config/workoutCategories/push')
    expect(paths.some((p) => p.endsWith('/category'))).toBe(true)
  })
})

/* ── delete degrades records, it does not edit or block them (§4) ───────── */

describe('deleting a category', () => {
  it('removes only the config row, leaving records to fall back to neutral', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await ready()

    const row = screen.getByText('Push').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/neutral grey|No workout uses/)

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(updateCalls[0]).toEqual({ 'config/workoutCategories/push': null })
  })
})

/* ── the base catalog is add/re-file only (D-31) ────────────────────────── */

describe('base exercise catalog', () => {
  it('offers no rename or delete for base entries', async () => {
    renderAdmin()
    await ready()

    const section = screen
      .getByRole('heading', { name: 'Base exercise catalog' })
      .closest('section')!
    expect(within(section).queryByRole('button', { name: 'Rename' })).toBeNull()
    expect(within(section).queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('explains why, rather than showing a control that half-works', async () => {
    renderAdmin()
    await ready()
    const section = screen
      .getByRole('heading', { name: 'Base exercise catalog' })
      .closest('section')!
    expect(section).toHaveTextContent(/done from the console/i)
  })

  it('adds to /config/exercises, never to a user subtree', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await ready()

    await user.type(screen.getByLabelText('Add base exercise'), 'Zercher Squat')
    await user.click(screen.getByRole('button', { name: 'Add base exercise' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const path = Object.keys(updateCalls[0]!)[0]!
    expect(path.startsWith('config/exercises/')).toBe(true)
    expect(path).not.toContain('users/')
  })
})

/* ── nothing here reaches a profile ─────────────────────────────────────── */

describe('write targets', () => {
  it('saves an unused muscle group removal to /config only', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await ready()

    const section = screen
      .getByRole('heading', { name: 'Muscle groups' })
      .closest('section')!
    await user.click(within(section).getByRole('button', { name: 'Remove Core' }))
    await user.click(within(section).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(Object.keys(updateCalls[0]!)).toEqual(['config/muscleGroups'])
  })

  it('refuses to remove a muscle group that exercises are still filed under', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await ready()

    const section = screen
      .getByRole('heading', { name: 'Muscle groups' })
      .closest('section')!
    await user.click(within(section).getByRole('button', { name: 'Remove Back' }))

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      /Re-file them first/i,
    )
    expect(updateCalls).toHaveLength(0)
  })
})
