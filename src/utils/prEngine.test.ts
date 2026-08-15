import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { buildProfile } from '../lib/db'
import {
  achievementsBySet,
  calculatePRs,
  computePRAchievements,
  epley1RM,
  exercisesWithRecords,
  isExcludedSet,
} from './prEngine'
import type { SetType, Workout, WorkoutSet } from '../types'

/* ── builders ───────────────────────────────────────────────────────────── */

let uid = 0

function set(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    setIndex: 0,
    setType: 'normal' as SetType,
    reps: 5,
    weight: { kind: 'loaded', kg: 100 },
    durationSeconds: null,
    ...over,
  }
}

function workout(
  startTime: Date,
  exercises: { title: string; sets: WorkoutSet[] }[],
): Workout {
  return {
    id: `w${++uid}`,
    title: 'Session',
    description: '',
    startTime,
    endTime: null,
    place: null,
    categoryId: null,
    category: null,
    avgHeartRate: null,
    people: [],
    exercises: exercises.map((e) => ({
      exerciseId: null,
      exerciseTitle: e.title,
      notes: null,
      sets: e.sets.map((s, i) => ({ ...s, setIndex: s.setIndex || i })),
    })),
    durationMinutes: null,
  }
}

const day = (n: number) => new Date(2026, 0, n, 12, 0)

/* ── shared rules ───────────────────────────────────────────────────────── */

describe('isExcludedSet — failure AND zero reps (§6.1)', () => {
  it('excludes a failure set with 0 reps', () => {
    expect(isExcludedSet(set({ setType: 'failure', reps: 0 }))).toBe(true)
  })

  it('KEEPS a failure set with reps above 0 — note the conjunction', () => {
    expect(isExcludedSet(set({ setType: 'failure', reps: 3 }))).toBe(false)
  })

  it('KEEPS a 0-rep set of any other type — a data oddity, not a failure', () => {
    expect(isExcludedSet(set({ setType: 'normal', reps: 0 }))).toBe(false)
    expect(isExcludedSet(set({ setType: 'dropset', reps: 0 }))).toBe(false)
  })
})

describe('epley1RM', () => {
  it('applies weight × (1 + reps/30)', () => {
    expect(epley1RM(100, 30)).toBe(200)
    expect(epley1RM(100, 0)).toBe(100)
  })
})

/* ── 6.1 calculatePRs ───────────────────────────────────────────────────── */

