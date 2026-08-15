import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_DEFAULTS, colorTokenFor } from './config'

/**
 * The admin panel's write layer.
 *
 * Two things matter here: that a category rename rewrites the admin's own
 * records in the SAME write as the config row, and that deleting a category
 * doesn't touch a single record — §4 requires those records to degrade to the
 * neutral colour, not to be edited or blocked.
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
  countCategoryUses,
  deleteCategory,
  renameCategory,
  saveBaseExercise,
  saveCategory,
  saveCategoryOrder,
  saveNamedCatalog,
  saveStringList,
} = await import('./configWrites')

const push0 = { id: 'c1', name: 'Push', colorToken: 'cat-1' as const, order: 0 }

beforeEach(() => {
  pushCounter = 0
  updateCalls.length = 0
  for (const k of Object.keys(nodes)) delete nodes[k]

  nodes['users/u/workouts'] = {
    w1: { category: 'Push' },
    w2: { category: 'Push' },
    w3: { category: 'Legs' },
    w4: {},
  }
  nodes['users/u/runs'] = { r1: { type: 'Light' }, r2: { type: 'Other' } }
  nodes['users/u/settings'] = {}
})

/* ── string lists ───────────────────────────────────────────────────────── */

describe('saveStringList', () => {
  it('writes the list whole, under /config', async () => {
    await saveStringList('muscleGroups', ['Chest', 'Back', 'Core'])
    expect(updateCalls).toEqual([{ 'config/muscleGroups': ['Chest', 'Back', 'Core'] }])
  })

  it('never writes into a user subtree', async () => {
    await saveStringList('repBasedExercises', ['Pull Up'])
    expect(Object.keys(updateCalls[0]!).every((p) => p.startsWith('config/'))).toBe(
      true,
    )
  })
})

describe('saveNamedCatalog', () => {
  it('writes { pushId: { name } }, the shape §3.5 specifies', async () => {
    await saveNamedCatalog('shoes', ['Ultraboost', 'Vaporfly'])
    const node = updateCalls[0]!['config/shoes'] as Record<string, { name: string }>
    expect(Object.values(node).map((v) => v.name)).toEqual(['Ultraboost', 'Vaporfly'])
  })

  it('drops blanks rather than creating an unnamed entry', async () => {
    await saveNamedCatalog('watches', ['Apple Watch', '  ', ''])
    const node = updateCalls[0]!['config/watches'] as Record<string, unknown>
    expect(Object.keys(node)).toHaveLength(1)
  })
})

/* ── categories ─────────────────────────────────────────────────────────── */

describe('saveCategory', () => {
  it('stores the colour as a TOKEN ID, never a hex (§5, D-17)', async () => {
    await saveCategory('workoutCategories', push0)
    expect(updateCalls[0]!['config/workoutCategories/c1']).toEqual({
      name: 'Push',
      colorToken: 'cat-1',
      order: 0,
    })
  })

  it('generates a key for a new category', async () => {
    await saveCategory('runTypes', { ...push0, id: '', name: 'Tempo' })
    const path = Object.keys(updateCalls[0]!)[0]!
    expect(path.startsWith('config/runTypes/')).toBe(true)
    expect(path).not.toBe('config/runTypes/')
  })
})

describe('saveCategoryOrder', () => {
  it('renumbers every entry in one write', async () => {
    await saveCategoryOrder('workoutCategories', [
      { ...push0, id: 'b' },
      { ...push0, id: 'a' },
    ])
    expect(updateCalls).toEqual([
      {
        'config/workoutCategories/b/order': 0,
        'config/workoutCategories/a/order': 1,
      },
    ])
  })
})

