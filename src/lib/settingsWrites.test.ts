import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The write layer, against a path-aware Firebase mock.
 *
 * What matters here is not that `update` was called — it is that a rename is
 * ONE call containing both the catalog row and the history, and that a delete
 * of something still referenced never reaches the database at all (D-5).
 */

let pushCounter = 0
const updateCalls: Record<string, unknown>[] = []

const nodes: Record<string, unknown> = {}

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path?: string) => path ?? '',
  push: (path: string) => ({ key: `${path}/generated-${++pushCounter}` }),
  get: vi.fn(async (path: string) => ({
    exists: () => nodes[path] !== undefined,
    val: () => nodes[path],
  })),
  update: vi.fn(async (_root: unknown, updates: Record<string, unknown>) => {
    updateCalls.push(updates)
  }),
  remove: vi.fn(async () => {}),
}))

const {
  EntityReferencedError,
  createEntity,
  deleteEntity,
  mergeEntity,
  renameEntity,
  saveSettings,
  setExerciseMuscleGroup,
} = await import('./settingsWrites')

beforeEach(() => {
  pushCounter = 0
  updateCalls.length = 0
  for (const k of Object.keys(nodes)) delete nodes[k]

  nodes['users/u/workouts'] = {
    w1: {
      gym: 'Place A',
      people: ['Person A'],
      exercises: [{ exercise_title: 'Squat', sets: [] }],
    },
    w2: { gym: 'Place B', exercises: [{ exercise_title: 'Bench', sets: [] }] },
  }
  nodes['users/u/runs'] = { r1: { location: 'Place A', people: ['Person A'] } }
  nodes['users/u/settings'] = { featuredExercises: ['Squat'] }
})

/* ── settings ───────────────────────────────────────────────────────────── */

describe('saveSettings', () => {
  it('writes one path per key, leaving every other setting untouched', async () => {
    await saveSettings('u', { units: 'lb', bodyweightKg: 80 })
    expect(updateCalls).toEqual([
      { 'users/u/settings/units': 'lb', 'users/u/settings/bodyweightKg': 80 },
    ])
  })

  it('writes null to clear a value rather than writing 0', async () => {
    await saveSettings('u', { bodyweightKg: null })
    expect(updateCalls[0]!['users/u/settings/bodyweightKg']).toBeNull()
  })

  it('never touches /config — global vocabulary is the admin panel’s (D-17b)', async () => {
    await saveSettings('u', { units: 'kg' })
    expect(Object.keys(updateCalls[0]!).every((p) => p.startsWith('users/u/'))).toBe(
      true,
    )
  })
})

/* ── create ─────────────────────────────────────────────────────────────── */

describe('createEntity', () => {
  it('creates an exercise in the user’s OWN tier, never in /config (D-20)', async () => {
    await createEntity('u', 'exercise', { name: 'Zercher Squat', muscleGroup: 'Legs' })
    const path = Object.keys(updateCalls[0]!)[0]!
    expect(path.startsWith('users/u/exercises/')).toBe(true)
    expect(updateCalls[0]![path]).toEqual({
      name: 'Zercher Squat',
      muscleGroup: 'Legs',
    })
  })

  it('writes a place to the gyms node — "places" is a UI name only (§3.4)', async () => {
    await createEntity('u', 'place', { name: 'Trailhead' })
    expect(Object.keys(updateCalls[0]!)[0]!.startsWith('users/u/gyms/')).toBe(true)
  })

  it('gives a person no muscle group', async () => {
    await createEntity('u', 'person', { name: 'Sam' })
    const path = Object.keys(updateCalls[0]!)[0]!
    expect(updateCalls[0]![path]).toEqual({ name: 'Sam' })
  })
})

/* ── re-filing a muscle group (D-20) ────────────────────────────────────── */

describe('setExerciseMuscleGroup', () => {
  it('updates in place when the exercise is already the user’s own', async () => {
    await setExerciseMuscleGroup(
      'u',
      { id: 'ex1', name: 'Plank', tier: 'user' },
      'Core',
    )
    expect(updateCalls[0]!['users/u/exercises/ex1']).toEqual({
      name: 'Plank',
      muscleGroup: 'Core',
    })
  })

  it('shadows a shared exercise with a user-tier entry instead of mutating it', async () => {
    await setExerciseMuscleGroup(
      'u',
      { id: 'config-id', name: 'Plank', tier: 'base' },
      'Core',
    )
    const path = Object.keys(updateCalls[0]!)[0]!
    expect(path.startsWith('users/u/exercises/')).toBe(true)
    // The base row's id is NOT reused, and /config is not written at all.
    expect(path).not.toContain('config-id')
    expect(path).not.toContain('config/')
    expect(updateCalls[0]![path]).toEqual({ name: 'Plank', muscleGroup: 'Core' })
  })
})

