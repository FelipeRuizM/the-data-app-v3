import { describe, expect, it } from 'vitest'
import { CALCULATOR_DEFAULTS, normalizeSettings } from '../lib/normalize'
import { buildRamp, incrementFor, roundToIncrement, validateRamp } from './calculator'

describe('roundToIncrement', () => {
  it('rounds to the nearest 2.5', () => {
    expect(roundToIncrement(61, 2.5)).toBe(60)
    expect(roundToIncrement(64, 2.5)).toBe(65)
    expect(roundToIncrement(62.4, 2.5)).toBe(62.5)
  })

  it('rounds a tie UP, keeping a ramp monotonic', () => {
    // Exactly halfway: the heavier is the safer prescription and stops the
    // progression dipping backwards.
    expect(roundToIncrement(61.25, 2.5)).toBe(62.5)
  })

  it('rounds to the nearest 5 for pounds', () => {
    expect(roundToIncrement(137, 5)).toBe(135)
    expect(roundToIncrement(138, 5)).toBe(140)
  })

  it('handles a 1 kg increment for machines that step that way', () => {
    expect(roundToIncrement(61.4, 1)).toBe(61)
    expect(roundToIncrement(61.6, 1)).toBe(62)
  })

  it('does not leak floating-point drift into the result', () => {
    // Naive arithmetic here yields 61.250000000000004.
    expect(roundToIncrement(61.3, 2.5)).toBe(62.5)
    expect(String(roundToIncrement(0.1 + 0.2, 0.05))).not.toMatch(/0000/)
  })

  it('returns the value unchanged for a nonsense increment', () => {
    expect(roundToIncrement(100, 0)).toBe(100)
    expect(roundToIncrement(100, -5)).toBe(100)
  })
})

describe('incrementFor', () => {
  it('uses 2.5 in kg and 5 in lb by default (D-12)', () => {
    expect(incrementFor(CALCULATOR_DEFAULTS, 'kg')).toBe(2.5)
    expect(incrementFor(CALCULATOR_DEFAULTS, 'lb')).toBe(5)
  })

  it('honours a per-account override', () => {
    const custom = { ...CALCULATOR_DEFAULTS, roundingKg: 1 }
    expect(incrementFor(custom, 'kg')).toBe(1)
  })
})

describe('buildRamp', () => {
  it('returns nothing for a non-positive target rather than a table of zeroes', () => {
    expect(buildRamp(0, CALCULATOR_DEFAULTS, 'kg')).toEqual([])
    expect(buildRamp(-10, CALCULATOR_DEFAULTS, 'kg')).toEqual([])
    expect(buildRamp(Number.NaN, CALCULATOR_DEFAULTS, 'kg')).toEqual([])
  })

  it('produces warm-ups, feeders and the working set in order', () => {
    const ramp = buildRamp(100, CALCULATOR_DEFAULTS, 'kg')
    expect(ramp.map((s) => s.kind)).toEqual([
      'warmup',
      'warmup',
      'feeder',
      'feeder',
      'feeder',
      'working',
    ])
  })

  it('applies the percentages to the target', () => {
    const ramp = buildRamp(100, CALCULATOR_DEFAULTS, 'kg')
    expect(ramp[0]!.weight).toBe(20) // 20%
    expect(ramp[1]!.weight).toBe(30) // 30%
    expect(ramp[2]!.weight).toBe(45) // 45%
  })

  it('rounds every prescribed weight to a loadable increment', () => {
    const ramp = buildRamp(87.5, CALCULATOR_DEFAULTS, 'kg')
    for (const s of ramp) {
      if (s.kind === 'working') continue
      expect(s.weight % 2.5, `${s.label} is not loadable`).toBe(0)
    }
  })

  it('NEVER rounds a ramp set down to zero', () => {
    // 20% of 5 kg is 1 kg, below one 2.5 kg step. An unloadable bar is still a
    // real prescription; zero is not.
    const ramp = buildRamp(5, CALCULATOR_DEFAULTS, 'kg')
    for (const s of ramp) expect(s.weight).toBeGreaterThan(0)
    expect(ramp[0]!.weight).toBe(2.5)
  })

  it('leaves the working weight exactly as typed, never rounded away', () => {
    // The lifter means 101 kg; the app must not silently make it 100.
    const ramp = buildRamp(101, CALCULATOR_DEFAULTS, 'kg')
    expect(ramp.at(-1)!.weight).toBe(101)
    expect(ramp.at(-1)!.percent).toBe(100)
  })

  it('uses the 5 lb increment in pound mode', () => {
    const ramp = buildRamp(225, CALCULATOR_DEFAULTS, 'lb')
    for (const s of ramp) {
      if (s.kind === 'working') continue
      expect(s.weight % 5, `${s.label} is not loadable in lb`).toBe(0)
    }
  })

  it('carries the reps prescribed for each step', () => {
    const ramp = buildRamp(100, CALCULATOR_DEFAULTS, 'kg')
    expect(ramp[0]!.reps).toBe(12)
    expect(ramp[2]!.reps).toBe(5)
  })

  it('keeps feeder weights non-decreasing so the ramp climbs', () => {
    const ramp = buildRamp(140, CALCULATOR_DEFAULTS, 'kg').filter(
      (s) => s.kind !== 'working',
    )
    for (let i = 1; i < ramp.length; i++) {
      expect(ramp[i]!.weight).toBeGreaterThanOrEqual(ramp[i - 1]!.weight)
    }
  })

  it('honours edited percentages rather than hardcoded ones (§8)', () => {
    const custom = {
      ...CALCULATOR_DEFAULTS,
      warmup: [{ percent: 50, reps: 10 }],
      feeders: [{ percent: 90, reps: 1 }],
    }
    const ramp = buildRamp(100, custom, 'kg')
    expect(ramp.map((s) => s.weight)).toEqual([50, 90, 100])
  })
})

