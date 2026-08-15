import { describe, expect, it } from 'vitest'
import {
  DB_DATE_FORMAT,
  durationMinutes,
  formatDbDate,
  formatDuration,
  formatPace,
  parseDbDate,
} from './dates'
import fixture from '../test/fixture.json'

/** Every timestamp in the committed fixture. */
function fixtureTimestamps(): string[] {
  const out: string[] = []
  for (const w of Object.values(fixture.workouts)) {
    out.push(w.start_time, w.end_time)
  }
  for (const r of Object.values(fixture.runs)) {
    out.push(r.start_time)
  }
  return out
}

describe('parseDbDate / formatDbDate round-trip', () => {
  it('round-trips every timestamp in the fixture losslessly', () => {
    const stamps = fixtureTimestamps()
    expect(stamps.length).toBeGreaterThan(30)
    for (const s of stamps) {
      const d = parseDbDate(s)
      expect(d, `failed to parse ${s}`).not.toBeNull()
      expect(formatDbDate(d as Date), `round-trip drift on ${s}`).toBe(s)
    }
  })

  it('parses the documented format exactly', () => {
    const d = parseDbDate('8 Apr 2026, 16:50')
    expect(d).not.toBeNull()
    const date = d as Date
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(3) // April, zero-indexed
    expect(date.getDate()).toBe(8)
    expect(date.getHours()).toBe(16)
    expect(date.getMinutes()).toBe(50)
    // Wall-clock, not UTC: the hour read back must be the hour stored.
    expect(date.getSeconds()).toBe(0)
  })

  it('keeps single-digit days unpadded on the way out', () => {
    // "08 Apr" would be a silent corruption of the sacred format.
    expect(formatDbDate(new Date(2026, 3, 8, 16, 50))).toBe('8 Apr 2026, 16:50')
  })

  it('pads hours and minutes but never the day', () => {
    expect(formatDbDate(new Date(2026, 0, 5, 9, 7))).toBe('5 Jan 2026, 09:07')
  })

  it('rejects a zero-padded day rather than silently accepting it', () => {
    // date-fns would parse this happily; it must not round-trip, so we refuse it.
    expect(parseDbDate('08 Apr 2026, 16:50')).toBeNull()
  })

  it('rejects timestamps carrying seconds', () => {
    expect(parseDbDate('8 Apr 2026, 16:50:30')).toBeNull()
  })

  it('rejects ISO strings outright', () => {
    // The single most likely way a wrong format enters the database.
    expect(parseDbDate('2026-04-08T16:50:00.000Z')).toBeNull()
    expect(parseDbDate('2026-04-08 16:50')).toBeNull()
  })

  it('rejects a non-English month', () => {
    expect(parseDbDate('8 Abr 2026, 16:50')).toBeNull()
  })

  it('returns null for empty, whitespace, null and undefined', () => {
    expect(parseDbDate('')).toBeNull()
    expect(parseDbDate('   ')).toBeNull()
    expect(parseDbDate(null)).toBeNull()
    expect(parseDbDate(undefined)).toBeNull()
  })

  it('returns null for an impossible date instead of rolling it over', () => {
    expect(parseDbDate('31 Feb 2026, 10:00')).toBeNull()
  })

  it('exposes the format string it uses', () => {
    expect(DB_DATE_FORMAT).toBe('d MMM yyyy, HH:mm')
  })
})

/**
 * The full 174-timestamp check against the real export. Local only — RTDB.json
 * is gitignored (D-13), so this cannot run in CI and must not fail there.
 */
// Vite's glob, not node:fs — reading it with fs would require Node types in the
// app tsconfig, which would leak `process` into browser code. An absent file
// yields an empty object, so this simply doesn't run in CI.
const exportModules = import.meta.glob<{ default: Record<string, unknown> }>(
  '/RTDB.json',
  { eager: true },
)
const realExport = exportModules['/RTDB.json']?.default
const hasExport = realExport !== undefined

describe.skipIf(!hasExport)('the real export (local only)', () => {
  it('round-trips every start_time and end_time in RTDB.json', () => {
    const raw = realExport as Record<string, unknown>
    const users = raw['users'] as Record<string, Record<string, unknown>> | undefined
    const root = users ? Object.values(users)[0]! : (raw as Record<string, unknown>)

    const workouts = Object.values(
      (root['workouts'] ?? {}) as Record<
        string,
        { start_time: string; end_time: string }
      >,
    )
    const runs = Object.values(
      (root['runs'] ?? {}) as Record<string, { start_time: string }>,
    )

    const stamps = [
      ...workouts.flatMap((w) => [w.start_time, w.end_time]),
      ...runs.map((r) => r.start_time),
    ]

    expect(stamps).toHaveLength(174)
    for (const s of stamps) {
      const d = parseDbDate(s)
      expect(d, `failed to parse ${s}`).not.toBeNull()
      expect(formatDbDate(d as Date), `round-trip drift on ${s}`).toBe(s)
    }
  })
})

describe('durationMinutes', () => {
  const at = (h: number, m = 0) => new Date(2026, 3, 8, h, m)

  it('measures a normal session', () => {
    expect(durationMinutes(at(16, 50), at(18, 2))).toBe(72)
  })

  it('returns null when end equals start', () => {
    expect(durationMinutes(at(16), at(16))).toBeNull()
  })

  it('returns null for a negative duration rather than showing one', () => {
    expect(durationMinutes(at(18), at(16))).toBeNull()
  })

  it('returns null beyond the 8h plausibility ceiling', () => {
    expect(durationMinutes(at(6), at(15))).toBeNull()
  })

  it('accepts exactly 8h', () => {
    expect(durationMinutes(at(6), at(14))).toBe(480)
  })

  it('returns null when either side is missing', () => {
    expect(durationMinutes(null, at(16))).toBeNull()
    expect(durationMinutes(at(16), null)).toBeNull()
    expect(durationMinutes(null, null)).toBeNull()
  })

  it('is sane for every workout in the fixture', () => {
    for (const w of Object.values(fixture.workouts)) {
      const d = durationMinutes(parseDbDate(w.start_time), parseDbDate(w.end_time))
      expect(d, `implausible duration on ${w.start_time}`).not.toBeNull()
    }
  })
})

describe('formatDuration', () => {
  it('renders an em dash for null so callers never branch', () => {
    expect(formatDuration(null)).toBe('—')
  })
  it('uses minutes below an hour', () => {
    expect(formatDuration(47)).toBe('47m')
  })
  it('uses h:mm at and above an hour, zero-padding the minutes', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(72)).toBe('1:12')
    expect(formatDuration(125)).toBe('2:05')
  })
})

describe('formatPace', () => {
  it('renders min:sec per km', () => {
    expect(formatPace(437)).toBe('7:17')
    expect(formatPace(402)).toBe('6:42')
  })
  it('zero-pads the seconds', () => {
    expect(formatPace(365)).toBe('6:05')
  })
  it('renders an em dash for null, zero and nonsense', () => {
    expect(formatPace(null)).toBe('—')
    expect(formatPace(0)).toBe('—')
    expect(formatPace(-10)).toBe('—')
    expect(formatPace(Number.NaN)).toBe('—')
    expect(formatPace(Number.POSITIVE_INFINITY)).toBe('—')
  })
})
