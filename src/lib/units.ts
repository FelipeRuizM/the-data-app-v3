import type { Units, WeightState } from '../types'

/**
 * Weight units are a DISPLAY-LAYER conversion only.
 *
 * Storage is always `weight_kg`. **Never write lb to the database** (§4, D-18).
 * Every kilogram→display conversion in the app goes through this one helper, so
 * there is exactly one place where a rounding or factor mistake could live.
 */

const LB_PER_KG = 2.2046226218

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG
}

/** Convert a stored kilogram value into the viewer's chosen unit. */
export function toDisplayWeight(kg: number, units: Units): number {
  return units === 'lb' ? kgToLb(kg) : kg
}

/**
 * Format a stored kilogram value for display, with its unit.
 * Returns an em dash for null so callers never branch on it themselves.
 */
export function formatWeight(
  kg: number | null,
  units: Units,
  opts: { decimals?: number; withUnit?: boolean } = {},
): string {
  if (kg === null || !Number.isFinite(kg)) return '—'
  const { decimals = 1, withUnit = true } = opts
  const value = toDisplayWeight(kg, units)
  // Trim a trailing .0 — "60 kg" reads better than "60.0 kg".
  const rounded = Number(value.toFixed(decimals))
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals)
  return withUnit ? `${text} ${units}` : text
}

/**
 * Format a large aggregate (session or monthly volume) with thousands
 * separators and no decimals — the editorial stat-figure case.
 */
export function formatVolume(kg: number | null, units: Units): string {
  if (kg === null || !Number.isFinite(kg)) return '—'
  const value = Math.round(toDisplayWeight(kg, units))
  return value.toLocaleString('en-US')
}

export function formatDistance(km: number | null): string {
  if (km === null || !Number.isFinite(km)) return '—'
  return `${km.toFixed(2)} km`
}

/**
 * Render a set's weight, keeping the three states DISTINGUISHABLE (D-7b).
 *
 *   loaded      "60 kg"
 *   zero        "0 kg"   — a genuine unloaded/assisted set, not missing data
 *   bodyweight  "BW"     — the field was absent
 *
 * Showing "0 kg" for a bodyweight pull-up, or "—" for a real 0 kg assisted set,
 * would each erase a distinction the whole records engine depends on.
 */
export function formatSetWeight(weight: WeightState, units: Units): string {
  switch (weight.kind) {
    case 'loaded':
      return formatWeight(weight.kg, units)
    case 'zero':
      return formatWeight(0, units)
    case 'bodyweight':
      return 'BW'
  }
}
