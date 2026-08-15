import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../../test/fixture.json'

const OWNER = 'test-owner-uid'

let currentUser: { uid: string; email: string } | null = null
let rolesEntry: Record<string, string> | null = null
let profileData: unknown = null

const updateCalls: Record<string, unknown>[] = []
const removeCalls: string[] = []
let pushCounter = 0

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
  push: (_path: string) => ({ key: `gen-${++pushCounter}` }),
  get: async (path: string) => {
    if (path.startsWith('roles/')) {
      return { exists: () => rolesEntry !== null, val: () => rolesEntry }
    }
    if (path.startsWith('users/')) {
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
  update: async (_root: unknown, updates: Record<string, unknown>) => {
    updateCalls.push(updates)
  },
  remove: async (path: string) => {
    removeCalls.push(path)
  },
}))

const { RunForm } = await import('./RunForm')
const { AuthProvider } = await import('../../auth/AuthProvider')

function renderForm(mode: 'create' | 'edit', id?: string) {
  const path = mode === 'edit' ? `/runs/${id}/edit` : '/runs/new'
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/runs/new" element={<RunForm mode="create" />} />
          <Route path="/runs/:id/edit" element={<RunForm mode="edit" />} />
          <Route path="/runs/:id" element={<div>detail page</div>} />
          <Route path="/runs" element={<div>list page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const settled = (find: () => number) =>
  waitFor(() => expect(find()).toBeGreaterThan(0), { timeout: 5000 })

const runPathIn = (updates: Record<string, unknown>) =>
  Object.keys(updates).find((k) => k.includes('/runs/'))!

async function fillValidRun(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'Morning run')
  await user.type(screen.getByLabelText('Distance (km)'), '5')
  await user.type(screen.getByLabelText('Moving time'), '30:00')
}

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  rolesEntry = null
  profileData = fixture
  updateCalls.length = 0
  removeCalls.length = 0
  pushCounter = 0
})

describe('RunForm — create', () => {
  it('refuses to save an empty form and names what is missing', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: /log run/i }).length)

    await user.click(screen.getByRole('button', { name: /log run/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(screen.getByText('Distance is required.')).toBeInTheDocument()
    expect(updateCalls).toHaveLength(0)
  })

  it('shows the derived pace live, before saving', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: /log run/i }).length)

    await user.type(screen.getByLabelText('Distance (km)'), '5')
    await user.type(screen.getByLabelText('Moving time'), '30:00')

    // 1800s / 5km = 6:00 per km
    await waitFor(() => expect(screen.getByText(/6:00/)).toBeInTheDocument())
  })

  it('writes a derived pace, never a typed one', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: /log run/i }).length)

    await fillValidRun(user)
    await user.click(screen.getByRole('button', { name: /log run/i }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const raw = updateCalls[0]![runPathIn(updateCalls[0]!)] as Record<string, unknown>
    expect(raw['pace']).toBe('6:00')
    expect(raw['distance_km']).toBe(5)
    expect(raw['duration_seconds']).toBe(1800)
  })

  it('omits the zero sentinels rather than writing them', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: /log run/i }).length)

    await fillValidRun(user)
    await user.type(screen.getByLabelText('Avg heart rate'), '0')
    await user.type(screen.getByLabelText('Calories'), '0')
    await user.click(screen.getByRole('button', { name: /log run/i }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const raw = updateCalls[0]![runPathIn(updateCalls[0]!)] as Record<string, unknown>
    expect('avg_heart_rate' in raw).toBe(false)
    expect('calories' in raw).toBe(false)
  })

  it('no longer asks for elevation or steps (D-46)', async () => {
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: /log run/i }).length)

    for (const label of ['Steps', 'Elevation gain (m)', 'Max elevation (m)']) {
      expect(screen.queryByLabelText(label), label).toBeNull()
    }
  })

  it('writes nothing for the retired fields on a brand-new run', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: /log run/i }).length)

    await fillValidRun(user)
    await user.click(screen.getByRole('button', { name: /log run/i }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const raw = updateCalls[0]![runPathIn(updateCalls[0]!)] as Record<string, unknown>
    for (const key of ['steps', 'elevation_gain_m', 'max_elevation_m']) {
      expect(key in raw, key).toBe(false)
    }
  })

  it('prefills shoes and watch from the account defaults (D-16)', async () => {
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: /log run/i }).length)
    expect((screen.getByLabelText('Shoes') as HTMLInputElement).value).toBe(
      'Adidas Ultraboost 21',
    )
    expect((screen.getByLabelText('Watch') as HTMLInputElement).value).toBe(
      'Apple Watch Series 8',
    )
  })

  it('writes the run under runs, never under workouts', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: /log run/i }).length)

    await fillValidRun(user)
    await user.click(screen.getByRole('button', { name: /log run/i }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const paths = Object.keys(updateCalls[0]!)
    expect(paths.some((p) => p.includes('/runs/'))).toBe(true)
    expect(paths.some((p) => p.includes('/workouts/'))).toBe(false)
  })
})

describe('RunForm — edit', () => {
  const firstId = Object.keys(fixture.runs)[0]!

  it('seeds from the existing run', async () => {
    renderForm('edit', firstId)
    await settled(
      () => screen.queryAllByRole('button', { name: /save changes/i }).length,
    )
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).not.toBe('')
    expect((screen.getByLabelText('Moving time') as HTMLInputElement).value).toMatch(
      /\d+:\d\d/,
    )
  })

  it('writes back to the same id', async () => {
    const user = userEvent.setup()
    renderForm('edit', firstId)
    await settled(
      () => screen.queryAllByRole('button', { name: /save changes/i }).length,
    )

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(runPathIn(updateCalls[0]!)).toBe(`users/${OWNER}/runs/${firstId}`)
  })

  it('says so plainly when the id does not exist', async () => {
    renderForm('edit', 'no-such-id')
    await settled(() => screen.queryAllByText('No run with that id.').length)
    expect(screen.getByText('No run with that id.')).toBeInTheDocument()
  })
})

describe('RunForm — delete', () => {
  const firstId = Object.keys(fixture.runs)[0]!

  it('confirms before deleting, and deletes nothing until confirmed', async () => {
    const user = userEvent.setup()
    renderForm('edit', firstId)
    await settled(() => screen.queryAllByRole('button', { name: /^delete$/i }).length)

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(removeCalls).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(removeCalls).toHaveLength(0)
  })

  it('confirming removes exactly that one run path', async () => {
    const user = userEvent.setup()
    renderForm('edit', firstId)
    await settled(() => screen.queryAllByRole('button', { name: /^delete$/i }).length)

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /delete/i }))

    await waitFor(() => expect(removeCalls).toHaveLength(1))
    expect(removeCalls[0]).toBe(`users/${OWNER}/runs/${firstId}`)
  })
})
