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

type User = ReturnType<typeof userEvent.setup>

/** The start timestamp lives behind a disclosure now (D-47). */
async function setStart(user: User, value: string) {
  await user.click(screen.getByRole('button', { name: /change date & time/i }))
  const start = screen.getByLabelText('Started') as HTMLInputElement
  await user.clear(start)
  await user.type(start, value)
}

async function setDuration(user: User, minutes: string) {
  const field = screen.getByLabelText(/Duration/)
  await user.clear(field)
  await user.type(field, minutes)
}

/**
 * Every catalog field is a ComboBox: you type, and what you typed is the value
 * whether or not it matched (D-52). So both the "pick an existing one" and the
 * "invent a new one" cases are the same gesture.
 */
const pick = (user: User, label: string | RegExp, value: string) =>
  user.type(screen.getByLabelText(label), value)

const pickNew = pick

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
    await pick(user, 'Exercise 1', 'Squat (Barbell)')
    await user.type(screen.getByLabelText(/Set 1 weight/), '100')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')

    // end_time is DERIVED from start + duration now (D-47) — 16:50 + 70m.
    await setStart(user, '2026-04-08T16:50')
    await setDuration(user, '70')

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
    await pick(user, 'Exercise 1', 'Pull Up')
    // Naming the exercise prefills it from the last Pull Up session (D-53), so
    // clear the fields first — this test is about what a BLANK weight writes.
    await user.clear(screen.getByLabelText(/Set 1 weight/))
    await user.clear(screen.getByLabelText('Set 1 reps'))
    await user.type(screen.getByLabelText('Set 1 reps'), '8')

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
    await pickNew(user, 'Place', 'Brand New Gym')
    await pick(user, 'Exercise 1', 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')

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
    await pick(user, 'Place', 'Place A')
    await pick(user, 'Exercise 1', 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')

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
    await pick(user, 'Exercise 1', 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')

    await user.click(screen.getByRole('button', { name: /log workout/i }))

    expect(await screen.findByText(/PERMISSION_DENIED/)).toBeInTheDocument()
    // Still on the form, not navigated away.
    expect(screen.queryByText('detail page')).not.toBeInTheDocument()
  })
})

describe('WorkoutForm — logging ergonomics (D-47, D-50)', () => {
  it('puts the logged exercises ABOVE the add button', async () => {
    renderForm('create')
    await settled(() => screen.queryAllByLabelText('Exercise 1').length)

    const addButton = screen.getByRole('button', { name: /add exercise/i })
    const firstExercise = screen.getByLabelText('Exercise 1')
    // You reach for "add" after logging what you just did, so it has to sit
    // where your eye already is — below the list, not above it.
    expect(
      firstExercise.compareDocumentPosition(addButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('prefills a new set from the one above it', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByLabelText('Exercise 1').length)

    await user.type(screen.getByLabelText(/Set 1 weight/), '80')
    await user.type(screen.getByLabelText('Set 1 reps'), '8')
    await user.selectOptions(screen.getByLabelText('Set 1 type'), 'warmup')

    await user.click(screen.getByRole('button', { name: /\+ set/i }))

    expect((screen.getByLabelText(/Set 2 weight/) as HTMLInputElement).value).toBe('80')
    expect((screen.getByLabelText('Set 2 reps') as HTMLInputElement).value).toBe('8')
    expect((screen.getByLabelText('Set 2 type') as HTMLSelectElement).value).toBe(
      'warmup',
    )
  })

  it('editing a prefilled set does not change the one it came from', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByLabelText('Exercise 1').length)

    await user.type(screen.getByLabelText('Set 1 reps'), '8')
    await user.click(screen.getByRole('button', { name: /\+ set/i }))
    await user.clear(screen.getByLabelText('Set 2 reps'))
    await user.type(screen.getByLabelText('Set 2 reps'), '6')

    expect((screen.getByLabelText('Set 1 reps') as HTMLInputElement).value).toBe('8')
  })

  it('writes calories when given, and omits the field otherwise (D-45)', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await pick(user, 'Exercise 1', 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    await user.type(screen.getByLabelText('Calories'), '420')

    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const updates = updateCalls[0]!
    expect(
      (updates[workoutPathIn(updates)] as Record<string, unknown>)['calories'],
    ).toBe(420)
  })

  it('never shows a start or end field by default', async () => {
    renderForm('create')
    await settled(() => screen.queryAllByLabelText(/Duration/).length)
    expect(screen.queryByLabelText('End')).toBeNull()
    expect(screen.queryByLabelText('Start')).toBeNull()
    expect(screen.queryByLabelText('Started')).toBeNull()
  })
})