describe('renameCategory', () => {
  it('rewrites the config row and the admin’s own workouts in ONE update', async () => {
    const { records } = await renameCategory('u', 'workoutCategories', push0, 'Press')

    expect(updateCalls).toHaveLength(1)
    const updates = updateCalls[0]!
    expect(updates['config/workoutCategories/c1']).toEqual({
      name: 'Press',
      colorToken: 'cat-1',
      order: 0,
    })
    expect(updates['users/u/workouts/w1/category']).toBe('Press')
    expect(updates['users/u/workouts/w2/category']).toBe('Press')
    expect(records).toBe(2)
  })

  it('leaves workouts in other categories, and uncategorized ones, alone', async () => {
    await renameCategory('u', 'workoutCategories', push0, 'Press')
    const updates = updateCalls[0]!
    expect(updates['users/u/workouts/w3/category']).toBeUndefined()
    expect(updates['users/u/workouts/w4/category']).toBeUndefined()
  })

  it('rewrites a run’s `type` for a run type, not a workout’s `category`', async () => {
    await renameCategory(
      'u',
      'runTypes',
      { id: 't1', name: 'Light', colorToken: 'cat-5', order: 1 },
      'Easy',
    )
    const updates = updateCalls[0]!
    expect(updates['users/u/runs/r1/type']).toBe('Easy')
    expect(Object.keys(updates).some((p) => p.includes('/workouts/'))).toBe(false)
  })

  it('writes nothing at all when the name is unchanged', async () => {
    await renameCategory('u', 'workoutCategories', push0, ' Push ')
    expect(updateCalls).toHaveLength(0)
  })

  it('refuses an empty name', async () => {
    await expect(renameCategory('u', 'workoutCategories', push0, '  ')).rejects.toThrow(
      /name is required/i,
    )
  })
})

describe('deleteCategory', () => {
  it('removes ONLY the config row — no record is touched', async () => {
    await deleteCategory('workoutCategories', 'c1')
    // Two workouts still say "Push". They stay that way on purpose: §4 requires
    // them to degrade to the neutral colour, not to be rewritten or blocked.
    expect(updateCalls).toEqual([{ 'config/workoutCategories/c1': null }])
  })

  it('and those records then resolve to the neutral token, not an error', () => {
    expect(colorTokenFor([], 'Push')).toBe('cat-none')
    expect(colorTokenFor(CONFIG_DEFAULTS.workoutCategories, 'Push')).toBe('cat-1')
  })
})

describe('countCategoryUses', () => {
  it('counts the admin’s own records carrying the name', async () => {
    expect(await countCategoryUses('u', 'workoutCategories', 'Push')).toBe(2)
    expect(await countCategoryUses('u', 'workoutCategories', 'Legs')).toBe(1)
    expect(await countCategoryUses('u', 'runTypes', 'Light')).toBe(1)
  })

  it('is zero for a name nothing uses', async () => {
    expect(await countCategoryUses('u', 'workoutCategories', 'Arms')).toBe(0)
  })
})

/* ── the base catalog (D-20, D-31) ──────────────────────────────────────── */

describe('saveBaseExercise', () => {
  it('adds to /config/exercises', async () => {
    await saveBaseExercise(null, 'Zercher Squat', 'Legs')
    const path = Object.keys(updateCalls[0]!)[0]!
    expect(path.startsWith('config/exercises/')).toBe(true)
    expect(updateCalls[0]![path]).toEqual({
      name: 'Zercher Squat',
      muscleGroup: 'Legs',
    })
  })

  it('re-files an existing entry in place, keeping its name', async () => {
    await saveBaseExercise('ex1', 'Plank', 'Core')
    expect(updateCalls[0]!['config/exercises/ex1']).toEqual({
      name: 'Plank',
      muscleGroup: 'Core',
    })
  })

  it('refuses an empty name', async () => {
    await expect(saveBaseExercise(null, '  ', 'Legs')).rejects.toThrow(
      /name is required/i,
    )
  })

  it('exposes no rename and no delete — those cross profiles (D-31)', async () => {
    const module = await import('./configWrites')
    expect('renameBaseExercise' in module).toBe(false)
    expect('deleteBaseExercise' in module).toBe(false)
  })
})
