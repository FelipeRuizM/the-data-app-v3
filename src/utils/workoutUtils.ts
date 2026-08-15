import { addMonths, endOfMonth, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { muscleGroupFor, volumeKg } from '../lib/normalize'
import { RADAR_EXCLUDED_GROUPS } from '../lib/config'
import {
  PR_METRICS,
  computePRAchievements,
  isExcludedSet,
  type PRMetric,
} from './prEngine'
import type { CatalogExercise, Profile, Run, Workout } from '../types'

/**
 * Monthly report aggregations (CLAUDE.md §7).
 *
 * Never stored — a pure recomputation over full history, scoped to one
 * calendar month and diffed against the same computation for the previous
 * month. There is no "consistency score"; the comparison mechanism is
 * last-month-vs-this-month deltas on every stat card.
 */

/* ── month scoping ──────────────────────────────────────────────────────── */

/** Wall-clock month membership (§3.6) — never UTC. */
export function inMonth(date: Date, month: Date): boolean {
  return isSameMonth(date, month)
}

export function monthBounds(month: Date): { from: Date; to: Date } {
  return { from: startOfMonth(month), to: endOfMonth(month) }
}

/* ── layer 1 aggregates ─────────────────────────────────────────────────── */

export type ActivityTotals = {
  count: number
  /** Minutes. Null contributions (unparseable durations, D-19) are skipped. */
  totalMinutes: number
  liftingMinutes: number
  runningMinutes: number
  avgSessionMinutes: number | null
  /**
   * Mean over sessions that ACTUALLY logged a heart rate. Absent and
   * 0-sentinel values are excluded from numerator AND denominator (§7).
   */
  avgHeartRate: number | null
}

export type WorkoutTotals = {
  sessions: number
  volumeKg: number
  reps: number
  sets: number
  avgVolumePerSession: number | null
}

export type RunTotals = {
  runs: number
  distanceKm: number
  /** Total seconds ÷ total km — a derived RATE, never a mean of per-run paces. */
  avgPaceSecPerKm: number | null
  calories: number
}

export type MonthlySummary = {
  month: Date
  activities: ActivityTotals
  workouts: WorkoutTotals
  runs: RunTotals
  /** The records that fed the aggregate, for layers 2–4. */
  monthWorkouts: Workout[]
  monthRuns: Run[]
}

function averageHeartRate(values: (number | null)[]): number | null {
  const recorded = values.filter((v): v is number => v !== null && v > 0)
  if (recorded.length === 0) return null
  return recorded.reduce((a, b) => a + b, 0) / recorded.length
}

export function summariseMonth(profile: Profile, month: Date): MonthlySummary {
  const monthWorkouts = profile.workouts.filter((w) => inMonth(w.startTime, month))
  const monthRuns = profile.runs.filter((r) => inMonth(r.startTime, month))
  const bodyweight = profile.settings.bodyweightKg

  const liftingMinutes = monthWorkouts.reduce((n, w) => n + (w.durationMinutes ?? 0), 0)
  const runningMinutes = monthRuns.reduce((n, r) => n + (r.durationMinutes ?? 0), 0)
  const count = monthWorkouts.length + monthRuns.length
  const totalMinutes = liftingMinutes + runningMinutes

  let volume = 0
  let reps = 0
  let sets = 0
  for (const w of monthWorkouts) {
    for (const entry of w.exercises) {
      for (const set of entry.sets) {
        if (isExcludedSet(set)) continue
        sets += 1
        if (set.reps === null) continue
        reps += set.reps
        // Bodyweight substitution applies here (D-7) — a bodyweight session
        // must not total zero volume.
        const kg = volumeKg(set.weight, bodyweight)
        if (kg !== null) volume += kg * set.reps
      }
    }
  }

  const distanceKm = monthRuns.reduce((n, r) => n + (r.distanceKm ?? 0), 0)
  const runSeconds = monthRuns.reduce((n, r) => n + (r.durationSeconds ?? 0), 0)

  return {
    month,
    activities: {
      count,
      totalMinutes,
      liftingMinutes,
      runningMinutes,
      avgSessionMinutes: count === 0 ? null : totalMinutes / count,
      avgHeartRate: averageHeartRate([
        ...monthWorkouts.map((w) => w.avgHeartRate),
        ...monthRuns.map((r) => r.avgHeartRate),
      ]),
    },
    workouts: {
      sessions: monthWorkouts.length,
      volumeKg: volume,
      reps,
      sets,
      avgVolumePerSession:
        monthWorkouts.length === 0 ? null : volume / monthWorkouts.length,
    },
    runs: {
      runs: monthRuns.length,
      distanceKm,
      // The derived rate, per §7. A mean of per-run paces would weight a 1km
      // jog the same as a 20km long run.
      avgPaceSecPerKm:
        distanceKm > 0 && runSeconds > 0 ? runSeconds / distanceKm : null,
      calories: monthRuns.reduce((n, r) => n + (r.calories ?? 0), 0),
    },
    monthWorkouts,
    monthRuns,
  }
}

export type MonthlyReport = {
  current: MonthlySummary
  previous: MonthlySummary
  /**
   * Hidden entirely, not zeroed, when NEITHER month had that activity type
   * (§7). A lifter who never runs must not see a permanent empty Runs block.
   */
  showWorkouts: boolean
  showRuns: boolean
}

export function getMonthlySummary(profile: Profile, month: Date): MonthlyReport {
  const current = summariseMonth(profile, month)
  const previous = summariseMonth(profile, subMonths(month, 1))

  return {
    current,
    previous,
    showWorkouts: current.workouts.sessions > 0 || previous.workouts.sessions > 0,
    showRuns: current.runs.runs > 0 || previous.runs.runs > 0,
  }
}

/* ── deltas ─────────────────────────────────────────────────────────────── */

export type Delta = {
  absolute: number
  /** Null when the previous value was 0 — a percentage would be meaningless. */
  percent: number | null
  direction: 'up' | 'down' | 'flat'
}

/**
 * `invertTrend` flips arrow SEMANTICS for metrics where lower is better (pace).
 * The absolute and percent values are unchanged — only the direction label,
 * which is what drives the colour.
 */
export function computeDelta(
  current: number | null,
  previous: number | null,
  invertTrend = false,
): Delta | null {
  if (current === null || previous === null) return null

  const absolute = current - previous
  const percent = previous === 0 ? null : (absolute / previous) * 100

  let direction: Delta['direction'] = 'flat'
  if (absolute > 0) direction = invertTrend ? 'down' : 'up'
  else if (absolute < 0) direction = invertTrend ? 'up' : 'down'

  return { absolute, percent, direction }
}

/* ── layer 2: muscle groups ─────────────────────────────────────────────── */

export type MuscleGroupTotals = {
  group: string
  sets: number
  reps: number
  volumeKg: number
}

/**
 * ONE aggregation feeding both Layer 2 charts (§7) — the bar chart of set
 * counts and the toggleable radar.
 */
export function getVolumeByMuscleGroup(
  workouts: readonly Workout[],
  catalog: CatalogExercise[],
  bodyweightKg: number | null,
): MuscleGroupTotals[] {
  const totals = new Map<string, MuscleGroupTotals>()

  for (const w of workouts) {
    for (const entry of w.exercises) {
      const group = muscleGroupFor(catalog, entry.exerciseTitle)
      let row = totals.get(group)
      if (!row) {
        row = { group, sets: 0, reps: 0, volumeKg: 0 }
        totals.set(group, row)
      }

      for (const set of entry.sets) {
        if (isExcludedSet(set)) continue
        row.sets += 1
        if (set.reps === null) continue
        row.reps += set.reps
        const kg = volumeKg(set.weight, bodyweightKg)
        if (kg !== null) row.volumeKg += kg * set.reps
      }
    }
  }

  return [...totals.values()].sort((a, b) => b.sets - a.sets)
}

/**
 * Radar restricted to primary movement groups — `Core` and `Other` are
 * excluded because they distort the balance shape (§7). `Unknown` goes too:
 * an unresolved exercise name is not a movement pattern.
 */
export function radarGroups(totals: MuscleGroupTotals[]): MuscleGroupTotals[] {
  return totals.filter((t) => !RADAR_EXCLUDED_GROUPS.includes(t.group))
}

/* ── layer 2: main exercises ────────────────────────────────────────────── */

export type ExerciseTotals = {
  exerciseTitle: string
  sets: number
  reps: number
  volumeKg: number
}

/** Top lifts that month, ranked by volume then sets. */
export function getMainExercises(
  workouts: readonly Workout[],
  bodyweightKg: number | null,
  limit = 5,
): ExerciseTotals[] {
  const totals = new Map<string, ExerciseTotals>()

  for (const w of workouts) {
    for (const entry of w.exercises) {
      let row = totals.get(entry.exerciseTitle)
      if (!row) {
        row = { exerciseTitle: entry.exerciseTitle, sets: 0, reps: 0, volumeKg: 0 }
        totals.set(entry.exerciseTitle, row)
      }
      for (const set of entry.sets) {
        if (isExcludedSet(set)) continue
        row.sets += 1
        if (set.reps === null) continue
        row.reps += set.reps
        const kg = volumeKg(set.weight, bodyweightKg)
        if (kg !== null) row.volumeKg += kg * set.reps
      }
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.volumeKg - a.volumeKg || b.sets - a.sets)
    .slice(0, limit)
}

/* ── layer 2: session calendar ──────────────────────────────────────────── */

export type CalendarDay = {
  date: Date
  /** Null for leading/trailing padding cells. */
  dayOfMonth: number | null
  workouts: number
  runs: number
}

/**
 * A full month grid, weeks starting SUNDAY to match the streak definition
 * (D-15) — mixing week starts across the app would be quietly confusing.
 */
export function getSessionCalendar(summary: MonthlySummary): CalendarDay[][] {
  const { from, to } = monthBounds(summary.month)
  const daysInMonth = to.getDate()

  const counts = new Map<number, { workouts: number; runs: number }>()
  const bump = (d: Date, key: 'workouts' | 'runs') => {
    const day = d.getDate()
    const row = counts.get(day) ?? { workouts: 0, runs: 0 }
    row[key] += 1
    counts.set(day, row)
  }
  for (const w of summary.monthWorkouts) bump(w.startTime, 'workouts')
  for (const r of summary.monthRuns) bump(r.startTime, 'runs')

  const cells: CalendarDay[] = []

  // Leading padding so the 1st lands under its weekday.
  for (let i = 0; i < from.getDay(); i++) {
    cells.push({ date: from, dayOfMonth: null, workouts: 0, runs: 0 })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(from.getFullYear(), from.getMonth(), day)
    const c = counts.get(day) ?? { workouts: 0, runs: 0 }
    cells.push({ date, dayOfMonth: day, workouts: c.workouts, runs: c.runs })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: to, dayOfMonth: null, workouts: 0, runs: 0 })
  }

  const weeks: CalendarDay[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Months that actually contain activity, newest first — for month navigation. */
export function monthsWithActivity(profile: Profile): Date[] {
  const keys = new Set<string>()
  const out: Date[] = []

  for (const d of [
    ...profile.workouts.map((w) => w.startTime),
    ...profile.runs.map((r) => r.startTime),
  ]) {
    const start = startOfMonth(d)
    const key = `${start.getFullYear()}-${start.getMonth()}`
    if (keys.has(key)) continue
    keys.add(key)
    out.push(start)
  }

  return out.sort((a, b) => b.getTime() - a.getTime())
}

/* ── layer 3: records broken this month ─────────────────────────────────── */

export type MonthlyRecord = {
  exerciseTitle: string
  metric: PRMetric
  value: number
  previous: number
  date: Date
  workoutId: string
}

/**
 * Records broken in the given month (§7 Layer 3).
 *
 * Reuses `computePRAchievements` over FULL history — the chronology has to be
 * complete for "broken, not established" to mean anything — then filters to
 * the month.
 *
 * Within that filtered set, collapses to ONE best achievement per exercise per
 * record type: hitting the same PR type twice in a month shows only the
 * heaviest instance.
 */
export function getRecordsBrokenInMonth(
  workouts: readonly Workout[],
  month: Date,
): MonthlyRecord[] {
  const best = new Map<string, MonthlyRecord>()

  for (const a of computePRAchievements(workouts)) {
    if (!inMonth(a.date, month)) continue

    const key = `${a.exerciseTitle}::${a.metric}`
    const current = best.get(key)
    if (!current || a.value > current.value) {
      best.set(key, {
        exerciseTitle: a.exerciseTitle,
        metric: a.metric,
        value: a.value,
        // Keep the ORIGINAL baseline this month started from, not the
        // intermediate value the collapsed-away achievement beat.
        previous: current ? Math.min(current.previous, a.previous) : a.previous,
        date: a.date,
        workoutId: a.workoutId,
      })
    } else {
      current.previous = Math.min(current.previous, a.previous)
    }
  }

  return [...best.values()].sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      a.exerciseTitle.localeCompare(b.exerciseTitle),
  )
}

/** Counts per record type, for the collapsed card's chips. */
export function countByMetric(records: readonly MonthlyRecord[]): Array<{
  metric: PRMetric
  count: number
}> {
  return PR_METRICS.map((metric) => ({
    metric,
    count: records.filter((r) => r.metric === metric).length,
  })).filter((r) => r.count > 0)
}

/* ── trend series ───────────────────────────────────────────────────────── */

export type MonthlySeriesPoint = {
  month: Date
  activities: number
  volumeKg: number
  sets: number
  distanceKm: number
  totalMinutes: number
}

/**
 * One point per calendar month across ALL history (§7) — including months with
 * nothing logged, so a gap reads as a gap rather than being closed up.
 *
 * Separate from the single-month comparison cards: this is the long view.
 */
export function getMonthlySeries(profile: Profile): MonthlySeriesPoint[] {
  const months = monthsWithActivity(profile)
  if (months.length === 0) return []

  const oldest = months[months.length - 1]!
  const newest = months[0]!

  const points: MonthlySeriesPoint[] = []
  let cursor = oldest
  while (cursor.getTime() <= newest.getTime()) {
    const s = summariseMonth(profile, cursor)
    points.push({
      month: cursor,
      activities: s.activities.count,
      volumeKg: s.workouts.volumeKg,
      sets: s.workouts.sets,
      distanceKm: s.runs.distanceKm,
      totalMinutes: s.activities.totalMinutes,
    })
    cursor = addMonths(cursor, 1)
  }

  return points
}