describe('WorkoutForm — free entry creates (D-52, D-53)', () => {
  it('creates a typed-in exercise in the users OWN tier, in the same write', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await pick(user, 'Exercise 1', 'Zercher Squat')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const updates = updateCalls[0]!
    const path = Object.keys(updates).find((p) => p.includes('/exercises/'))
    expect(path, 'no exercise was created').toBeDefined()
    // The user's own tier, never /config — creating an exercise must not touch
    // shared vocabulary (D-20).
    expect(path!.startsWith(`users/${OWNER}/exercises/`)).toBe(true)
    expect(updates[path!]).toEqual({ name: 'Zercher Squat', muscleGroup: 'Other' })
  })

  it('stamps exercise_id on the very first record, not the next edit', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await pick(user, 'Exercise 1', 'Zercher Squat')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const updates = updateCalls[0]!
    const createdId = Object.keys(updates)
      .find((p) => p.includes('/exercises/'))!
      .split('/')
      .at(-1)
    const raw = updates[workoutPathIn(updates)] as {
      exercises: { exercise_id?: string }[]
    }
    expect(raw.exercises[0]!.exercise_id).toBe(createdId)
  })

  it('does not re-create an exercise already in the catalog', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(
      () => screen.queryAllByRole('button', { name: /log workout/i }).length,
    )

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await pick(user, 'Exercise 1', 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    expect(Object.keys(updateCalls[0]!).some((p) => p.includes('/exercises/'))).toBe(
      false,
    )
  })

  it('prefills the sets from the last session with that exercise', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByLabelText('Exercise 1').length)

    // Triceps Pushdown is the most-logged exercise in the fixture (5 sessions),
    // so naming it must bring that session's sets in rather than leaving one
    // blank row. Squat (Barbell) is in the catalog but in no workout — it would
    // have made this test pass for the wrong reason.
    await pick(user, 'Exercise 1', 'Triceps Pushdown')
    await waitFor(() =>
      expect((screen.getByLabelText('Set 1 reps') as HTMLInputElement).value).not.toBe(
        '',
      ),
    )
  })

  it('never prefills over sets you have already typed into', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByLabelText('Exercise 1').length)

    await user.type(screen.getByLabelText('Set 1 reps'), '3')
    // The same exercise that DOES prefill above — so this proves the guard,
    // not the absence of history.
    await pick(user, 'Exercise 1', 'Triceps Pushdown')

    expect((screen.getByLabelText('Set 1 reps') as HTMLInputElement).value).toBe('3')
  })
})

describe('WorkoutForm — category pills, people, set fields (D-57 … D-60)', () => {
  it('selects the category from pills, not a dropdown', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: 'Push' }).length)

    const push = screen.getByRole('button', { name: 'Push' })
    expect(push).toHaveAttribute('aria-pressed', 'false')
    await user.click(push)
    expect(push).toHaveAttribute('aria-pressed', 'true')
  })

  it('writes the picked category, and nothing when it is cleared', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByRole('button', { name: 'Push' }).length)

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await pick(user, 'Exercise 1', 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    await user.click(screen.getByRole('button', { name: 'Push' }))
    // Tapping it again clears it — 14 of the 81 real records have no category.
    await user.click(screen.getByRole('button', { name: 'Push' }))
    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const updates = updateCalls[0]!
    const raw = updates[workoutPathIn(updates)] as Record<string, unknown>
    expect('category' in raw).toBe(false)
  })

  it('has no per-set seconds field (D-60)', async () => {
    renderForm('create')
    await settled(() => screen.queryAllByLabelText('Set 1 reps').length)
    expect(screen.queryByLabelText(/Set 1 duration/)).toBeNull()
  })

  it('PRESERVES a stored per-set duration through an edit', async () => {
    // The field is gone from the form, not from the record — a save replaces
    // the whole workout, so dropping it from the draft would delete it.
    const withDuration = Object.entries(fixture.workouts).find(([, w]) => {
      const exercises = Object.values(
        (
          w as unknown as {
            exercises: Record<string, { sets?: Record<string, object> }>
          }
        ).exercises,
      )
      return exercises.some((e) =>
        Object.values(e.sets ?? {}).some((s) => 'duration_seconds' in (s as object)),
      )
    })
    if (!withDuration) throw new Error('fixture has no per-set duration')

    const user = userEvent.setup()
    renderForm('edit', withDuration[0])
    await settled(
      () => screen.queryAllByRole('button', { name: /save changes/i }).length,
    )
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const updates = updateCalls[0]!
    const raw = updates[workoutPathIn(updates)] as {
      exercises: { sets: { duration_seconds?: number }[] }[]
    }
    const kept = raw.exercises.some((e) =>
      e.sets.some((s) => typeof s.duration_seconds === 'number'),
    )
    expect(kept, 'a stored duration was dropped on save').toBe(true)
  })

  it('calls a normal set a WORKING set, while still storing "normal" (D-57)', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByLabelText('Set 1 type').length)

    const select = screen.getByLabelText('Set 1 type') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'working',
      'warm-up',
      'feeder',
      'failure',
      'drop set',
    ])
    // The stored value is untouched — 1,027 real sets say "normal" and §0.3
    // forbids a migration.
    expect([...select.options].map((o) => o.value)).toContain('normal')

    await user.type(screen.getByLabelText('Title'), 'Leg day')
    await pick(user, 'Exercise 1', 'Squat (Barbell)')
    await user.type(screen.getByLabelText('Set 1 reps'), '5')
    await user.click(screen.getByRole('button', { name: /log workout/i }))
    await waitFor(() => expect(updateCalls).toHaveLength(1))

    const updates = updateCalls[0]!
    const raw = updates[workoutPathIn(updates)] as {
      exercises: { sets: { set_type: string }[] }[]
    }
    expect(raw.exercises[0]!.sets[0]!.set_type).toBe('normal')
  })

  it('adds a training partner by typing, with no chip wall', async () => {
    const user = userEvent.setup()
    renderForm('create')
    await settled(() => screen.queryAllByLabelText('Add a person').length)

    // Every known person used to render as a toggle chip. None do now.
    expect(screen.queryByRole('button', { name: 'Person A' })).toBeNull()

    await user.type(screen.getByLabelText('Add a person'), 'Person A')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('button', { name: 'Remove Person A' })).toBeInTheDocument()
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
