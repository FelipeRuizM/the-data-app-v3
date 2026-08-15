import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { normalizeRun, normalizeSettings, parseStoredPace } from './normalize'
import {
  buildRawRun,
  draftFromRun,
  emptyRunDraft,
  formatDurationInput,
  formatPaceForStorage,
  parseDurationInput,
  type RunDraft,
} from './runDraft'
import type { RawRun } from '../types'

const fixtureRuns = fixture.runs as unknown as Record<string, RawRun>
const settings = normalizeSettings(undefined)

function validDraft(over: Partial<RunDraft> = {}): RunDraft {
  return {
    ...emptyRunDraft(settings),
    title: 'Morning run',
    startLocal: '2026-04-08T07:00',
    distanceKm: '5',
    duration: '30:00',
    ...over,
  }
}

describe('parseDurationInput', () => {
  it('parses mm:ss the way a watch shows it', () => {
    expect(parseDurationInput('24:35')).toBe(24 * 60 + 35)
  })

  it('parses h:mm:ss', () => {
    expect(parseDurationInput('1:02:15')).toBe(3600 + 2 * 60 + 15)
  })

  it('accepts a bare number of seconds', () => {
    expect(parseDurationInput('1065')).toBe(1065)
  })

  it('rejects a seconds component above 59 rather than silently rolling it over', () => {
    // "24:75" is a typo, not 25:15 — misparsing it would corrupt the derived pace.
    expect(parseDurationInput('24:75')).toBeNull()
  })

  it('allows the leading component to exceed 59', () => {
    expect(parseDurationInput('90:00')).toBe(5400)
  })

  it('rejects nonsense', () => {
    expect(parseDurationInput('')).toBeNull()
    expect(parseDurationInput('abc')).toBeNull()
    expect(parseDurationInput('1:2:3:4')).toBeNull()
    expect(parseDurationInput('-5')).toBeNull()
    expect(parseDurationInput('0')).toBeNull()
  })
})

describe('formatDurationInput', () => {
  it('renders mm:ss below an hour', () => {
    expect(formatDurationInput(1475)).toBe('24:35')
  })
  it('renders h:mm:ss at and above an hour', () => {
    expect(formatDurationInput(3735)).toBe('1:02:15')
  })
  it('round-trips with parseDurationInput', () => {
    for (const s of [61, 1065, 1475, 3735, 5400]) {
      expect(parseDurationInput(formatDurationInput(s))).toBe(s)
    }
  })
})

describe('formatPaceForStorage', () => {
  it('renders seconds-per-km as m:ss', () => {
    expect(formatPaceForStorage(437)).toBe('7:17')
    expect(formatPaceForStorage(365)).toBe('6:05')
  })
})

describe('buildRawRun — validation', () => {
  it('rejects an empty draft naming the fields actually wrong', () => {
    const result = buildRawRun(emptyRunDraft(settings))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    const fields = result.errors.map((e) => e.field)
    expect(fields).toContain('title')
    expect(fields).toContain('distanceKm')
    expect(fields).toContain('duration')
  })

  it('requires a positive distance', () => {
    expect(buildRawRun(validDraft({ distanceKm: '0' })).ok).toBe(false)
  })

  it('rejects an unparseable duration', () => {
    expect(buildRawRun(validDraft({ duration: '24:75' })).ok).toBe(false)
  })

  it('rejects a difficulty outside 1–10', () => {
    expect(buildRawRun(validDraft({ difficulty: '0' })).ok).toBe(false)
    expect(buildRawRun(validDraft({ difficulty: '11' })).ok).toBe(false)
    expect(buildRawRun(validDraft({ difficulty: '7' })).ok).toBe(true)
  })

  it('accepts a minimal valid draft', () => {
    expect(buildRawRun(validDraft()).ok).toBe(true)
  })
})

describe('buildRawRun — pace is derived, never transcribed (§3.2)', () => {
  it('computes pace from distance and duration', () => {
    const result = buildRawRun(validDraft({ distanceKm: '5', duration: '30:00' }))
    if (!result.ok) throw new Error('expected success')
    // 1800s / 5km = 360 s/km = 6:00
    expect(result.raw.pace).toBe('6:00')
  })

  it('stored pace always agrees with its own numbers', () => {
    // The bug this prevents: one historical run stores "8:00" against a derived
    // 7:30. A written record must never disagree with itself.
    for (const [d, dist] of [
      ['24:35', '4.04'],
      ['17:45', '2.43'],
      ['1:02:15', '9.8'],
    ] as const) {
      const result = buildRawRun(validDraft({ duration: d, distanceKm: dist }))
      if (!result.ok) throw new Error('expected success')
      const stored = parseStoredPace(result.raw.pace ?? null)
      const derived = result.raw.duration_seconds! / result.raw.distance_km!
      expect(Math.abs(stored! - derived)).toBeLessThanOrEqual(1)
    }
  })
})

