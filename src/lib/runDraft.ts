import { formatDbDate } from './dates'
import { derivePaceSecPerKm } from './normalize'
import type { RawRun, Run, Settings } from '../types'

/**
 * The run write path's draft shape — every field a plain string, backing form
 * inputs directly. Mirrors `workoutDraft.ts`; kept separate because the fields
 * are genuinely different, per the same reasoning as the two filter
 * implementations (CLAUDE.md §1).
 *
 * Omission rule, applied uniformly: **never write a number the user didn't
 * provide.** The 12 existing runs all carry every field because they came from
 * a Strava import that always had values; a hand-entered run can't invent one.
 * The parse layer already reads absent as null, so omission is safe and honest.
 * `avg_heart_rate` and `calories` additionally omit a typed 0, because a stored
 * 0 is the "not recorded" sentinel and would read back as null anyway (§3.2).
 */

export type RunDraft = {
  title: string
  description: string
  /** `datetime-local` value: "YYYY-MM-DDTHH:mm". */
  startLocal: string
  type: string
  place: string
  distanceKm: string
  /** Accepts "mm:ss", "h:mm:ss" or plain seconds — Strava shows "24:35". */
  duration: string
  avgHeartRate: string
  calories: string
  difficulty: string
  /**
   * RETIRED (D-46). No input renders these — they are carried from the loaded
   * record straight back to the database so that dropping them from the form
   * cannot delete them from the 12 runs that have them. `saveRun` replaces the
   * whole record, so "not in the draft" would mean "gone" on the next edit.
   */
  elevationGainM: string
  maxElevationM: string
  steps: string
  people: string[]
  shoes: string
  watch: string
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[]
  return new Date(y!, mo! - 1, d!, h, mi)
}

/**
 * Parse a duration the way someone reads it off a watch: "24:35", "1:02:15",
 * or a bare number of seconds. Returns null for anything else — a silently
 * misparsed duration would corrupt the derived pace, which is the one value
 * this app treats as truth (§3.2).
 */
export function parseDurationInput(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null

  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const parts = trimmed.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every((p) => /^\d{1,2}$/.test(p))) return null

  const nums = parts.map(Number)
  // Only the leading component may exceed 59.
  if (nums.slice(1).some((n) => n > 59)) return null

  const seconds =
    nums.length === 3
      ? nums[0]! * 3600 + nums[1]! * 60 + nums[2]!
      : nums[0]! * 60 + nums[1]!
  return seconds > 0 ? seconds : null
}

