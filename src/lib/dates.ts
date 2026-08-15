import { format, isValid, parse } from 'date-fns'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONLY MODULE IN THIS CODEBASE THAT TOUCHES A RAW DATE STRING.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything else deals in `Date`. No exceptions — not components, not tests,
 * not forms (CLAUDE.md §3.6).
 *
 * The stored format is `d MMM yyyy, HH:mm` — e.g. `"8 Apr 2026, 16:50"`:
 *   · single-digit days are NOT zero-padded (`8 Apr`, never `08 Apr`)
 *   · month is a three-letter English abbreviation
 *   · no seconds
 *   · NO TIMEZONE
 *
 * Because the strings carry no timezone they are **wall-clock facts about the
 * owner's day**. A viewer in Tokyo must see the same `16:50` the owner logged.
 * So: never `.toISOString()`, never `Date.parse`, never any UTC conversion.
 * `new Date("8 Apr 2026, 16:50")` is engine-dependent and silently misparses.
 */

export const DB_DATE_FORMAT = 'd MMM yyyy, HH:mm'

/**
 * Parse a stored timestamp. Returns `null` rather than throwing or yielding an
 * Invalid Date — a single malformed row must never take down a list view.
 *
 * `date-fns/parse` is lenient about trailing junk, so the result is re-formatted
 * and compared byte-for-byte. That is what rejects `"8 Apr 2026, 16:50:30"` and
 * `"08 Apr 2026, 16:50"`, both of which would otherwise parse "successfully"
 * and then fail to round-trip.
 */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null

  const parsed = parse(value, DB_DATE_FORMAT, new Date())
  if (!isValid(parsed)) return null

  // Reject anything that would not round-trip losslessly.
  if (format(parsed, DB_DATE_FORMAT) !== value) return null

  return parsed
}

/**
 * Format a Date back into the stored representation. Round-trip with
 * `parseDbDate` must be lossless — this is what every write path uses, and a
 * drift here silently corrupts the sacred data.
 */
export function formatDbDate(date: Date): string {
  return format(date, DB_DATE_FORMAT)
}

/**
 * Duration in minutes between two stored timestamps, or `null` when the pair is
 * unusable (D-19).
 *
 * Nothing guarantees `end > start` — a session logged across midnight, or a
 * typo, yields a negative or absurd value. Non-positive and implausible (> 8h)
 * durations return `null`, which renders as an em dash and drops out of
 * averages. Never throws, never surfaces a negative.
 *
 * Verified against the real export: all 81 workouts are sane, so this is purely
 * defensive — but it is the write path in Phase 6 that will eventually test it.
 */
export const MAX_PLAUSIBLE_DURATION_MIN = 8 * 60

export function durationMinutes(
  start: Date | null | undefined,
  end: Date | null | undefined,
): number | null {
  if (!start || !end) return null
  const minutes = (end.getTime() - start.getTime()) / 60_000
  if (!Number.isFinite(minutes)) return null
  if (minutes <= 0) return null
  if (minutes > MAX_PLAUSIBLE_DURATION_MIN) return null
  return minutes
}

/* ── display helpers ───────────────────────────────────────────────────────
   Kept here so no component ever reaches for its own date formatting and
   accidentally reintroduces a timezone. */

/** `14 Aug 2026` — list rows and detail headers. */
export function formatDay(date: Date): string {
  return format(date, 'd MMM yyyy')
}

/** `14 Aug` — compact contexts where the year is implied. */
export function formatDayShort(date: Date): string {
  return format(date, 'd MMM')
}

/** `16:50` */
export function formatTime(date: Date): string {
  return format(date, 'HH:mm')
}

/** `2026-08` — the monthly report's URL segment. */
export function formatMonthKey(date: Date): string {
  return format(date, 'yyyy-MM')
}

/** `August 2026` */
export function formatMonthLong(date: Date): string {
  return format(date, 'MMMM yyyy')
}

/**
 * `1:12` — a duration rendered as h:mm. Minutes only below an hour (`47m`).
 * Returns an em dash for null so callers never branch on it themselves.
 */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—'
  const total = Math.round(minutes)
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * `7:17` — seconds-per-km as min:sec. This is how pace is displayed everywhere;
 * the stored `pace` string is never trusted for arithmetic (§3.2).
 */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return '—'
  }
  const total = Math.round(secondsPerKm)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