/* ── rename (D-5) ───────────────────────────────────────────────────────── */

describe('renameEntity', () => {
  it('moves the catalog row and rewrites history in ONE atomic update', async () => {
    const { records } = await renameEntity(
      'u',
      'exercise',
      { id: 'ex1', muscleGroup: 'Legs' },
      'Squat',
      'Back Squat',
    )

    expect(updateCalls).toHaveLength(1)
    const updates = updateCalls[0]!
    expect(updates['users/u/exercises/ex1']).toEqual({
      name: 'Back Squat',
      muscleGroup: 'Legs',
    })
    expect(updates['users/u/workouts/w1/exercises/0/exercise_title']).toBe('Back Squat')
    expect(updates['users/u/settings/featuredExercises']).toEqual(['Back Squat'])
    expect(records).toBe(1)
  })

  it('rewrites both a workout gym and a run location for a place', async () => {
    await renameEntity('u', 'place', { id: 'g1' }, 'Place A', 'Place One')
    const updates = updateCalls[0]!
    expect(updates['users/u/workouts/w1/gym']).toBe('Place One')
    expect(updates['users/u/runs/r1/location']).toBe('Place One')
    expect(updates['users/u/gyms/g1']).toEqual({ name: 'Place One' })
  })

  it('does nothing at all when the name is unchanged', async () => {
    await renameEntity('u', 'place', { id: 'g1' }, 'Place A', '  Place A  ')
    expect(updateCalls).toHaveLength(0)
  })

  it('refuses an empty name', async () => {
    await expect(
      renameEntity('u', 'place', { id: 'g1' }, 'Place A', '   '),
    ).rejects.toThrow(/name is required/i)
    expect(updateCalls).toHaveLength(0)
  })
})

/* ── merge, the alternative to a cascading delete (D-5) ─────────────────── */

describe('mergeEntity', () => {
  it('moves every record across and removes only the source row', async () => {
    const { records } = await mergeEntity(
      'u',
      'place',
      { id: 'g1', name: 'Place A' },
      'Place B',
    )

    expect(updateCalls).toHaveLength(1)
    const updates = updateCalls[0]!
    expect(updates['users/u/workouts/w1/gym']).toBe('Place B')
    expect(updates['users/u/runs/r1/location']).toBe('Place B')
    // The source disappears; the target keeps its own key.
    expect(updates['users/u/gyms/g1']).toBeNull()
    expect(records).toBe(2)
  })

  it('refuses to merge something into itself', async () => {
    await expect(
      mergeEntity('u', 'place', { id: 'g1', name: 'Place A' }, 'Place A'),
    ).rejects.toThrow(/into itself/i)
    expect(updateCalls).toHaveLength(0)
  })
})

/* ── delete, blocked while referenced (D-5) ─────────────────────────────── */

describe('deleteEntity', () => {
  it('BLOCKS the delete when history still references the name', async () => {
    await expect(
      deleteEntity('u', 'place', { id: 'g1', name: 'Place A' }),
    ).rejects.toBeInstanceOf(EntityReferencedError)
    // The guard is at the write boundary, not only in the dialog: nothing was
    // sent to the database.
    expect(updateCalls).toHaveLength(0)
  })

  it('reports how many records blocked it, so the UI can offer a merge', async () => {
    await expect(
      deleteEntity('u', 'place', { id: 'g1', name: 'Place A' }),
    ).rejects.toMatchObject({ records: 2 })
  })

  it('deletes when nothing references it', async () => {
    await deleteEntity('u', 'person', { id: 'p9', name: 'Nobody' })
    expect(updateCalls).toEqual([{ 'users/u/people/p9': null }])
  })

  it('also drops it from the featured shortlist — curation never blocks a delete', async () => {
    nodes['users/u/workouts'] = {}
    nodes['users/u/runs'] = {}
    await deleteEntity('u', 'exercise', { id: 'ex1', name: 'Squat' })
    expect(updateCalls[0]!['users/u/exercises/ex1']).toBeNull()
    expect(updateCalls[0]!['users/u/settings/featuredExercises']).toEqual([])
  })
})
