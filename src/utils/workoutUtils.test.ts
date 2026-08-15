import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { buildProfile } from '../lib/db'
import { CALCULATOR_DEFAULTS } from '../lib/normalize'
import {
  computeDelta,
  getMainExercises,
  getMonthlySummary,
  getSessionCalendar,
  getVolumeByMuscleGroup,
  countByMetric,
  getMonthlySeries,
  getRecordsBrokenInMonth,
  monthsWithActivity,
  radarGroups,
  summariseMonth,
} from './workoutUtils'
import type { Profile, Run, SetType, Workout, WorkoutSet } from '../types'

/* ── builders ───────────────────────────────────────────────────────────── */

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

let n = 0
function workout(start: Date, over: Partial<Workout> = {}): Workout {
  return {
    id: `w${++n}`,
    title: 'W',
    description: '',
    startTime: start,
    endTime: null,
    place: null,
    categoryId: null,
    category: null,
    avgHeartRate: null,
    people: [],
    exercises: [
      { exerciseId: null, exerciseTitle: 'Squat', notes: null, sets: [set()] },
    ],
    durationMinutes: 60,
    ...over,
  }
}

function run(start: Date, over: Partial<Run> = {}): Run {
  return {
    id: `r${++n}`,
    title: 'R',
    description: '',
    startTime: start,
    typeId: null,
    type: null,
    place: null,
    distanceKm: 5,
    durationSeconds: 1800,
    paceSecPerKm: 360,
    storedPace: '6:00',
    avgHeartRate: null,
    calories: null,
    difficulty: null,
    elevationGainM: null,
    maxElevationM: null,
    steps: null,
    people: [],
    shoes: null,
    watch: null,
    durationMinutes: 30,
    ...over,
  }
}

function profileOf(
  workouts: Workout[],
  runs: Run[],
  bodyweightKg: number | null = null,
): Profile {
  return {
    workouts,
    runs,
    exercises: [{ id: 'e1', name: 'Squat', muscleGroup: 'Legs', tier: 'base' }],
    places: [],
    people: [],
    settings: {
      featuredExercises: [],
      units: 'kg',
      bodyweightKg,
      defaultShoes: '',
      defaultWatch: '',
      calculator: CALCULATOR_DEFAULTS,
    },
  }
}

const MAR = new Date(2026, 2, 15, 12, 0)
const FEB = new Date(2026, 1, 15, 12, 0)

/* ── summariseMonth ─────────────────────────────────────────────────────── */

