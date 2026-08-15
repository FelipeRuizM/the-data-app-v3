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
let updateShouldFail: string | null = null
let pushCounter = 0

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
    if (updateShouldFail) throw new Error(updateShouldFail)
    updateCalls.push(updates)
  },
  remove: async (path: string) => {
    removeCalls.push(path)
  },
}))

const { WorkoutForm } = await import('./WorkoutForm')
const { AuthProvider } = await import('../../auth/AuthProvider')

function renderForm(mode: 'create' | 'edit', id?: string) {
  const path = mode === 'edit' ? `/workouts/${id}/edit` : '/workouts/new'
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/workouts/new" element={<WorkoutForm mode="create" />} />
          <Route path="/workouts/:id/edit" element={<WorkoutForm mode="edit" />} />
          <Route path="/workouts/:id" element={<div>detail page</div>} />
          <Route path="/workouts" element={<div>list page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const settled = (find: () => number) =>
  waitFor(() => expect(find()).toBeGreaterThan(0), { timeout: 5000 })

const workoutPathIn = (updates: Record<string, unknown>) =>
  Object.keys(updates).find((k) => k.includes('/workouts/'))!

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  rolesEntry = null
  profileData = fixture
  updateCalls.length = 0
  removeCalls.length = 0
  updateShouldFail = null
  pushCounter = 0
})

describe('WorkoutForm — create', () => {
  it('refuses to save an empty form and says why', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.click(screen.getByRole('button', { name: /log workout/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    // Nothing must reach the database on a rejected submit.
    expect(updateCalls).toHaveLength(0)
  })

  it('writes a byte-compatible record on a valid submit', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await user.type(screen.getByLabelText('Exercise 1'), 'Squat (Barbell)')
    await user.type(screen.getByLabelText(/Set 1 weight/), '100')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')

    // Default start/end are equal, which is correctly rejected — set a real end.
    const end = screen.getByLabelText('End') as HTMLInputElement
    await user.clear(end)
    await user.type(end, '2026-04-08T18:00')
    const start = screen.getByLabelText('Start') as HTMLInputElement
    await user.clear(start)
    await user.type(start, '2026-04-08T16:50')

    await user.click(screen.getByRole('button', { name: /log workout/i }))

    await waitFor(() => expect(updateCalls).toHaveLength(1))
    const updates = updateCalls[0]!
    const raw = updates[workoutPathIn(updates)] as Record<string, unknown>

    expect(raw['title']).toBe('Leg day')
    expect(raw['start_time']).toBe('8 Apr 2026, 16:50')
    expect(raw['end_time']).toBe('8 Apr 2026, 18:00')
    // gym is always present; category/hr/people omitted when unset (§3.1)
    expect('gym' in raw).toBe(true)
    expect('category' in raw).toBe(false)
    expect('avg_heart_rate' in raw).toBe(false)
    expect('people' in raw).toBe(false)
  })

  it('omits weight_kg for a blank weight — a bodyweight set (D-7b)', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Pull day')
    await user.type(screen.getByLabelText('Exercise 1'), 'Pull Up')
    await user.type(screen.getByLabelText('Set 1 reps'), '8')
    const end = screen.getByLabelText('End') as HTMLInputElement
    await user.clear(end)
    await user.type(end, '2026-04-08T18:00')
    const start = screen.getByLabelText('Start') as HTMLInputElement
    await user.clear(start)
    await user.type(start, '2026-04-08T16:50')

    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const updates = updateCalls[0]!
    const raw = updates[workoutPathIn(updates)] as { exercises: { sets: object[] }[] }
    expect('weight_kg' in raw.exercises[0]!.sets[0]!).toBe(false)
  })

  it('creates a brand-new place in the SAME atomic write as the workout', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await user.type(screen.getByLabelText('Place'), 'Brand New Gym')
    await user.type(screen.getByLabelText('Exercise 1'), 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    const end = screen.getByLabelText('End') as HTMLInputElement
    await user.clear(end)
    await user.type(end, '2026-04-08T18:00')
    const start = screen.getByLabelText('Start') as HTMLInputElement
    await user.clear(start)
    await user.type(start, '2026-04-08T16:50')

    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const paths = Object.keys(updateCalls[0]!)
    const gymPath = paths.find((p) => p.includes('/gyms/'))
    expect(gymPath, 'new place was not created').toBeDefined()
    expect(updateCalls[0]![gymPath!]).toEqual({ name: 'Brand New Gym' })
  })

  it('does not create a place that already exists', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await user.type(screen.getByLabelText('Place'), 'Place A')
    await user.type(screen.getByLabelText('Exercise 1'), 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    const end = screen.getByLabelText('End') as HTMLInputElement
    await user.clear(end)
    await user.type(end, '2026-04-08T18:00')
    const start = screen.getByLabelText('Start') as HTMLInputElement
    await user.clear(start)
    await user.type(start, '2026-04-08T16:50')

    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))
    expect(Object.keys(updateCalls[0]!).some((p) => p.includes('/gyms/'))).toBe(false)
  })

  it('surfaces a write failure instead of pretending it saved', async () => {
    const user = userEvent.setup()
    updateShouldFail = 'PERMISSION_DENIED: Client does not have access'
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await user.type(screen.getByLabelText('Exercise 1'), 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    const end = screen.getByLabelText('End') as HTMLInputElement
    await user.clear(end)
    await user.type(end, '2026-04-08T18:00')
    const start = screen.getByLabelText('Start') as HTMLInputElement
    await user.clear(start)
    await user.type(start, '2026-04-08T16:50')

    await user.click(screen.getByRole('button', { name: /log workout/i }))

    expect(await screen.findByText(/PERMISSION_DENIED/)).toBeInTheDocument()
    // Still on the form, not navigated away.
    expect(screen.queryByText('detail page')).not.toBeInTheDocument()
  })
})