/** Seconds → "mm:ss" or "h:mm:ss", for seeding the edit form. */
export function formatDurationInput(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Seconds-per-km → the stored `"m:ss"` string. */
export function formatPaceForStorage(secPerKm: number): string {
  const total = Math.round(secPerKm)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function emptyRunDraft(settings: Settings, defaultStart?: Date): RunDraft {
  return {
    title: '',
    description: '',
    startLocal: toLocalInputValue(defaultStart ?? new Date()),
    type: '',
    place: '',
    distanceKm: '',
    duration: '',
    avgHeartRate: '',
    calories: '',
    difficulty: '',
    elevationGainM: '',
    maxElevationM: '',
    steps: '',
    people: [],
    // Per-account defaults (D-16) — the owner wears the same gear most runs.
    shoes: settings.defaultShoes,
    watch: settings.defaultWatch,
  }
}

const numStr = (n: number | null) => (n === null ? '' : String(n))

export function draftFromRun(r: Run, settings: Settings): RunDraft {
  return {
    title: r.title,
    description: r.description,
    startLocal: toLocalInputValue(r.startTime),
    type: r.type ?? '',
    place: r.place ?? '',
    distanceKm: numStr(r.distanceKm),
    duration: r.durationSeconds === null ? '' : formatDurationInput(r.durationSeconds),
    avgHeartRate: numStr(r.avgHeartRate),
    calories: numStr(r.calories),
    difficulty: numStr(r.difficulty),
    elevationGainM: numStr(r.elevationGainM),
    maxElevationM: numStr(r.maxElevationM),
    steps: numStr(r.steps),
    people: r.people,
    // Fall back to the account default for the 12 historical runs that predate
    // these fields, rather than showing blanks the owner has to refill.
    shoes: r.shoes ?? settings.defaultShoes,
    watch: r.watch ?? settings.defaultWatch,
  }
}

export type DraftValidationError = { field: string; message: string }

export type BuildRunResult =
  { ok: true; raw: RawRun } | { ok: false; errors: DraftValidationError[] }

/** Parse an optional non-negative number field. `null` = omit. */
function optionalNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function buildRawRun(
  draft: RunDraft,
  /** Name → /config runTypes id. Omit to write a name-only record (D-42). */
  typeIdsByName: ReadonlyMap<string, string> = new Map(),
): BuildRunResult {
  const errors: DraftValidationError[] = []

  const title = draft.title.trim()
  if (title === '') errors.push({ field: 'title', message: 'Title is required.' })

  const start = fromLocalInputValue(draft.startLocal)
  if (!start) errors.push({ field: 'startLocal', message: 'Start time is required.' })

  const distanceKm = optionalNumber(draft.distanceKm)
  if (distanceKm === null || distanceKm <= 0) {
    errors.push({ field: 'distanceKm', message: 'Distance is required.' })
  }

  const durationSeconds = parseDurationInput(draft.duration)
  if (durationSeconds === null) {
    errors.push({
      field: 'duration',
      message: 'Duration is required — use mm:ss, h:mm:ss, or seconds.',
    })
  }

  const difficulty = optionalNumber(draft.difficulty)
  if (difficulty !== null && (difficulty < 1 || difficulty > 10)) {
    errors.push({
      field: 'difficulty',
      message: 'Difficulty must be between 1 and 10.',
    })
  }

  if (errors.length > 0 || !start || durationSeconds === null || distanceKm === null) {
    return { ok: false, errors }
  }

  // Pace is DERIVED and written from distance and duration — never transcribed.
  // The one historical run whose stored pace disagreed with its own numbers is
  // exactly what this prevents recurring (§3.2).
  const paceSecPerKm = derivePaceSecPerKm(durationSeconds, distanceKm)

  const raw: RawRun = {
    title,
    description: draft.description.trim(),
    start_time: formatDbDate(start),
    type: draft.type.trim(),
    location: draft.place.trim(),
    distance_km: distanceKm,
    duration_seconds: durationSeconds,
    pace: paceSecPerKm === null ? '' : formatPaceForStorage(paceSecPerKm),
  }

  // ADDITIVE: the id goes alongside the stored type name, never instead of it
  // (D-42). A renamed run type then reads correctly without this record being
  // rewritten, and deleting the field undoes the whole change.
  const typeId = typeIdsByName.get(raw.type ?? '')
  if (typeId !== undefined) raw.type_id = typeId

  // Sentinel fields: omitted when blank AND when a literal 0 is typed, since a
  // stored 0 means "not recorded" and would read back as null regardless.
  const hr = optionalNumber(draft.avgHeartRate)
  if (hr !== null && hr > 0) raw.avg_heart_rate = hr

  const calories = optionalNumber(draft.calories)
  if (calories !== null && calories > 0) raw.calories = calories

  // Non-sentinel numerics: a typed 0 is a real value (11 of 12 historical runs
  // record 0 steps and 0 max elevation), so only blanks are omitted.
  if (difficulty !== null) raw.difficulty = difficulty

  // Retired fields, written back exactly as they arrived (D-46). A new run
  // carries blanks here and so stores nothing; an edited historical run keeps
  // every number it already had.

  const elevationGain = optionalNumber(draft.elevationGainM)
  if (elevationGain !== null) raw.elevation_gain_m = elevationGain

  const maxElevation = optionalNumber(draft.maxElevationM)
  if (maxElevation !== null) raw.max_elevation_m = maxElevation

  const steps = optionalNumber(draft.steps)
  if (steps !== null) raw.steps = steps

  if (draft.people.length > 0) raw.people = [...draft.people]

  const shoes = draft.shoes.trim()
  if (shoes !== '') raw.shoes = shoes

  const watch = draft.watch.trim()
  if (watch !== '') raw.watch = watch

  return { ok: true, raw }
}