describe('summariseMonth', () => {
  it('scopes strictly to the calendar month', () => {
    const p = profileOf([workout(MAR), workout(FEB)], [])
    expect(summariseMonth(p, MAR).workouts.sessions).toBe(1)
  })

  it('splits total duration into lifting and running', () => {
    const p = profileOf(
      [workout(MAR, { durationMinutes: 60 })],
      [run(MAR, { durationMinutes: 30 })],
    )
    const s = summariseMonth(p, MAR)
    expect(s.activities.liftingMinutes).toBe(60)
    expect(s.activities.runningMinutes).toBe(30)
    expect(s.activities.totalMinutes).toBe(90)
    expect(s.activities.count).toBe(2)
    expect(s.activities.avgSessionMinutes).toBe(45)
  })

  it('skips a null duration rather than counting it as zero-length', () => {
    // D-19 nulls an implausible duration; it must not drag the average down.
    const p = profileOf(
      [workout(MAR, { durationMinutes: null }), workout(MAR, { durationMinutes: 60 })],
      [],
    )
    expect(summariseMonth(p, MAR).activities.totalMinutes).toBe(60)
  })

  describe('average heart rate', () => {
    it('averages only sessions that actually logged one', () => {
      const p = profileOf(
        [
          workout(MAR, { avgHeartRate: 140 }),
          workout(MAR, { avgHeartRate: 160 }),
          workout(MAR, { avgHeartRate: null }),
        ],
        [],
      )
      // The unrecorded session must leave the denominator alone.
      expect(summariseMonth(p, MAR).activities.avgHeartRate).toBe(150)
    })

    it('is null when nothing logged one', () => {
      const p = profileOf([workout(MAR, { avgHeartRate: null })], [])
      expect(summariseMonth(p, MAR).activities.avgHeartRate).toBeNull()
    })

    it('combines workouts and runs', () => {
      const p = profileOf(
        [workout(MAR, { avgHeartRate: 140 })],
        [run(MAR, { avgHeartRate: 160 })],
      )
      expect(summariseMonth(p, MAR).activities.avgHeartRate).toBe(150)
    })
  })

  describe('volume', () => {
    it('sums weight × reps across every set', () => {
      const p = profileOf(
        [
          workout(MAR, {
            exercises: [
              {
                exerciseId: null,
                exerciseTitle: 'Squat',
                notes: null,
                sets: [
                  set({ weight: { kind: 'loaded', kg: 100 }, reps: 5 }),
                  set({ reps: 10 }),
                ],
              },
            ],
          }),
        ],
        [],
      )
      // 100×5 + 50×10 = 1000
      expect(summariseMonth(p, MAR).workouts.volumeKg).toBe(1000)
    })

    it('SUBSTITUTES bodyweight so a bodyweight session is not zero (D-7)', () => {
      const p = profileOf(
        [
          workout(MAR, {
            exercises: [
              {
                exerciseId: null,
                exerciseTitle: 'Pull Up',
                notes: null,
                sets: [set({ weight: { kind: 'bodyweight' }, reps: 10 })],
              },
            ],
          }),
        ],
        [],
        78,
      )
      expect(summariseMonth(p, MAR).workouts.volumeKg).toBe(780)
    })

    it('EXCLUDES bodyweight sets when no bodyweight is configured, rather than counting zero', () => {
      const p = profileOf(
        [
          workout(MAR, {
            exercises: [
              {
                exerciseId: null,
                exerciseTitle: 'Pull Up',
                notes: null,
                sets: [set({ weight: { kind: 'bodyweight' }, reps: 10 })],
              },
            ],
          }),
        ],
        [],
        null,
      )
      expect(summariseMonth(p, MAR).workouts.volumeKg).toBe(0)
    })

    it('counts a genuine zero-weight set as zero volume but a real set', () => {
      const p = profileOf(
        [
          workout(MAR, {
            exercises: [
              {
                exerciseId: null,
                exerciseTitle: 'Assisted Dip',
                notes: null,
                sets: [set({ weight: { kind: 'zero' }, reps: 10 })],
              },
            ],
          }),
        ],
        [],
      )
      const s = summariseMonth(p, MAR)
      expect(s.workouts.volumeKg).toBe(0)
      expect(s.workouts.sets).toBe(1)
      expect(s.workouts.reps).toBe(10)
    })

    it('excludes a failure+0-reps set from sets, reps and volume', () => {
      const p = profileOf(
        [
          workout(MAR, {
            exercises: [
              {
                exerciseId: null,
                exerciseTitle: 'Squat',
                notes: null,
                sets: [set(), set({ setType: 'failure', reps: 0 })],
              },
            ],
          }),
        ],
        [],
      )
      expect(summariseMonth(p, MAR).workouts.sets).toBe(1)
    })
  })

  describe('average pace', () => {
    it('is total seconds ÷ total km, NOT a mean of per-run paces (§7)', () => {
      // 1km at 10:00/km and 9km at 5:00/km.
      // Mean of paces = 7:30. Correct derived rate = 3300s / 10km = 5:30.
      const p = profileOf(
        [],
        [
          run(MAR, { distanceKm: 1, durationSeconds: 600, paceSecPerKm: 600 }),
          run(MAR, { distanceKm: 9, durationSeconds: 2700, paceSecPerKm: 300 }),
        ],
      )
      expect(summariseMonth(p, MAR).runs.avgPaceSecPerKm).toBe(330)
    })

    it('is null when no distance was covered', () => {
      const p = profileOf([], [])
      expect(summariseMonth(p, MAR).runs.avgPaceSecPerKm).toBeNull()
    })
  })

  it('treats an unrecorded calorie count as zero contribution, not NaN', () => {
    const p = profileOf([], [run(MAR, { calories: null }), run(MAR, { calories: 300 })])
    expect(summariseMonth(p, MAR).runs.calories).toBe(300)
  })
})

/* ── the hidden-section rule ────────────────────────────────────────────── */

describe('getMonthlySummary — sections hidden, not zeroed (§7)', () => {
  it('hides the Runs section when NEITHER month had a run', () => {
    const p = profileOf([workout(MAR), workout(FEB)], [])
    const r = getMonthlySummary(p, MAR)
    expect(r.showRuns).toBe(false)
    expect(r.showWorkouts).toBe(true)
  })

  it('SHOWS the Runs section when only the previous month had runs', () => {
    // Otherwise a month off from running would silently erase the comparison.
    const p = profileOf([workout(MAR)], [run(FEB)])
    expect(getMonthlySummary(p, MAR).showRuns).toBe(true)
  })

  it('SHOWS the Runs section when only this month had runs', () => {
    const p = profileOf([workout(MAR)], [run(MAR)])
    expect(getMonthlySummary(p, MAR).showRuns).toBe(true)
  })

  it('hides the Workouts section for a pure runner', () => {
    const p = profileOf([], [run(MAR), run(FEB)])
    expect(getMonthlySummary(p, MAR).showWorkouts).toBe(false)
  })

  it('compares against the immediately previous month', () => {
    const p = profileOf([workout(MAR), workout(FEB), workout(FEB)], [])
    const r = getMonthlySummary(p, MAR)
    expect(r.current.workouts.sessions).toBe(1)
    expect(r.previous.workouts.sessions).toBe(2)
  })
})