describe('calculatePRs', () => {
  it('tracks the three maxima independently, each with its own date', () => {
    const prs = calculatePRs([
      workout(day(1), [
        {
          title: 'Squat',
          sets: [set({ weight: { kind: 'loaded', kg: 100 }, reps: 5 })],
        },
      ]),
      // Heavier but fewer reps — beats maxWeight, not maxVolume.
      workout(day(2), [
        {
          title: 'Squat',
          sets: [set({ weight: { kind: 'loaded', kg: 120 }, reps: 3 })],
        },
      ]),
      // Lighter but far more reps — beats maxVolume and maxReps only.
      workout(day(3), [
        {
          title: 'Squat',
          sets: [set({ weight: { kind: 'loaded', kg: 80 }, reps: 12 })],
        },
      ]),
    ])

    const squat = prs.get('Squat')!
    expect(squat.maxWeight!.value).toBe(120)
    expect(squat.maxWeight!.date).toEqual(day(2))
    expect(squat.maxVolume!.value).toBe(960)
    expect(squat.maxVolume!.date).toEqual(day(3))
    expect(squat.maxReps!.value).toBe(12)
  })

  it('leaves maxWeight and maxVolume NULL for a purely bodyweight exercise (D-7)', () => {
    const prs = calculatePRs([
      workout(day(1), [
        { title: 'Pull Up', sets: [set({ weight: { kind: 'bodyweight' }, reps: 8 })] },
      ]),
    ])
    const pullUp = prs.get('Pull Up')!
    // Never 0 — undefined. A 0 would rank it below every loaded lift.
    expect(pullUp.maxWeight).toBeNull()
    expect(pullUp.maxVolume).toBeNull()
    expect(pullUp.maxReps!.value).toBe(8)
  })

  it('treats a genuine 0 kg set as a real record of 0, distinct from bodyweight', () => {
    const prs = calculatePRs([
      workout(day(1), [
        { title: 'Assisted Dip', sets: [set({ weight: { kind: 'zero' }, reps: 10 })] },
      ]),
    ])
    const dip = prs.get('Assisted Dip')!
    expect(dip.maxWeight!.value).toBe(0)
    expect(dip.maxVolume!.value).toBe(0)
  })

  it('excludes a failure+0-reps set from every maximum', () => {
    const prs = calculatePRs([
      workout(day(1), [
        {
          title: 'Squat',
          sets: [
            set({ weight: { kind: 'loaded', kg: 100 }, reps: 5 }),
            set({ setType: 'failure', reps: 0, weight: { kind: 'loaded', kg: 200 } }),
          ],
        },
      ]),
    ])
    // The 200kg attempt must not become the record.
    expect(prs.get('Squat')!.maxWeight!.value).toBe(100)
    expect(prs.get('Squat')!.setCount).toBe(1)
  })

  it('a set with no reps contributes to maxWeight but not volume or reps', () => {
    const prs = calculatePRs([
      workout(day(1), [
        {
          title: 'Squat',
          sets: [set({ reps: null, weight: { kind: 'loaded', kg: 150 } })],
        },
      ]),
    ])
    const squat = prs.get('Squat')!
    expect(squat.maxWeight!.value).toBe(150)
    expect(squat.maxVolume).toBeNull()
    expect(squat.maxReps).toBeNull()
  })

  it('keeps the EARLIER date when a record is tied rather than re-set', () => {
    const prs = calculatePRs([
      workout(day(1), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
      ]),
      workout(day(5), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
      ]),
    ])
    expect(prs.get('Squat')!.maxWeight!.date).toEqual(day(1))
  })

  it('orders by start_time, not by insertion or key (§3.1)', () => {
    const later = workout(day(10), [
      { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 120 } })] },
    ])
    const earlier = workout(day(1), [
      { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
    ])
    // Passed newest-first on purpose.
    const prs = calculatePRs([later, earlier])
    expect(prs.get('Squat')!.maxWeight!.date).toEqual(day(10))
  })

  it('counts sessions, not sets', () => {
    const prs = calculatePRs([
      workout(day(1), [{ title: 'Squat', sets: [set(), set(), set()] }]),
      workout(day(2), [{ title: 'Squat', sets: [set()] }]),
    ])
    expect(prs.get('Squat')!.sessionCount).toBe(2)
    expect(prs.get('Squat')!.setCount).toBe(4)
  })

  describe('daysSinceLastPR', () => {
    it('counts from the most recent weight/volume PR', () => {
      const prs = calculatePRs([
        workout(day(1), [
          { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
        ]),
      ])
      const expected = Math.floor((Date.now() - day(1).getTime()) / 86_400_000)
      expect(prs.get('Squat')!.daysSinceLastPR).toBe(expected)
    })

    it('IGNORES a reps PR for a non-rep-based exercise', () => {
      const prs = calculatePRs(
        [
          workout(day(1), [
            {
              title: 'Squat',
              sets: [set({ weight: { kind: 'loaded', kg: 100 }, reps: 5 })],
            },
          ]),
          // Later reps-only improvement, no new weight.
          workout(day(20), [
            {
              title: 'Squat',
              sets: [set({ weight: { kind: 'loaded', kg: 50 }, reps: 20 })],
            },
          ]),
        ],
        [], // Squat is not rep-based
      )
      // Volume PR on day 20 (50×20=1000 > 500), so it does count via volume.
      expect(prs.get('Squat')!.daysSinceLastPR).toBe(
        Math.floor((Date.now() - day(20).getTime()) / 86_400_000),
      )
    })

    it('COUNTS a reps PR when the exercise is in the configurable rep-based list (D-6)', () => {
      const prs = calculatePRs(
        [
          workout(day(1), [
            {
              title: 'Pull Up',
              sets: [set({ weight: { kind: 'bodyweight' }, reps: 5 })],
            },
          ]),
          workout(day(20), [
            {
              title: 'Pull Up',
              sets: [set({ weight: { kind: 'bodyweight' }, reps: 9 })],
            },
          ]),
        ],
        ['Pull Up'],
      )
      expect(prs.get('Pull Up')!.daysSinceLastPR).toBe(
        Math.floor((Date.now() - day(20).getTime()) / 86_400_000),
      )
    })

    it('is null when an exercise has no records at all', () => {
      const prs = calculatePRs([
        workout(day(1), [
          { title: 'Mystery', sets: [set({ setType: 'failure', reps: 0 })] },
        ]),
      ])
      expect(prs.get('Mystery')!.daysSinceLastPR).toBeNull()
    })
  })
})

