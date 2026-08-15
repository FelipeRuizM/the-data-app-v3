import { beforeEach, describe, expect, it, vi } from 'vitest'
import { namesNotIn } from './writes'
import type { RawRun, RawWorkout } from '../types'

describe('namesNotIn', () => {
  it('returns names that are not already in the existing list', () => {
    expect(namesNotIn(['Gym A', 'Gym C'], ['Gym A', 'Gym B'])).toEqual(['Gym C'])
  })

  it('returns everything when nothing exists yet', () => {
    expect(namesNotIn(['Gym A'], [])).toEqual(['Gym A'])
  })

  it('returns nothing when everything already exists', () => {
    expect(namesNotIn(['Gym A'], ['Gym A'])).toEqual([])
  })

  it('drops blanks — an empty place selection is not a new place', () => {
    expect(namesNotIn(['', '  '], [])).toEqual([])
  })

  it('deduplicates within the input itself', () => {
    // Two new training partners with the same typed name must create one
    // person, not two.
    expect(namesNotIn(['Person C', 'Person C'], [])).toEqual(['Person C'])
  })

  it('is case-sensitive, matching how every other join in this app works (§3.7)', () => {
    expect(namesNotIn(['gym a'], ['Gym A'])).toEqual(['gym a'])
  })

  it('trims before comparing', () => {
    expect(namesNotIn(['  Gym A  '], ['Gym A'])).toEqual([])
  })
})

/* ── saveWorkout / deleteWorkout — mocked Firebase, path-aware ──────────── */

let pushCounter = 0
const updateCalls: Record<string, unknown>[] = []
const removeCalls: string[] = []

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path?: string) => path ?? '',
  push: (path: string) => ({ key: `${path}/generated-${++pushCounter}` }),
  update: vi.fn(async (_root: unknown, updates: Record<string, unknown>) => {
    updateCalls.push(updates)
  }),
  remove: vi.fn(async (path: string) => {
    removeCalls.push(path)
  }),
}))

const { saveWorkout, saveRun, deleteWorkout, deleteRun } = await import('./writes')

const minimalRaw: RawWorkout = {
  title: 'Leg day',
  description: '',
  start_time: '8 Apr 2026, 16:50',
  end_time: '8 Apr 2026, 17:50',
  gym: 'Gym A',
  exercises: [],
}

beforeEach(() => {
  pushCounter = 0
  updateCalls.length = 0
  removeCalls.length = 0
})

describe('saveWorkout — create', () => {
  it('writes the workout at a freshly generated key under the right uid', async () => {
    const { id } = await saveWorkout({
      uid: 'owner',
      id: null,
      raw: minimalRaw,
      newPlaces: [],
      newPeople: [],
    })
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]![`users/owner/workouts/${id}`]).toBe(minimalRaw)
  })

  it('creates new places and people in the SAME update as the workout — one atomic write', async () => {
    await saveWorkout({
      uid: 'owner',
      id: null,
      raw: minimalRaw,
      newPlaces: ['New Gym'],
      newPeople: ['New Friend'],
    })
    expect(updateCalls).toHaveLength(1)
    const paths = Object.keys(updateCalls[0]!)
    expect(paths.some((p) => p.startsWith('users/owner/gyms/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('users/owner/people/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('users/owner/workouts/'))).toBe(true)

    const gymPath = paths.find((p) => p.startsWith('users/owner/gyms/'))!
    expect(updateCalls[0]![gymPath]).toEqual({ name: 'New Gym' })
    const personPath = paths.find((p) => p.startsWith('users/owner/people/'))!
    expect(updateCalls[0]![personPath]).toEqual({ name: 'New Friend' })
  })

  it('writes no gym/people paths when there is nothing new', async () => {
    await saveWorkout({
      uid: 'owner',
      id: null,
      raw: minimalRaw,
      newPlaces: [],
      newPeople: [],
    })
    const paths = Object.keys(updateCalls[0]!)
    expect(paths.some((p) => p.includes('/gyms/'))).toBe(false)
    expect(paths.some((p) => p.includes('/people/'))).toBe(false)
  })
})

describe('saveWorkout — edit', () => {
  it('writes to the SAME id when one is supplied, never generating a new one', async () => {
    const { id } = await saveWorkout({
      uid: 'owner',
      id: 'existing-id',
      raw: minimalRaw,
      newPlaces: [],
      newPeople: [],
    })
    expect(id).toBe('existing-id')
    expect(updateCalls[0]!['users/owner/workouts/existing-id']).toBe(minimalRaw)
  })
})

describe('deleteWorkout', () => {
  it('removes exactly the one workout path for the given uid and id', async () => {
    await deleteWorkout('owner', 'workout-1')
    expect(removeCalls).toEqual(['users/owner/workouts/workout-1'])
  })
})

describe('saveRun / deleteRun — same guarantees, different collection', () => {
  const minimalRun: RawRun = {
    title: 'Morning run',
    description: '',
    start_time: '8 Apr 2026, 07:00',
    type: 'Other',
    location: 'Place A',
    distance_km: 5,
    duration_seconds: 1800,
    pace: '6:00',
  }

  it('writes the run under users/<uid>/runs, not workouts', async () => {
    const { id } = await saveRun({
      uid: 'owner',
      id: null,
      raw: minimalRun,
      newPlaces: [],
      newPeople: [],
    })
    expect(updateCalls[0]![`users/owner/runs/${id}`]).toBe(minimalRun)
    expect(Object.keys(updateCalls[0]!).some((p) => p.includes('/workouts/'))).toBe(
      false,
    )
  })

  it('creates a new place in the SAME atomic write', async () => {
    await saveRun({
      uid: 'owner',
      id: null,
      raw: minimalRun,
      newPlaces: ['Trailhead'],
      newPeople: [],
    })
    expect(updateCalls).toHaveLength(1)
    const gymPath = Object.keys(updateCalls[0]!).find((p) => p.includes('/gyms/'))!
    expect(updateCalls[0]![gymPath]).toEqual({ name: 'Trailhead' })
  })

  it('writes to the same id when editing', async () => {
    const { id } = await saveRun({
      uid: 'owner',
      id: 'run-1',
      raw: minimalRun,
      newPlaces: [],
      newPeople: [],
    })
    expect(id).toBe('run-1')
  })

  it('deletes exactly the one run path', async () => {
    await deleteRun('owner', 'run-1')
    expect(removeCalls).toEqual(['users/owner/runs/run-1'])
  })
})