/* ── deltas ─────────────────────────────────────────────────────────────── */

describe('computeDelta', () => {
  it('reports absolute and percent change', () => {
    const d = computeDelta(120, 100)!
    expect(d.absolute).toBe(20)
    expect(d.percent).toBe(20)
    expect(d.direction).toBe('up')
  })

  it('marks a decrease as down', () => {
    expect(computeDelta(80, 100)!.direction).toBe('down')
  })

  it('marks no change as flat', () => {
    expect(computeDelta(100, 100)!.direction).toBe('flat')
  })

  it('INVERTS direction for metrics where lower is better, like pace', () => {
    // Pace rising is worse; the arrow must read as a decline.
    expect(computeDelta(400, 360, true)!.direction).toBe('down')
    expect(computeDelta(340, 360, true)!.direction).toBe('up')
    // The magnitudes are untouched — only the semantic label flips.
    expect(computeDelta(400, 360, true)!.absolute).toBe(40)
  })

  it('returns a null percent when the previous value was zero', () => {
    const d = computeDelta(50, 0)!
    expect(d.absolute).toBe(50)
    expect(d.percent).toBeNull()
  })

  it('returns null when either side is missing', () => {
    expect(computeDelta(null, 100)).toBeNull()
    expect(computeDelta(100, null)).toBeNull()
  })
})

/* ── layer 2 ────────────────────────────────────────────────────────────── */

describe('getVolumeByMuscleGroup', () => {
  const catalog = [
    { id: '1', name: 'Squat', muscleGroup: 'Legs', tier: 'base' as const },
    { id: '2', name: 'Bench', muscleGroup: 'Chest', tier: 'base' as const },
  ]

  it('aggregates sets, reps and volume per group', () => {
    const w = workout(MAR, {
      exercises: [
        { exerciseId: null, exerciseTitle: 'Squat', notes: null, sets: [set(), set()] },
        { exerciseId: null, exerciseTitle: 'Bench', notes: null, sets: [set()] },
      ],
    })
    const totals = getVolumeByMuscleGroup([w], catalog, null)
    expect(totals.find((t) => t.group === 'Legs')!.sets).toBe(2)
    expect(totals.find((t) => t.group === 'Chest')!.sets).toBe(1)
    expect(totals.find((t) => t.group === 'Legs')!.volumeKg).toBe(1000)
  })

  it('buckets an unresolved exercise under Unknown rather than dropping it', () => {
    const w = workout(MAR, {
      exercises: [
        { exerciseId: null, exerciseTitle: 'Mystery Lift', notes: null, sets: [set()] },
      ],
    })
    expect(getVolumeByMuscleGroup([w], catalog, null)[0]!.group).toBe('Unknown')
  })

  it('sorts by set count descending', () => {
    const w = workout(MAR, {
      exercises: [
        { exerciseId: null, exerciseTitle: 'Bench', notes: null, sets: [set()] },
        {
          exerciseId: null,
          exerciseTitle: 'Squat',
          notes: null,
          sets: [set(), set(), set()],
        },
      ],
    })
    expect(getVolumeByMuscleGroup([w], catalog, null)[0]!.group).toBe('Legs')
  })
})

describe('radarGroups', () => {
  it('EXCLUDES Core, Other and Unknown — they distort the balance shape (§7)', () => {
    const totals = [
      { group: 'Legs', sets: 5, reps: 50, volumeKg: 100 },
      { group: 'Core', sets: 3, reps: 30, volumeKg: 0 },
      { group: 'Other', sets: 2, reps: 20, volumeKg: 0 },
      { group: 'Unknown', sets: 1, reps: 10, volumeKg: 0 },
    ]
    expect(radarGroups(totals).map((t) => t.group)).toEqual(['Legs'])
  })
})

describe('getMainExercises', () => {
  it('ranks by volume and caps the list', () => {
    const w = workout(MAR, {
      exercises: [
        {
          exerciseId: null,
          exerciseTitle: 'Light',
          notes: null,
          sets: [set({ weight: { kind: 'loaded', kg: 10 } })],
        },
        {
          exerciseId: null,
          exerciseTitle: 'Heavy',
          notes: null,
          sets: [set({ weight: { kind: 'loaded', kg: 200 } })],
        },
      ],
    })
    const top = getMainExercises([w], null, 1)
    expect(top).toHaveLength(1)
    expect(top[0]!.exerciseTitle).toBe('Heavy')
  })
})