describe('buildRawRun — omission rules', () => {
  it('always writes the schema-required fields', () => {
    const result = buildRawRun(validDraft({ type: '', place: '', description: '' }))
    if (!result.ok) throw new Error('expected success')
    for (const k of [
      'title',
      'description',
      'start_time',
      'type',
      'location',
      'distance_km',
      'duration_seconds',
      'pace',
    ]) {
      expect(k in result.raw, `${k} must always be written`).toBe(true)
    }
  })

  it('omits avg_heart_rate when blank', () => {
    const result = buildRawRun(validDraft({ avgHeartRate: '' }))
    if (!result.ok) throw new Error('expected success')
    expect('avg_heart_rate' in result.raw).toBe(false)
  })

  it('omits avg_heart_rate for a typed 0 — that is the "not recorded" sentinel', () => {
    const result = buildRawRun(validDraft({ avgHeartRate: '0' }))
    if (!result.ok) throw new Error('expected success')
    expect('avg_heart_rate' in result.raw).toBe(false)
  })

  it('omits calories for a typed 0 as well', () => {
    const result = buildRawRun(validDraft({ calories: '0' }))
    if (!result.ok) throw new Error('expected success')
    expect('calories' in result.raw).toBe(false)
  })

  it('WRITES a typed 0 for steps and max elevation — those are real values', () => {
    // 11 of the 12 historical runs record 0 steps and 0 max elevation, so 0 is
    // habitual there, not a sentinel. Omitting it would lose information.
    const result = buildRawRun(validDraft({ steps: '0', maxElevationM: '0' }))
    if (!result.ok) throw new Error('expected success')
    expect(result.raw.steps).toBe(0)
    expect(result.raw.max_elevation_m).toBe(0)
  })

  it('omits steps and elevation when left blank rather than inventing a 0', () => {
    const result = buildRawRun(
      validDraft({ steps: '', maxElevationM: '', elevationGainM: '' }),
    )
    if (!result.ok) throw new Error('expected success')
    expect('steps' in result.raw).toBe(false)
    expect('max_elevation_m' in result.raw).toBe(false)
    expect('elevation_gain_m' in result.raw).toBe(false)
  })

  it('omits people when none are selected', () => {
    const result = buildRawRun(validDraft({ people: [] }))
    if (!result.ok) throw new Error('expected success')
    expect('people' in result.raw).toBe(false)
  })

  it('writes shoes and watch from the account defaults (D-16)', () => {
    const result = buildRawRun(validDraft())
    if (!result.ok) throw new Error('expected success')
    expect(result.raw.shoes).toBe('Adidas Ultraboost 21')
    expect(result.raw.watch).toBe('Apple Watch Series 8')
  })

  it('omits shoes and watch when explicitly cleared', () => {
    const result = buildRawRun(validDraft({ shoes: '', watch: '' }))
    if (!result.ok) throw new Error('expected success')
    expect('shoes' in result.raw).toBe(false)
    expect('watch' in result.raw).toBe(false)
  })
})

describe('draftFromRun / buildRawRun — round-trip through the real fixture', () => {
  it('round-trips every fixture run', () => {
    for (const [id, raw] of Object.entries(fixtureRuns)) {
      const original = normalizeRun(id, raw)
      expect(original, `run ${id} failed to normalize`).not.toBeNull()

      const rebuilt = buildRawRun(draftFromRun(original!, settings))
      expect(rebuilt.ok, `round-trip failed validation for ${id}`).toBe(true)
      if (!rebuilt.ok) continue

      const re = normalizeRun(id, rebuilt.raw)!
      expect(re.title).toBe(original!.title)
      expect(re.description).toBe(original!.description)
      expect(re.startTime.getTime()).toBe(original!.startTime.getTime())
      expect(re.type).toBe(original!.type)
      expect(re.place).toBe(original!.place)
      expect(re.distanceKm).toBe(original!.distanceKm)
      expect(re.durationSeconds).toBe(original!.durationSeconds)
      expect(re.avgHeartRate).toBe(original!.avgHeartRate)
      expect(re.calories).toBe(original!.calories)
      expect(re.difficulty).toBe(original!.difficulty)
      expect(re.elevationGainM).toBe(original!.elevationGainM)
      expect(re.maxElevationM).toBe(original!.maxElevationM)
      expect(re.steps).toBe(original!.steps)
      expect(re.people).toEqual(original!.people)
    }
  })

  it('HEALS the one run whose stored pace disagreed with its own numbers', () => {
    const entry = Object.entries(fixtureRuns).find(([, r]) => {
      if (!r.pace || !r.duration_seconds || !r.distance_km) return false
      const stored = parseStoredPace(r.pace)!
      return Math.abs(stored - r.duration_seconds / r.distance_km) > 3
    })!
    const original = normalizeRun(entry[0], entry[1])!
    // Before: stored and derived disagree.
    expect(
      Math.abs(parseStoredPace(original.storedPace)! - original.paceSecPerKm!),
    ).toBeGreaterThan(3)

    const rebuilt = buildRawRun(draftFromRun(original, settings))
    if (!rebuilt.ok) throw new Error('expected success')
    const re = normalizeRun(entry[0], rebuilt.raw)!
    // After: re-saving recomputes pace, so the record now agrees with itself.
    expect(
      Math.abs(parseStoredPace(re.storedPace)! - re.paceSecPerKm!),
    ).toBeLessThanOrEqual(1)
  })

  it('backfills shoes and watch on historical runs that predate those fields', () => {
    const [id, raw] = Object.entries(fixtureRuns)[0]!
    const original = normalizeRun(id, raw)!
    expect(original.shoes).toBeNull()

    const rebuilt = buildRawRun(draftFromRun(original, settings))
    if (!rebuilt.ok) throw new Error('expected success')
    expect(rebuilt.raw.shoes).toBe('Adidas Ultraboost 21')
  })
})