describe('WorkoutForm — edit', () => {
  const firstId = Object.keys(fixture.workouts)[0]!

  it('seeds the form from the existing workout', async () => {
    renderForm('edit', firstId)
    await settled(
      () => screen.queryAllByRole('button', { name: /save changes/i }).length,
    )
    const title = screen.getByLabelText('Title') as HTMLInputElement
    expect(title.value).not.toBe('')
  })

  it('writes back to the SAME id, never creating a duplicate', async () => {
    const user = userEvent.setup()
    renderForm('edit', firstId)
    await settled(
      () => screen.queryAllByRole('button', { name: /save changes/i }).length,
    )

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const path = workoutPathIn(updateCalls[0]!)
    expect(path).toBe(`users/${OWNER}/workouts/${firstId}`)
  })

  it('says so plainly when the id does not exist', async () => {
    renderForm('edit', 'no-such-id')
    await settled(() => screen.queryAllByText('No workout with that id.').length)
    expect(screen.getByText('No workout with that id.')).toBeInTheDocument()
  })
})

describe('WorkoutForm — delete', () => {
  const firstId = Object.keys(fixture.workouts)[0]!

  it('asks for confirmation before deleting anything', async () => {
    const user = userEvent.setup()
    renderForm('edit', firstId)
    await settled(() => screen.queryAllByRole('button', { name: /^delete$/i }).length)

    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    // Nothing deleted yet — the dialog is a gate, not a formality.
    expect(removeCalls).toHaveLength(0)
  })

  it('cancelling the dialog deletes nothing', async () => {
    const user = userEvent.setup()
    renderForm('edit', firstId)
    await settled(() => screen.queryAllByRole('button', { name: /^delete$/i }).length)

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('alertdialog')
    // Scoped to the dialog: the form itself also has a Cancel button, and an
    // unscoped query matches both.
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(removeCalls).toHaveLength(0)
  })

  it('confirming removes exactly that one workout path', async () => {
    const user = userEvent.setup()
    renderForm('edit', firstId)
    await settled(() => screen.queryAllByRole('button', { name: /^delete$/i }).length)

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /delete/i }))

    await waitFor(() => expect(removeCalls).toHaveLength(1))
    expect(removeCalls[0]).toBe(`users/${OWNER}/workouts/${firstId}`)
  })
})