describe('getSessionCalendar', () => {
  it('builds whole weeks with the 1st offset to its weekday', () => {
    const p = profileOf([workout(MAR)], [])
    const weeks = getSessionCalendar(summariseMonth(p, MAR))
    for (const week of weeks) expect(week).toHaveLength(7)
    const days = weeks.flat().filter((d) => d.dayOfMonth !== null)
    expect(days).toHaveLength(31) // March
    expect(days[0]!.dayOfMonth).toBe(1)
  })

  it('counts workouts and runs on their own days', () => {
    const p = profileOf(
      [workout(new Date(2026, 2, 5, 10, 0))],
      [run(new Date(2026, 2, 5, 18, 0)), run(new Date(2026, 2, 9, 7, 0))],
    )
    const days = getSessionCalendar(summariseMonth(p, MAR)).flat()
    const fifth = days.find((d) => d.dayOfMonth === 5)!
    expect(fifth.workouts).toBe(1)
    expect(fifth.runs).toBe(1)
    expect(days.find((d) => d.dayOfMonth === 9)!.runs).toBe(1)
    expect(days.find((d) => d.dayOfMonth === 12)!.workouts).toBe(0)
  })
})

describe('monthsWithActivity', () => {
  it('lists distinct months newest first', () => {
    const p = profileOf([workout(MAR), workout(FEB), workout(FEB)], [run(MAR)])
    const months = monthsWithActivity(p)
    expect(months).toHaveLength(2)
    expect(months[0]!.getMonth()).toBe(2)
    expect(months[1]!.getMonth()).toBe(1)
  })
})

/* ── against the real fixture ───────────────────────────────────────────── */

describe('against the real fixture', () => {
  const { profile } = buildProfile(fixture as never, {})

  it('summarises every month with activity without throwing', () => {
    for (const month of monthsWithActivity(profile)) {
      const report = getMonthlySummary(profile, month)
      expect(report.current.activities.count).toBeGreaterThan(0)
      expect(Number.isFinite(report.current.workouts.volumeKg)).toBe(true)
    }
  })

  it('never produces NaN in any aggregate', () => {
    for (const month of monthsWithActivity(profile)) {
      const { current } = getMonthlySummary(profile, month)
      for (const v of [
        current.activities.totalMinutes,
        current.workouts.volumeKg,
        current.workouts.reps,
        current.runs.distanceKm,
        current.runs.elevationGainM,
        current.runs.calories,
      ]) {
        expect(Number.isNaN(v)).toBe(false)
      }
    }
  })

  it('total sets across all months equals the profile total', () => {
    const perMonth = monthsWithActivity(profile).reduce(
      (n, m) => n + summariseMonth(profile, m).workouts.sets,
      0,
    )
    let direct = 0
    for (const w of profile.workouts) {
      for (const e of w.exercises) {
        for (const s of e.sets) {
          if (s.setType === 'failure' && s.reps === 0) continue
          direct += 1
        }
      }
    }
    expect(perMonth).toBe(direct)
  })
})

/* ── layer 3: records broken this month ─────────────────────────────────── */

