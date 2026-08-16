import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { normalizeWorkout } from '../lib/normalize'
import { computePRAchievements } from './prEngine'
import { setSeriesFor } from './setSeries'
import type { RawWorkout, SetType, Workout, WorkoutSet } from '../types'

const fixtureWorkouts = fixture.workouts as unknown as Record<string, RawWorkout>
const real = Object.entries(fixtureWorkouts)
  .map(([id, raw]) => normalizeWorkout(id, raw))
  .filter((w): w is Workout => w !== null)

/* ── hand-built cases, for the rules that are easy to get subtly wrong ──── */

function set(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    setIndex: 0,
    setType: 'normal' as SetType,
    reps: 10,
    weight: { kind: 'loaded', kg: 50 },
    durationSeconds: null,
    ...over,
  }
}

function workout(id: string, day: number, sets: WorkoutSet[]): Workout {
  return {
    id,
    title: 'Session',
    description: '',
    startTime: new Date(2026, 3, day, 17, 0),
    endTime: null,
    place: null,
    category: null,
    categoryId: null,
    avgHeartRate: null,
    calories: null,
    people: [],
    exercises: [{ exerciseTitle: 'Bench', exerciseId: null, notes: null, sets }],
    durationMinutes: null,
  }
}

describe('setSeriesFor — one point per set, in the order performed', () => {
  it('orders by start_time and NOT by key', () => {
    // 37 real workouts carry numeric-string keys from an import and 44 carry
    // push ids, so key order says nothing about when anything happened (§3.1).
    const points = setSeriesFor(
      [
        workout('zzz-later-key', 1, [set({ reps: 1 })]),
        workout('aaa-earlier-key', 9, [set({ reps: 2 })]),
      ],
      'Bench',
      [],
      null,
    )
    expect(points.map((p) => p.reps)).toEqual([1, 2])
  })

  it('numbers sets within their own session, and marks session boundaries', () => {
    const points = setSeriesFor(
      [
        workout('w1', 1, [set({ setIndex: 0 }), set({ setIndex: 1 })]),
        workout('w2', 2, [set({ setIndex: 0 })]),
      ],
      'Bench',
      [],
      null,
    )
    expect(points.map((p) => p.setInSession)).toEqual([1, 2, 1])
    expect(points.map((p) => p.session)).toEqual([0, 0, 1])
    expect(points.map((p) => p.index)).toEqual([0, 1, 2])
  })

  it('ignores other exercises entirely', () => {
    const w = workout('w1', 1, [set()])
    w.exercises.push({
      exerciseTitle: 'Squat',
      exerciseId: null,
      notes: null,
      sets: [set({ reps: 99 })],
    })
    expect(setSeriesFor([w], 'Bench', [], null).map((p) => p.reps)).toEqual([10])
  })

  it('excludes a failure set with zero reps — the lift was not completed', () => {
    const points = setSeriesFor(
      [workout('w1', 1, [set(), set({ setType: 'failure', reps: 0 })])],
      'Bench',
      [],
      null,
    )
    expect(points).toHaveLength(1)
  })

  it('keeps a failure set that DID have reps', () => {
    const points = setSeriesFor(
      [workout('w1', 1, [set({ setType: 'failure', reps: 3 })])],
      'Bench',
      [],
      null,
    )
    expect(points).toHaveLength(1)
    expect(points[0]!.setType).toBe('failure')
  })
})

describe('setSeriesFor — the three weight states (D-7b)', () => {
  it('a real load gives weight and volume', () => {
    const [p] = setSeriesFor([workout('w', 1, [set()])], 'Bench', [], 80)
    expect(p!.weightKg).toBe(50)
    expect(p!.volumeKg).toBe(500)
  })

  it('a genuine 0 kg set is zero, not missing', () => {
    const [p] = setSeriesFor(
      [workout('w', 1, [set({ weight: { kind: 'zero' } })])],
      'Bench',
      [],
      80,
    )
    expect(p!.weightKg).toBe(0)
    expect(p!.volumeKg).toBe(0)
  })

  it('a bodyweight set has NO weight, but volume substitutes (D-7)', () => {
    // The substitution is volume-only. Reporting 80 kg as the load would claim
    // a lift that was never logged; reporting zero volume would say a pull-up
    // session was no work at all.
    const [p] = setSeriesFor(
      [workout('w', 1, [set({ weight: { kind: 'bodyweight' } })])],
      'Bench',
      [],
      80,
    )
    expect(p!.weightKg).toBeNull()
    expect(p!.volumeKg).toBe(800)
  })

  it('a bodyweight set with no configured bodyweight has no volume either', () => {
    const [p] = setSeriesFor(
      [workout('w', 1, [set({ weight: { kind: 'bodyweight' } })])],
      'Bench',
      [],
      null,
    )
    expect(p!.weightKg).toBeNull()
    expect(p!.volumeKg).toBeNull()
  })

  it('a set with no reps at all has no volume — there is one in the real data', () => {
    const [p] = setSeriesFor([workout('w', 1, [set({ reps: null })])], 'Bench', [], 80)
    expect(p!.reps).toBeNull()
    expect(p!.volumeKg).toBeNull()
    expect(p!.weightKg).toBe(50)
  })
})

