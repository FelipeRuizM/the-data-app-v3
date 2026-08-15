import type { CalculatorSettings, RampSet, Units } from '../types'

/**
 * Warm-up and feeder calculator (CLAUDE.md §8).
 *
 * Everything here works in DISPLAY units. The lifter types the working weight
 * in whatever unit they load plates in, and gets numbers back in the same
 * unit — so there is no kg→lb round-trip to lose precision through, and the
 * rounding increment means what it says (2.5 kg, or 5 lb).
 *
 * ONE total weight per set. No plate breakdown, no per-side math (D-12).
 */

export type PrescribedSet = {
  kind: 'warmup' | 'feeder' | 'working'
  label: string
  percent: number
  /** Already rounded to a loadable increment, in display units. */
  weight: number
  reps: number
}

/**
 * Round to the nearest loadable increment.
 *
 * Ties round UP: at exactly halfway between two loadable weights, the heavier
 * is the safer prescription for a ramp set — it keeps the progression
 * monotonic rather than dipping back.
 */
export function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
    return value
  }
  const steps = Math.floor(value / increment + 0.5)
  const rounded = steps * increment
  // Guard float drift: 0.1 + 0.2 arithmetic on 2.5-kg steps produces
  // 61.250000000000004 without this.
  return Number(rounded.toFixed(6))
}

/** The loadable increment for the viewer's display unit (D-12). */
export function incrementFor(settings: CalculatorSettings, units: Units): number {
  return units === 'lb' ? settings.roundingLb : settings.roundingKg
}

/**
 * Build the ramp for a target working weight.
 *
 * Returns an empty list for a non-positive target rather than a table of
 * zeroes — "no weight" isn't a prescription.
 */
export function buildRamp(
  targetWeight: number,
  settings: CalculatorSettings,
  units: Units,
): PrescribedSet[] {
  if (!Number.isFinite(targetWeight) || targetWeight <= 0) return []

  const increment = incrementFor(settings, units)

  const prescribe = (kind: 'warmup' | 'feeder', ramp: RampSet[]): PrescribedSet[] =>
    ramp.map((r, i) => {
      const raw = (targetWeight * r.percent) / 100
      // A light target can round a low percentage to zero — 20% of 5 kg is
      // 1 kg, which is below one 2.5 kg step. An unloadable bar is still a
      // real prescription, so it floors at one increment rather than 0.
      const weight = Math.max(roundToIncrement(raw, increment), increment)
      return {
        kind,
        label: `${kind === 'warmup' ? 'Warm-up' : 'Feeder'} ${i + 1}`,
        percent: r.percent,
        weight,
        reps: r.reps,
      }
    })

  return [
    ...prescribe('warmup', settings.warmup),
    ...prescribe('feeder', settings.feeders),
    {
      kind: 'working',
      label: 'Working set',
      percent: 100,
      // The working weight is what the lifter typed — never rounded away from
      // the number they actually intend to lift.
      weight: targetWeight,
      reps: 0,
    },
  ]
}

/** Validation for an edited ramp, so Settings can refuse nonsense (§8). */
export function validateRamp(ramp: RampSet[]): string[] {
  const errors: string[] = []
  if (ramp.length === 0) errors.push('Add at least one set.')
  for (const [i, r] of ramp.entries()) {
    if (!Number.isFinite(r.percent) || r.percent <= 0 || r.percent > 100) {
      errors.push(`Set ${i + 1}: percent must be between 1 and 100.`)
    }
    if (!Number.isFinite(r.reps) || r.reps <= 0) {
      errors.push(`Set ${i + 1}: reps must be above zero.`)
    }
  }
  return errors
}