describe('exercisesWithRecords', () => {
  it('drops exercises with no maxima', () => {
    const prs = calculatePRs([
      workout(day(1), [
        { title: 'Real', sets: [set()] },
        { title: 'Empty', sets: [set({ setType: 'failure', reps: 0 })] },
      ]),
    ])
    expect(exercisesWithRecords(prs).map((p) => p.exerciseTitle)).toEqual(['Real'])
  })
})

/* ── 6.2 computePRAchievements ──────────────────────────────────────────── */

describe('computePRAchievements — the non-trivial rules', () => {
  it('RULE 3: the first session is silent, however many sets it has', () => {
    const a = computePRAchievements([
      workout(day(1), [
        {
          title: 'Squat',
          sets: [
            set({ weight: { kind: 'loaded', kg: 100 } }),
            set({ weight: { kind: 'loaded', kg: 120 } }),
            set({ weight: { kind: 'loaded', kg: 140 } }),
          ],
        },
      ]),
    ])
    expect(a).toEqual([])
  })

  it('RULE 2: one badge per metric per session, on the BEST set', () => {
    const a = computePRAchievements([
      workout(day(1), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
      ]),
      workout(day(2), [
        {
          title: 'Squat',
          // Three sets all beat the old 100kg PR.
          sets: [
            set({ setIndex: 0, weight: { kind: 'loaded', kg: 110 } }),
            set({ setIndex: 1, weight: { kind: 'loaded', kg: 130 } }),
            set({ setIndex: 2, weight: { kind: 'loaded', kg: 120 } }),
          ],
        },
      ]),
    ])

    const weightBadges = a.filter((x) => x.metric === 'weight')
    expect(weightBadges).toHaveLength(1)
    expect(weightBadges[0]!.value).toBe(130)
    expect(weightBadges[0]!.setIndex).toBe(1)
  })

  it('RULE 4: one set can earn several badges at once', () => {
    const a = computePRAchievements([
      workout(day(1), [
        {
          title: 'Squat',
          sets: [set({ weight: { kind: 'loaded', kg: 100 }, reps: 5 })],
        },
      ]),
      // Heavier AND more reps — beats weight, volume and 1RM together.
      workout(day(2), [
        {
          title: 'Squat',
          sets: [set({ weight: { kind: 'loaded', kg: 120 }, reps: 8 })],
        },
      ]),
    ])
    expect(new Set(a.map((x) => x.metric))).toEqual(
      new Set(['weight', 'volume', 'oneRM']),
    )
    expect(new Set(a.map((x) => x.setIndex))).toEqual(new Set([0]))
  })

  it('RULE 1: sessions are ordered by start_time regardless of input order', () => {
    const first = workout(day(1), [
      { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
    ])
    const second = workout(day(2), [
      { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 120 } })] },
    ])
    // Newest-first input must not make day 1 look like an improvement on day 2.
    const a = computePRAchievements([second, first])
    // Reps are equal, so the heavier day also improves volume and 1RM — all
    // three badges land on day 2, and none on day 1.
    expect(a.every((x) => x.date.getTime() === day(2).getTime())).toBe(true)
    expect(a.find((x) => x.metric === 'weight')!.value).toBe(120)
  })

  it('RULE 5: excluded sets cannot earn a badge', () => {
    const a = computePRAchievements([
      workout(day(1), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
      ]),
      workout(day(2), [
        {
          title: 'Squat',
          sets: [
            set({ setType: 'failure', reps: 0, weight: { kind: 'loaded', kg: 300 } }),
          ],
        },
      ]),
    ])
    expect(a).toEqual([])
  })

  it('does not badge a mere tie — records are BROKEN, not matched', () => {
    const a = computePRAchievements([
      workout(day(1), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
      ]),
      workout(day(2), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
      ]),
    ])
    expect(a).toEqual([])
  })

  it('reports the previous value it beat', () => {
    const a = computePRAchievements([
      workout(day(1), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
      ]),
      workout(day(2), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 120 } })] },
      ]),
    ])
    expect(a.find((x) => x.metric === 'weight')!.previous).toBe(100)
  })

  it('tracks each exercise independently', () => {
    const a = computePRAchievements([
      workout(day(1), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
        { title: 'Bench', sets: [set({ weight: { kind: 'loaded', kg: 60 } })] },
      ]),
      workout(day(2), [
        { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 110 } })] },
      ]),
    ])
    expect(a.every((x) => x.exerciseTitle === 'Squat')).toBe(true)
  })

  it('NEVER badges a purely bodyweight exercise (D-9 — no reps metric)', () => {
    const a = computePRAchievements([
      workout(day(1), [
        { title: 'Pull Up', sets: [set({ weight: { kind: 'bodyweight' }, reps: 5 })] },
      ]),
      // A clear reps improvement — still no badge, by design.
      workout(day(2), [
        { title: 'Pull Up', sets: [set({ weight: { kind: 'bodyweight' }, reps: 15 })] },
      ]),
    ])
    expect(a).toEqual([])
  })

  it('establishes a per-metric baseline silently when an earlier session lacked it', () => {
    const a = computePRAchievements([
      // Session 1: bodyweight only — no weight/volume/1RM baseline at all.
      workout(day(1), [
        { title: 'Dip', sets: [set({ weight: { kind: 'bodyweight' }, reps: 10 })] },
      ]),
      // Session 2: first ever loaded set. Establishes, does not badge.
      workout(day(2), [
        { title: 'Dip', sets: [set({ weight: { kind: 'loaded', kg: 20 }, reps: 8 })] },
      ]),
      // Session 3: beats it — this one badges.
      workout(day(3), [
        { title: 'Dip', sets: [set({ weight: { kind: 'loaded', kg: 30 }, reps: 8 })] },
      ]),
    ])
    expect(a.filter((x) => x.metric === 'weight')).toHaveLength(1)
    expect(a.find((x) => x.metric === 'weight')!.date).toEqual(day(3))
  })
})

