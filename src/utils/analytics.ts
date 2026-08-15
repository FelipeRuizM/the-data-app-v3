import { addWeeks, endOfWeek, isSameWeek, startOfWeek } from 'date-fns'
import type { ActivityItem } from '../types'

/**
 * Cross-category aggregation for #/analytics (§4).
 *
 * Everything here takes `ActivityItem[]` — the shape the category registry
 * flattens every category into — and nothing here knows that workouts or runs
 * exist. That is the §1 rule doing its job: a Flights entry contributes to
 * streaks, the heatmap, and the place and partner breakdowns the day it is
 * added, without this file changing.
 *
 * Pure and date-only. Wall-clock throughout (§3.6) — never UTC.
 */

/* ── weekly streaks (D-15) ──────────────────────────────────────────────── */

/**
 * Weeks start SUNDAY, passed explicitly every time.
 *
 * `weekStartsOn` defaults to Monday in some locales, and a streak that silently
 * changes meaning by machine is worse than no streak at all.
 */
const WEEK = { weekStartsOn: 0 } as const

export type StreakRun = {
  weeks: number
  /** First day of the first week in the run. */
  from: Date
  /** Last day of the last week in the run. */
  to: Date
}

export type Streaks = {
  /** Consecutive active weeks up to now. See the mid-week rule below. */
  current: number
  longest: StreakRun | null
}

/** The Sunday that starts each distinct week containing an activity, ascending. */
function activeWeeks(items: readonly ActivityItem[]): Date[] {
  const seen = new Map<number, Date>()
  for (const item of items) {
    const week = startOfWeek(item.startTime, WEEK)
    seen.set(week.getTime(), week)
  }
  return [...seen.values()].sort((a, b) => a.getTime() - b.getTime())
}

/** Runs of consecutive active weeks, in order. */
function consecutiveRuns(weeks: readonly Date[]): Date[][] {
  const runs: Date[][] = []
  for (const week of weeks) {
    const current = runs.at(-1)
    const previous = current?.at(-1)
    if (previous && isSameWeek(addWeeks(previous, 1), week, WEEK)) {
      current!.push(week)
    } else {
      runs.push([week])
    }
  }
  return runs
}

/**
 * A streak is **consecutive weeks containing at least one activity of any
 * category** — not consecutive days, so a rest day never breaks it (D-15).
 *
 * The mid-week rule: an empty current week does NOT end the streak, because
 * there is still time left in it. The run counts if it reaches this week or
 * last week; if neither has an activity, the current streak is 0. Reporting a
 * four-week streak as broken at 00:01 on Sunday would be false discouragement.
 */
export function weeklyStreaks(
  items: readonly ActivityItem[],
  now: Date = new Date(),
): Streaks {
  const weeks = activeWeeks(items)
  if (weeks.length === 0) return { current: 0, longest: null }

  const runs = consecutiveRuns(weeks)

  const thisWeek = startOfWeek(now, WEEK)
  const lastWeek = addWeeks(thisWeek, -1)
  const last = runs.at(-1)!
  const lastActive = last.at(-1)!
  const reachesNow =
    isSameWeek(lastActive, thisWeek, WEEK) || isSameWeek(lastActive, lastWeek, WEEK)

  const longestRun = runs.reduce((best, run) => (run.length > best.length ? run : best))

  return {
    current: reachesNow ? last.length : 0,
    longest: {
      weeks: longestRun.length,
      from: longestRun[0]!,
      to: endOfWeek(longestRun.at(-1)!, WEEK),
    },
  }
}

/* ── day × hour heatmap ─────────────────────────────────────────────────── */

export type HeatmapCell = {
  /** 0 = Sunday, matching the week start used everywhere else. */
  day: number
  hour: number
  count: number
}

export type Heatmap = {
  cells: HeatmapCell[]
  max: number
  total: number
}

/**
 * When training actually happens, by weekday and hour of day.
 *
 * Both come off the wall-clock `Date` (§3.6): the stored strings carry no
 * timezone, so `16:50` is 16:50 to every viewer, and a UTC conversion here
 * would move sessions between days for anyone outside the owner's offset.
 *
 * Every one of the 168 cells is returned, including the zeroes — the renderer
 * needs them, because "never trained at 6am" must be drawn as an outline rather
 * than as the palest ramp step (§5).
 */
export function activityHeatmap(items: readonly ActivityItem[]): Heatmap {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = `${item.startTime.getDay()}:${item.startTime.getHours()}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const cells: HeatmapCell[] = []
  let max = 0
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = counts.get(`${day}:${hour}`) ?? 0
      if (count > max) max = count
      cells.push({ day, hour, count })
    }
  }

  return { cells, max, total: items.length }
}

/**
 * The hours actually used, so the heatmap can drop the dead ones.
 *
 * A 24-column grid at 375px gives each column 12px. Nobody trains at 04:00, and
 * showing eight empty pre-dawn columns costs the legible hours their width.
 * Returns an inclusive [first, last] range, padded by an hour so the edges
 * don't sit flush against the axis.
 */
export function activeHourRange(heatmap: Heatmap): { from: number; to: number } {
  const used = heatmap.cells.filter((c) => c.count > 0).map((c) => c.hour)
  if (used.length === 0) return { from: 6, to: 22 }
  return {
    from: Math.max(0, Math.min(...used) - 1),
    to: Math.min(23, Math.max(...used) + 1),
  }
}

/* ── breakdowns ─────────────────────────────────────────────────────────── */

export type Tally = { name: string; count: number }

function tally(names: Iterable<string>): Tally[] {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * Where training happens. An unrecorded place is excluded rather than bucketed
 * as "Unknown" — a bar for "we don't know" is not a place, and it would
 * routinely outrank the real ones (§3.7 keeps the join total; this is a
 * presentation choice on top).
 */
export function placeBreakdown(items: readonly ActivityItem[]): Tally[] {
  return tally(
    items.map((i) => i.place).filter((p): p is string => p !== null && p !== ''),
  )
}

/** Who it happens with. Sessions logged alone simply don't appear. */
export function partnerBreakdown(items: readonly ActivityItem[]): Tally[] {
  return tally(items.flatMap((i) => i.people))
}

/* ── cross-category totals ──────────────────────────────────────────────── */

export type CrossTotals = {
  activities: number
  /** Null when nothing has a usable duration — never a misleading zero. */
  totalMinutes: number | null
  avgMinutes: number | null
  /** Null when nothing recorded one. The `0` sentinel never reaches here (§3.2). */
  avgHeartRate: number | null
  /** Distinct weeks with at least one activity — the streak's denominator. */
  activeWeeks: number
}

export function crossTotals(items: readonly ActivityItem[]): CrossTotals {
  const durations = items
    .map((i) => i.durationMinutes)
    .filter((m): m is number => m !== null)
  const heartRates = items
    .map((i) => i.avgHeartRate)
    .filter((hr): hr is number => hr !== null)

  const totalMinutes = durations.length ? durations.reduce((a, b) => a + b, 0) : null

  return {
    activities: items.length,
    totalMinutes,
    avgMinutes: totalMinutes === null ? null : totalMinutes / durations.length,
    // Absent and 0-sentinel heart rates are excluded from BOTH the numerator
    // and the denominator (§7) — an unrecorded session must not drag the mean
    // toward zero.
    avgHeartRate: heartRates.length
      ? heartRates.reduce((a, b) => a + b, 0) / heartRates.length
      : null,
    activeWeeks: activeWeeks(items).length,
  }
}