describe('validateRamp', () => {
  it('accepts a sane ramp', () => {
    expect(validateRamp([{ percent: 50, reps: 5 }])).toEqual([])
  })
  it('rejects an empty ramp', () => {
    expect(validateRamp([]).length).toBeGreaterThan(0)
  })
  it('rejects a percent outside 1–100', () => {
    expect(validateRamp([{ percent: 0, reps: 5 }]).length).toBeGreaterThan(0)
    expect(validateRamp([{ percent: 150, reps: 5 }]).length).toBeGreaterThan(0)
  })
  it('rejects non-positive reps', () => {
    expect(validateRamp([{ percent: 50, reps: 0 }]).length).toBeGreaterThan(0)
  })
})

describe('calculator settings normalization', () => {
  it('falls back to the §8 defaults when nothing is stored', () => {
    const s = normalizeSettings(undefined)
    expect(s.calculator.roundingKg).toBe(2.5)
    expect(s.calculator.roundingLb).toBe(5)
    expect(s.calculator.warmup.length).toBeGreaterThan(0)
    expect(s.calculator.feeders.length).toBeGreaterThan(0)
  })

  it('reads stored percentages', () => {
    const s = normalizeSettings({
      calculator: { warmup: [{ percent: 25, reps: 10 }], roundingKg: 1 },
    })
    expect(s.calculator.warmup).toEqual([{ percent: 25, reps: 10 }])
    expect(s.calculator.roundingKg).toBe(1)
    // Feeders weren't stored, so they fall back independently.
    expect(s.calculator.feeders).toEqual(CALCULATOR_DEFAULTS.feeders)
  })

  it('falls back rather than trusting a nonsense stored ramp', () => {
    const s = normalizeSettings({
      calculator: { warmup: [{ percent: 0, reps: 0 }], roundingKg: -5 },
    })
    expect(s.calculator.warmup).toEqual(CALCULATOR_DEFAULTS.warmup)
    expect(s.calculator.roundingKg).toBe(2.5)
  })

  it('defaults stay within the §8 ranges', () => {
    // warm-up 20–30% for 6–12 reps
    for (const w of CALCULATOR_DEFAULTS.warmup) {
      expect(w.percent).toBeGreaterThanOrEqual(20)
      expect(w.percent).toBeLessThanOrEqual(30)
      expect(w.reps).toBeGreaterThanOrEqual(6)
      expect(w.reps).toBeLessThanOrEqual(12)
    }
    // first feeder 40–50% for 4–6 reps
    const [first, ...rest] = CALCULATOR_DEFAULTS.feeders
    expect(first!.percent).toBeGreaterThanOrEqual(40)
    expect(first!.percent).toBeLessThanOrEqual(50)
    expect(first!.reps).toBeGreaterThanOrEqual(4)
    expect(first!.reps).toBeLessThanOrEqual(6)
    // later feeders 50–75%, reps dropping as weight rises
    let prevReps = first!.reps
    for (const f of rest) {
      expect(f.percent).toBeGreaterThanOrEqual(50)
      expect(f.percent).toBeLessThanOrEqual(75)
      expect(f.reps).toBeLessThanOrEqual(prevReps)
      prevReps = f.reps
    }
  })
})