describe('getRecordsBrokenInMonth', () => {
  const squat = (day: number, kg: number, reps = 5) =>
    workout(new Date(2026, 2, day, 12, 0), {
      exercises: [
        {
          exerciseId: null,
          exerciseTitle: 'Squat',
          notes: null,
          sets: [set({ weight: { kind: 'loaded', kg }, reps })],
        },
      ],
    })

  it('excludes the first session — it establishes, it does not break', () => {
    expect(getRecordsBrokenInMonth([squat(1, 100)], MAR)).toEqual([])
  })

  it('COLLAPSES repeat PRs of the same type to the single best instance', () => {
    // Three weight PRs in one month must show once, at the heaviest.
    const records = getRecordsBrokenInMonth(
      [squat(1, 100), squat(5, 110), squat(10, 120), squat(15, 130)],
      MAR,
    )
    const weight = records.filter((r) => r.metric === 'weight')
    expect(weight).toHaveLength(1)
    expect(weight[0]!.value).toBe(130)
  })

  it('reports the baseline the month STARTED from, not the last intermediate value', () => {
    // Collapsing must not make a 100→130 month look like 120→130.
    const records = getRecordsBrokenInMonth(
      [squat(1, 100), squat(5, 120), squat(10, 130)],
      MAR,
    )
    expect(records.find((r) => r.metric === 'weight')!.previous).toBe(100)
  })

  it('keeps different metrics separate', () => {
    const records = getRecordsBrokenInMonth([squat(1, 100), squat(5, 120, 10)], MAR)
    expect(new Set(records.map((r) => r.metric))).toEqual(
      new Set(['weight', 'volume', 'oneRM']),
    )
  })

  it('keeps different exercises separate', () => {
    const bench = (day: number, kg: number) =>
      workout(new Date(2026, 2, day, 12, 0), {
        exercises: [
          {
            exerciseId: null,
            exerciseTitle: 'Bench',
            notes: null,
            sets: [set({ weight: { kind: 'loaded', kg }, reps: 5 })],
          },
        ],
      })
    const records = getRecordsBrokenInMonth(
      [squat(1, 100), squat(5, 120), bench(1, 60), bench(6, 70)],
      MAR,
    )
    expect(new Set(records.map((r) => r.exerciseTitle))).toEqual(
      new Set(['Squat', 'Bench']),
    )
  })

  it('uses FULL history for chronology, then filters to the month', () => {
    // The February baseline must silence March's first session, not the
    // other way round.
    const feb = workout(new Date(2026, 1, 20, 12, 0), {
      exercises: [
        {
          exerciseId: null,
          exerciseTitle: 'Squat',
          notes: null,
          sets: [set({ weight: { kind: 'loaded', kg: 200 }, reps: 5 })],
        },
      ],
    })
    // March never beats February, so March has no records.
    expect(getRecordsBrokenInMonth([feb, squat(5, 100)], MAR)).toEqual([])
  })

  it('returns nothing for a month with no activity', () => {
    expect(getRecordsBrokenInMonth([squat(1, 100), squat(5, 120)], FEB)).toEqual([])
  })
})

describe('countByMetric', () => {
  it('counts per type and omits types with none', () => {
    const records = getRecordsBrokenInMonth(
      [
        workout(new Date(2026, 2, 1, 12, 0), {
          exercises: [
            {
              exerciseId: null,
              exerciseTitle: 'Squat',
              notes: null,
              sets: [set({ weight: { kind: 'loaded', kg: 100 } })],
            },
          ],
        }),
        workout(new Date(2026, 2, 5, 12, 0), {
          exercises: [
            {
              exerciseId: null,
              exerciseTitle: 'Squat',
              notes: null,
              sets: [set({ weight: { kind: 'loaded', kg: 120 } })],
            },
          ],
        }),
      ],
      MAR,
    )
    const counts = countByMetric(records)
    expect(counts.every((c) => c.count > 0)).toBe(true)
    expect(counts.find((c) => c.metric === 'weight')!.count).toBe(1)
  })
})

/* ── trend series ───────────────────────────────────────────────────────── */

describe('getMonthlySeries', () => {
  it('returns nothing for an empty profile', () => {
    expect(getMonthlySeries(profileOf([], []))).toEqual([])
  })

  it('INCLUDES months with no activity so a gap reads as a gap', () => {
    // January and March only — February must still appear, at zero.
    const p = profileOf(
      [workout(new Date(2026, 0, 10, 12, 0)), workout(new Date(2026, 2, 10, 12, 0))],
      [],
    )
    const series = getMonthlySeries(p)
    expect(series).toHaveLength(3)
    expect(series[1]!.month.getMonth()).toBe(1)
    expect(series[1]!.activities).toBe(0)
  })

  it('runs oldest to newest', () => {
    const p = profileOf(
      [workout(new Date(2026, 0, 10, 12, 0)), workout(new Date(2026, 2, 10, 12, 0))],
      [],
    )
    const series = getMonthlySeries(p)
    expect(series[0]!.month.getTime()).toBeLessThan(series[2]!.month.getTime())
  })

  it('carries the metrics the trend chart plots', () => {
    const p = profileOf([workout(MAR)], [run(MAR)])
    const point = getMonthlySeries(p)[0]!
    expect(point.activities).toBe(2)
    expect(point.volumeKg).toBeGreaterThan(0)
    expect(point.distanceKm).toBe(5)
    expect(point.totalMinutes).toBe(90)
  })

  it('spans every month of the real fixture without gaps in the sequence', () => {
    const { profile: real } = buildProfile(fixture as never, {})
    const series = getMonthlySeries(real)
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1]!.month
      const cur = series[i]!.month
      const monthsApart =
        (cur.getFullYear() - prev.getFullYear()) * 12 +
        (cur.getMonth() - prev.getMonth())
      expect(monthsApart).toBe(1)
    }
  })
})