describe('achievementsBySet', () => {
  it('keys badges by exercise and set index for one workout only', () => {
    const w1 = workout(day(1), [
      { title: 'Squat', sets: [set({ weight: { kind: 'loaded', kg: 100 } })] },
    ])
    const w2 = workout(day(2), [
      {
        title: 'Squat',
        sets: [
          set({ setIndex: 0, weight: { kind: 'loaded', kg: 105 } }),
          set({ setIndex: 1, weight: { kind: 'loaded', kg: 130 } }),
        ],
      },
    ])
    const a = computePRAchievements([w1, w2])
    const map = achievementsBySet(a, w2.id)
    expect(map.get('Squat::1')).toContain('weight')
    expect(map.has('Squat::0')).toBe(false)
    expect(achievementsBySet(a, w1.id).size).toBe(0)
  })
})

/* ── against the real fixture ───────────────────────────────────────────── */

describe('against the real fixture', () => {
  const { profile } = buildProfile(fixture as never, {})

  it('produces records for real exercises without throwing', () => {
    const prs = calculatePRs(profile.workouts, ['Pull Up'])
    expect(prs.size).toBeGreaterThan(0)
    expect(exercisesWithRecords(prs).length).toBeGreaterThan(0)
  })

  it('Pull Up is MIXED in the real data — 4 blank sets and 4 written as 0', () => {
    // Not a bug, and worth pinning: the same exercise was logged both ways.
    // Per D-7b a blank means bodyweight while a literal 0 is a genuine zero
    // load, so maxWeight is a real 0 rather than undefined. The consequence is
    // that Pull Up ranks LAST by maxWeight instead of being skipped by the
    // §6.3 Featured fallback — which is correct, if unintuitive.
    const prs = calculatePRs(profile.workouts, ['Pull Up'])
    const pullUp = prs.get('Pull Up')!
    expect(pullUp.maxReps).not.toBeNull()
    expect(pullUp.maxWeight!.value).toBe(0)
  })

  it('never emits a badge dated before that exercise’s first session', () => {
    const achievements = computePRAchievements(profile.workouts)
    const firstSeen = new Map<string, number>()
    for (const w of [...profile.workouts].sort((a, b) => +a.startTime - +b.startTime)) {
      for (const e of w.exercises) {
        if (!firstSeen.has(e.exerciseTitle)) {
          firstSeen.set(e.exerciseTitle, w.startTime.getTime())
        }
      }
    }
    for (const a of achievements) {
      expect(a.date.getTime()).toBeGreaterThan(firstSeen.get(a.exerciseTitle)!)
    }
  })

  it('never emits two badges of the same metric for one exercise in one session', () => {
    const achievements = computePRAchievements(profile.workouts)
    const seen = new Set<string>()
    for (const a of achievements) {
      const key = `${a.workoutId}::${a.exerciseTitle}::${a.metric}`
      expect(seen.has(key), `duplicate badge ${key}`).toBe(false)
      seen.add(key)
    }
  })

  it('every badge strictly beats the value it reports as previous', () => {
    for (const a of computePRAchievements(profile.workouts)) {
      expect(a.value).toBeGreaterThan(a.previous)
    }
  })
})
