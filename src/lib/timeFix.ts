import { formatDbDate, parseDbDate } from './dates'
import type { RawWorkout, Workout } from '../types'

/**
 * Moving a workout to a different timestamp, without touching anything else
 * (D-66).
 *
 * **This is deliberately NOT `saveWorkout`.** That writes the whole record, so
 * a page whose only job is fixing a clock would rewrite all 25 sets on every
 * save — and any field the draft layer does not model would be lost with them.
 * The plan here addresses `start_time` and `end_time` and nothing else, as two
 * paths in one multi-path update.
 *
 * **Duration is preserved, not recomputed.** "This happened at 18:00, not
 * 16:00" is the whole request; the session was still 70 minutes long. So the
 * end shifts by exactly the same delta the start did, which also means the
 * stored duration survives being edited by someone who never looked at it.
 */

export type TimeEdit = {
  id: string
  /** `datetime-local` value: "YYYY-MM-DDTHH:mm". */
  startLocal: string
}

export type TimePlan = {
  /** Firebase paths → their new value. Empty when nothing actually changed. */
  updates: Record<string, string>
  /** Ids whose new timestamp could not be used, with why. */
  rejected: Array<{ id: string; reason: string }>
  changed: number
}

/** `Date` → the exact string a `datetime-local` input expects, local time. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[]
  const date = new Date(y!, mo! - 1, d!, h, mi)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Build the write.
 *
 * `raw` is needed as well as the normalized workouts because the end time has
 * to be shifted by the delta the RAW record implies — the app type's
 * `durationMinutes` is null for an implausible span (D-19), and a record whose
 * clock is wrong is exactly the kind that has one.
 */
export function planTimeFix(
  uid: string,
  workouts: readonly Workout[],
  raw: Readonly<Record<string, RawWorkout>>,
  edits: readonly TimeEdit[],
): TimePlan {
  const byId = new Map(workouts.map((w) => [w.id, w]))
  const updates: Record<string, string> = {}
  const rejected: Array<{ id: string; reason: string }> = []
  let changed = 0

  for (const edit of edits) {
    const workout = byId.get(edit.id)
    if (!workout) {
      rejected.push({ id: edit.id, reason: 'No workout with that id.' })
      continue
    }

    const next = fromLocalInputValue(edit.startLocal)
    if (!next) {
      rejected.push({ id: edit.id, reason: 'Not a valid date and time.' })
      continue
    }

    const nextStart = formatDbDate(next)
    const currentStart = raw[edit.id]?.start_time ?? formatDbDate(workout.startTime)
    // Nothing to write. Comparing the FORMATTED strings, not the Dates, because
    // the stored format has no seconds — a change smaller than a minute is not
    // a change to this database (§3.6).
    if (nextStart === currentStart) continue

    changed += 1
    updates[`users/${uid}/workouts/${edit.id}/start_time`] = nextStart

    // The end shifts with the start, keeping the session's length intact.
    const storedEnd = parseDbDate(raw[edit.id]?.end_time)
    const storedStart = parseDbDate(raw[edit.id]?.start_time)
    if (storedEnd && storedStart) {
      const span = storedEnd.getTime() - storedStart.getTime()
      updates[`users/${uid}/workouts/${edit.id}/end_time`] = formatDbDate(
        new Date(next.getTime() + span),
      )
    }
    // A record with no end_time keeps not having one. Inventing a value here
    // would be this page writing data it was never asked to write.
  }

  return { updates, rejected, changed }
}
