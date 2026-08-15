import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import type { RawRun, RawWorkout } from '../types'
import {
  derivePaceSecPerKm,
  mergeExerciseCatalog,
  muscleGroupFor,
  normalizeRun,
  normalizeSettings,
  normalizeWorkout,
  parseStoredPace,
  toList,
  volumeKg,
  weightState,
  workoutVolumeKg,
  zeroIsMissing,
} from './normalize'

const workouts = Object.entries(fixture.workouts as Record<string, RawWorkout>)
const runs = Object.entries(fixture.runs as Record<string, RawRun>)

describe('toList — the array-vs-object trap (§3.8)', () => {
  it('passes a real array through', () => {
    expect(toList([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('coerces an object with numeric-string keys', () => {
    expect(toList({ '0': 'a', '1': 'b' })).toEqual(['a', 'b'])
  })

  it('orders numeric-string keys NUMERICALLY, not lexicographically', () => {
    // The whole point. A lexicographic sort puts "10" before "2" and silently
    // reorders a 12-set exercise.
    const obj: Record<string, string> = {}
    for (let i = 0; i < 12; i++) obj[String(i)] = `set${i}`
    expect(toList(obj)).toEqual([
      'set0',
      'set1',
      'set2',
      'set3',
      'set4',
      'set5',
      'set6',
      'set7',
      'set8',
      'set9',
      'set10',
      'set11',
    ])
  })

  it('drops holes rather than yielding undefined entries', () => {
    expect(toList([1, null, 2, undefined] as unknown as number[])).toEqual([1, 2])
  })

  it('returns an empty array for null and undefined', () => {
    expect(toList(null)).toEqual([])
    expect(toList(undefined)).toEqual([])
  })
})

describe('zeroIsMissing — the 0 sentinel (§3.2)', () => {
  it('turns 0 into null so it is never averaged in', () => {
    expect(zeroIsMissing(0)).toBeNull()
  })
  it('keeps real values', () => {
    expect(zeroIsMissing(142)).toBe(142)
  })
  it('treats absent as null', () => {
    expect(zeroIsMissing(undefined)).toBeNull()
    expect(zeroIsMissing(null)).toBeNull()
  })
})

describe('weightState — absent is NOT zero (D-7b)', () => {
  it('reads a positive number as a real load', () => {
    expect(weightState(60)).toEqual({ kind: 'loaded', kg: 60 })
  })

  it('reads exactly 0 as a genuine zero, not as missing', () => {
    // Assisted / unloaded machine work. 27 sets in the real export are this.
    expect(weightState(0)).toEqual({ kind: 'zero' })
  })

  it('reads an ABSENT field as bodyweight, not as zero', () => {
    expect(weightState(undefined)).toEqual({ kind: 'bodyweight' })
    expect(weightState(null)).toEqual({ kind: 'bodyweight' })
  })

  it('does not confuse the two zero-ish states', () => {
    expect(weightState(0)).not.toEqual(weightState(undefined))
  })
})

describe('volumeKg — bodyweight substitution is volume-only (D-7)', () => {
  it('uses the real load when there is one', () => {
    expect(volumeKg({ kind: 'loaded', kg: 60 }, 78)).toBe(60)
  })

  it('counts a genuine zero as zero', () => {
    expect(volumeKg({ kind: 'zero' }, 78)).toBe(0)
  })

  it('substitutes bodyweight for an absent weight', () => {
    expect(volumeKg({ kind: 'bodyweight' }, 78)).toBe(78)
  })

  it('returns null — not zero — when bodyweight is unknown', () => {
    // Excluding is honest; counting zero would silently deflate volume.
    expect(volumeKg({ kind: 'bodyweight' }, null)).toBeNull()
    expect(volumeKg({ kind: 'bodyweight' }, 0)).toBeNull()
  })
})

describe('derivePaceSecPerKm / parseStoredPace (§3.2)', () => {
  it('derives seconds per km', () => {
    expect(derivePaceSecPerKm(2620, 6)).toBeCloseTo(436.67, 1)
  })

  it('refuses to divide by zero distance', () => {
    expect(derivePaceSecPerKm(2620, 0)).toBeNull()
    expect(derivePaceSecPerKm(2620, null)).toBeNull()
    expect(derivePaceSecPerKm(null, 6)).toBeNull()
  })

  it('parses a stored m:ss pace', () => {
    expect(parseStoredPace('7:17')).toBe(437)
    expect(parseStoredPace('8:00')).toBe(480)
  })

  it('rejects malformed stored paces instead of guessing', () => {
    expect(parseStoredPace('7:5')).toBeNull()
    expect(parseStoredPace('7:60')).toBeNull()
    expect(parseStoredPace('abc')).toBeNull()
    expect(parseStoredPace(null)).toBeNull()
  })

  it('finds the one real run whose stored pace disagrees with the derived one', () => {
    // Concrete justification for treating derived as truth.
    const disagreeing = runs.filter(([, r]) => {
      const stored = parseStoredPace(r.pace ?? null)
      const derived = derivePaceSecPerKm(
        r.duration_seconds ?? null,
        r.distance_km ?? null,
      )
      return stored != null && derived != null && Math.abs(stored - derived) > 3
    })
    expect(disagreeing).toHaveLength(1)
  })
})

describe('normalizeWorkout', () => {
  it('normalizes every workout in the fixture without dropping one', () => {
    for (const [id, raw] of workouts) {
      expect(normalizeWorkout(id, raw), `dropped ${id}`).not.toBeNull()
    }
  })

  it('turns a workout avg_heart_rate of 0 into null', () => {
    // The brief said the sentinel was runs-only. It is not.
    const found = workouts.find(([, w]) => w.avg_heart_rate === 0)
    expect(found, 'fixture lost its zero-HR workout').toBeDefined()
    const [id, raw] = found!
    expect(normalizeWorkout(id, raw)?.avgHeartRate).toBeNull()
  })

  it('leaves an uncategorized workout as null, not an error', () => {
    const found = workouts.find(([, w]) => w.category == null)
    expect(found).toBeDefined()
    const [id, raw] = found!
    expect(normalizeWorkout(id, raw)?.category).toBeNull()
  })

  it('gives a workout with no people an empty array, never undefined', () => {
    const found = workouts.find(([, w]) => w.people == null)
    expect(found).toBeDefined()
    const [id, raw] = found!
    expect(normalizeWorkout(id, raw)?.people).toEqual([])
  })

  it('preserves all three weight states through normalization', () => {
    const states = new Set<string>()
    for (const [id, raw] of workouts) {
      for (const e of normalizeWorkout(id, raw)?.exercises ?? []) {
        for (const s of e.sets) states.add(s.weight.kind)
      }
    }
    expect(states).toEqual(new Set(['loaded', 'zero', 'bodyweight']))
  })

  it('orders sets by set_index even when the source is an out-of-order object', () => {
    const raw: RawWorkout = {
      title: 'x',
      start_time: '8 Apr 2026, 16:50',
      end_time: '8 Apr 2026, 17:50',
      exercises: {
        '0': {
          exercise_title: 'Squat (Barbell)',
          sets: { '2': { set_index: 2 }, '0': { set_index: 0 }, '1': { set_index: 1 } },
        },
      },
    }
    const w = normalizeWorkout('w', raw)
    expect(w?.exercises[0]?.sets.map((s) => s.setIndex)).toEqual([0, 1, 2])
  })

  it('drops a record with an unparseable start time rather than inventing one', () => {
    expect(normalizeWorkout('bad', { title: 'x', start_time: 'nonsense' })).toBeNull()
  })

  it('treats an empty-string gym as no place, not as a place named ""', () => {
    const w = normalizeWorkout('w', {
      start_time: '8 Apr 2026, 16:50',
      gym: '',
    })
    expect(w?.place).toBeNull()
  })
})

describe('normalizeRun', () => {
  it('normalizes every run in the fixture', () => {
    for (const [id, raw] of runs) {
      expect(normalizeRun(id, raw), `dropped ${id}`).not.toBeNull()
    }
  })

  it('turns the 0 sentinels into null for heart rate and calories', () => {
    const hr = runs.find(([, r]) => r.avg_heart_rate === 0)
    const cal = runs.find(([, r]) => r.calories === 0)
    expect(hr).toBeDefined()
    expect(cal).toBeDefined()
    expect(normalizeRun(hr![0], hr![1])?.avgHeartRate).toBeNull()
    expect(normalizeRun(cal![0], cal![1])?.calories).toBeNull()
  })

  it('always exposes a derived pace, keeping the stored string separate', () => {
    for (const [id, raw] of runs) {
      const run = normalizeRun(id, raw)!
      expect(run.paceSecPerKm).not.toBeNull()
      expect(run.storedPace).toBe(raw.pace)
    }
  })
})

describe('mergeExerciseCatalog — two tiers, one catalog (D-20)', () => {
  const base = {
    a: { name: 'Pull Up', muscleGroup: 'Back' },
    b: { name: 'Squat (Barbell)', muscleGroup: 'Legs' },
  }

  it('returns the base catalog when the user has added nothing', () => {
    expect(mergeExerciseCatalog(base, undefined).map((e) => e.name)).toEqual([
      'Pull Up',
      'Squat (Barbell)',
    ])
  })

  it('adds the user’s own exercises', () => {
    const own = { z: { name: 'Nordic Curl', muscleGroup: 'Legs' } }
    expect(mergeExerciseCatalog(base, own).map((e) => e.name)).toContain('Nordic Curl')
  })

  it('lets the user’s entry win a name collision', () => {
    // This is what allows re-filing a base exercise without an admin.
    const own = { z: { name: 'Pull Up', muscleGroup: 'Core' } }
    const merged = mergeExerciseCatalog(base, own)
    const pullUp = merged.find((e) => e.name === 'Pull Up')
    expect(pullUp?.muscleGroup).toBe('Core')
    expect(pullUp?.tier).toBe('user')
    expect(merged.filter((e) => e.name === 'Pull Up')).toHaveLength(1)
  })

  it('marks tiers so Settings can tell them apart', () => {
    const own = { z: { name: 'Nordic Curl', muscleGroup: 'Legs' } }
    const merged = mergeExerciseCatalog(base, own)
    expect(merged.find((e) => e.name === 'Squat (Barbell)')?.tier).toBe('base')
    expect(merged.find((e) => e.name === 'Nordic Curl')?.tier).toBe('user')
  })

  it('falls back to Unknown for a missing muscle group', () => {
    expect(
      mergeExerciseCatalog({ a: { name: 'Mystery' } }, undefined)[0]?.muscleGroup,
    ).toBe('Unknown')
  })
})

describe('muscleGroupFor', () => {
  const catalog = mergeExerciseCatalog(fixture.exercises, undefined)

  it('resolves every exercise title used in the fixture', () => {
    const unresolved = new Set<string>()
    for (const [id, raw] of workouts) {
      for (const e of normalizeWorkout(id, raw)?.exercises ?? []) {
        if (muscleGroupFor(catalog, e.exerciseTitle) === 'Unknown') {
          unresolved.add(e.exerciseTitle)
        }
      }
    }
    expect([...unresolved]).toEqual([])
  })

  it('degrades an unknown name to Unknown instead of throwing', () => {
    expect(muscleGroupFor(catalog, 'Not A Real Exercise')).toBe('Unknown')
  })
})

describe('normalizeSettings — code-level defaults (D-17)', () => {
  it('supplies defaults when nothing is stored', () => {
    const s = normalizeSettings(undefined)
    expect(s.units).toBe('kg')
    expect(s.bodyweightKg).toBeNull()
    expect(s.defaultShoes).toBe('Adidas Ultraboost 21')
    expect(s.defaultWatch).toBe('Apple Watch Series 8')
    expect(s.featuredExercises).toEqual([])
  })

  it('reads stored values', () => {
    const s = normalizeSettings({
      units: 'lb',
      bodyweightKg: 78,
      defaultShoes: 'Vaporfly',
    })
    expect(s.units).toBe('lb')
    expect(s.bodyweightKg).toBe(78)
    expect(s.defaultShoes).toBe('Vaporfly')
  })

  it('refuses a nonsense unit rather than trusting it', () => {
    expect(normalizeSettings({ units: 'stone' }).units).toBe('kg')
  })

  it('treats a zero or negative bodyweight as unset', () => {
    expect(normalizeSettings({ bodyweightKg: 0 }).bodyweightKg).toBeNull()
    expect(normalizeSettings({ bodyweightKg: -5 }).bodyweightKg).toBeNull()
  })

  it('reads featuredExercises from the fixture', () => {
    expect(
      normalizeSettings(fixture.settings).featuredExercises.length,
    ).toBeGreaterThan(0)
  })
})

describe('workoutVolumeKg', () => {
  it('counts loaded sets', () => {
    const w = normalizeWorkout('w', {
      start_time: '8 Apr 2026, 16:50',
      exercises: [
        { exercise_title: 'Squat (Barbell)', sets: [{ reps: 5, weight_kg: 100 }] },
      ],
    })!
    expect(workoutVolumeKg(w, 78)).toBe(500)
  })

  it('substitutes bodyweight for absent weight', () => {
    const w = normalizeWorkout('w', {
      start_time: '8 Apr 2026, 16:50',
      exercises: [{ exercise_title: 'Pull Up', sets: [{ reps: 10 }] }],
    })!
    expect(workoutVolumeKg(w, 78)).toBe(780)
  })

  it('excludes bodyweight sets entirely when bodyweight is unset', () => {
    const w = normalizeWorkout('w', {
      start_time: '8 Apr 2026, 16:50',
      exercises: [{ exercise_title: 'Pull Up', sets: [{ reps: 10 }] }],
    })!
    expect(workoutVolumeKg(w, null)).toBe(0)
  })

  it('counts a genuine zero-weight set as zero volume', () => {
    const w = normalizeWorkout('w', {
      start_time: '8 Apr 2026, 16:50',
      exercises: [
        { exercise_title: 'Assisted Dip', sets: [{ reps: 10, weight_kg: 0 }] },
      ],
    })!
    expect(workoutVolumeKg(w, 78)).toBe(0)
  })

  it('skips a set with no reps rather than counting it as zero reps', () => {
    const w = normalizeWorkout('w', {
      start_time: '8 Apr 2026, 16:50',
      exercises: [
        {
          exercise_title: 'Squat (Barbell)',
          sets: [{ weight_kg: 100 }, { reps: 5, weight_kg: 100 }],
        },
      ],
    })!
    expect(workoutVolumeKg(w, 78)).toBe(500)
  })

  it('produces a positive total for every fixture workout that has loaded sets', () => {
    for (const [id, raw] of workouts) {
      const w = normalizeWorkout(id, raw)!
      const hasLoaded = w.exercises.some((e) =>
        e.sets.some((s) => s.weight.kind === 'loaded' && s.reps != null),
      )
      if (hasLoaded)
        expect(workoutVolumeKg(w, 78), `zero volume on ${id}`).toBeGreaterThan(0)
    }
  })
})