describe('setSeriesFor — PR marks', () => {
  it('attaches achievements to the exact set that earned them', () => {
    const points = setSeriesFor(
      [workout('w1', 1, [set({ setIndex: 0 }), set({ setIndex: 1 })])],
      'Bench',
      [
        {
          exerciseTitle: 'Bench',
          metric: 'weight',
          value: 50,
          previous: 40,
          date: new Date(2026, 3, 1),
          workoutId: 'w1',
          setIndex: 1,
        },
      ],
      null,
    )
    expect(points[0]!.prMetrics).toEqual([])
    expect(points[1]!.prMetrics).toEqual(['weight'])
  })

  it('ignores achievements belonging to a different exercise', () => {
    const points = setSeriesFor(
      [workout('w1', 1, [set()])],
      'Bench',
      [
        {
          exerciseTitle: 'Squat',
          metric: 'weight',
          value: 50,
          previous: 40,
          date: new Date(2026, 3, 1),
          workoutId: 'w1',
          setIndex: 0,
        },
      ],
      null,
    )
    expect(points[0]!.prMetrics).toEqual([])
  })
})

/* ── against the committed fixture ──────────────────────────────────────── */

describe('setSeriesFor — over the real fixture', () => {
  const title = 'Triceps Pushdown'
  const achievements = computePRAchievements(real)
  const points = setSeriesFor(real, title, achievements, 78)

  it('produces a point for every WORKING set of that exercise', () => {
    const counted = real.reduce(
      (n, w) =>
        n +
        w.exercises
          .filter((e) => e.exerciseTitle === title)
          .reduce(
            (m, e) =>
              m +
              e.sets.filter(
                (s) =>
                  !(s.setType === 'failure' && s.reps === 0) &&
                  s.setType !== 'warmup' &&
                  s.setType !== 'feeder',
              ).length,
            0,
          ),
      0,
    )
    expect(points).toHaveLength(counted)
    expect(points.length).toBeGreaterThan(1)
  })

  it('leaves the fixture warm-up out — it has one for this exercise', () => {
    const scaffolding = real.reduce(
      (n, w) =>
        n +
        w.exercises
          .filter((e) => e.exerciseTitle === title)
          .reduce(
            (m, e) =>
              m +
              e.sets.filter((s) => s.setType === 'warmup' || s.setType === 'feeder')
                .length,
            0,
          ),
      0,
    )
    expect(scaffolding).toBeGreaterThan(0)
    expect(points.every((p) => p.setType !== 'warmup' && p.setType !== 'feeder')).toBe(
      true,
    )
  })

  it('is strictly non-decreasing in time', () => {
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!.date.getTime()).toBeGreaterThanOrEqual(
        points[i - 1]!.date.getTime(),
      )
    }
  })

  it('never emits NaN', () => {
    for (const p of points) {
      for (const v of [p.reps, p.weightKg, p.volumeKg]) {
        if (v !== null) expect(Number.isNaN(v)).toBe(false)
      }
    }
  })

  it('returns nothing for an exercise that was never logged', () => {
    expect(setSeriesFor(real, 'Not A Real Exercise', achievements, 78)).toEqual([])
  })
})

describe('setSeriesFor — scaffolding is not the work (D-64)', () => {
  it('drops warm-up and feeder sets', () => {
    // A warm-up is 20–30% of the working load and a feeder 40–75% (§8), so
    // plotting them turns every session into a sawtooth that says nothing
    // about progression.
    const points = setSeriesFor(
      [
        workout('w1', 1, [
          set({ setType: 'warmup', weight: { kind: 'loaded', kg: 15 } }),
          set({ setType: 'feeder', weight: { kind: 'loaded', kg: 30 } }),
          set({ setType: 'normal', weight: { kind: 'loaded', kg: 60 } }),
        ]),
      ],
      'Bench',
      [],
      null,
    )
    expect(points.map((p) => p.weightKg)).toEqual([60])
  })

  it('KEEPS dropset and failure — those are the work, done hard', () => {
    const points = setSeriesFor(
      [
        workout('w1', 1, [
          set({ setType: 'dropset' }),
          set({ setType: 'failure', reps: 4 }),
        ]),
      ],
      'Bench',
      [],
      null,
    )
    expect(points.map((p) => p.setType)).toEqual(['dropset', 'failure'])
  })

  it('numbers working sets from 1, without gaps where a warm-up was skipped', () => {
    // "My second work set" is how a lifter counts them; a raw set_index would
    // read 3 for the first thing actually plotted.
    const points = setSeriesFor(
      [
        workout('w1', 1, [
          set({ setIndex: 0, setType: 'warmup' }),
          set({ setIndex: 1, setType: 'warmup' }),
          set({ setIndex: 2 }),
          set({ setIndex: 3 }),
        ]),
      ],
      'Bench',
      [],
      null,
    )
    expect(points.map((p) => p.setInSession)).toEqual([1, 2])
  })

  it('returns nothing for a session that was warm-up only', () => {
    const points = setSeriesFor(
      [workout('w1', 1, [set({ setType: 'warmup' })])],
      'Bench',
      [],
      null,
    )
    expect(points).toEqual([])
  })
})
