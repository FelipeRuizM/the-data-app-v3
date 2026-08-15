import { formatDbDate } from './dates'
import type {
  CatalogExercise,
  RawExerciseEntry,
  RawSet,
  RawWorkout,
  SetType,
  Workout,
} from '../types'
import { SET_TYPES } from '../types'

/**
 * The write path's own shape — every field a plain string, because it backs
 * form inputs directly. Building the byte-compatible `RawWorkout` from this is
 * `buildRawWorkout`; the reverse, for editing an existing workout, is
 * `draftFromWorkout`. Both live here so the presence/absence rules are defined
 * exactly once (CLAUDE.md §3.9 — "the writer inverts the same mapping").
 */

export type SetDraft = {
  setType: SetType
  /** Empty = omit the field (§3.1: one real set genuinely lacks reps). */
  reps: string
  /**
   * Empty = bodyweight (field omitted). "0" = a genuine zero-weight set,
   * written literally. Anything else = a real load. This one string carries
   * all three states in `WeightState` (D-7b) because that IS the raw schema —
   * no separate toggle needed.
   */
  weight: string
  /** Empty = omit. */
  durationSeconds: string
}

export type ExerciseDraft = {
  exerciseTitle: string
  /** Empty = omit `exercise_notes` (291/385 have it — genuinely optional). */
  notes: string
}

export type ExerciseGroupDraft = {
  exercise: ExerciseDraft
  sets: SetDraft[]
}

export type WorkoutDraft = {
  title: string
  description: string
  /**
   * `datetime-local` value: "YYYY-MM-DDTHH:mm". Defaults to now and is edited
   * behind a disclosure rather than as a field of its own (D-47) — the common
   * case is logging a session you have just finished.
   */
  startLocal: string
  /**
   * Whole minutes. `end_time` is DERIVED from this (D-47) — the schema still
   * stores both timestamps, so nothing about the record shape changes; the form
   * just stopped asking a question whose answer is start + duration.
   */
  durationMinutes: string
  /** Empty writes `""` — `gym` is ALWAYS present in the schema, never omitted. */
  place: string
  /** Empty omits `category` (14/81 real records have no category). */
  category: string
  /** Empty, or "0", omits `avg_heart_rate` — 0 is the "not recorded" sentinel. */
  avgHeartRate: string
  /** Same sentinel rule as heart rate. New field, absent everywhere (D-45). */
  calories: string
  people: string[]
  exercises: ExerciseGroupDraft[]
}

/** What a new workout defaults to, in minutes. */
export const DEFAULT_DURATION_MINUTES = 60

/**
 * The offered durations, 5-minute steps up to four hours. A `<select>` rather
 * than a number field because a session length is a pick from a known set in
 * practice, and this is the one field every log now has to answer.
 */
export const DURATION_CHOICES: readonly number[] = Array.from(
  { length: 48 },
  (_, i) => (i + 1) * 5,
)

export function emptySet(): SetDraft {
  return { setType: 'normal', reps: '', weight: '', durationSeconds: '' }
}

/**
 * A new set inherits the previous one's numbers.
 *
 * Straight sets are the overwhelming majority of the real log — 1,027 of 1,274
 * sets are `normal` — so re-typing the same weight and reps four times is the
 * single most repetitive act in the app. The values are a starting point, not a
 * commitment: every field is still editable.
 */
export function setLike(previous: SetDraft | undefined): SetDraft {
  return previous ? { ...previous } : emptySet()
}

export function emptyExerciseGroup(): ExerciseGroupDraft {
  return { exercise: { exerciseTitle: '', notes: '' }, sets: [emptySet()] }
}

/** `Date` → the exact string a `datetime-local` input expects, local time. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * `datetime-local`'s value has no timezone, so the browser already parses it
 * as local time via its own date picker — but `new Date(string)` for this
 * exact shape is spec-guaranteed local too. Parsed by hand regardless, to
 * keep every date construction in this codebase explicit about what it's
 * doing (CLAUDE.md §3.6's paranoia is deliberate and applies here as well,
 * even though this string isn't the DB format).
 */
function fromLocalInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[]
  return new Date(y!, mo! - 1, d!, h, mi)
}

export function emptyWorkoutDraft(defaultStart?: Date): WorkoutDraft {
  const start = defaultStart ?? new Date()
  return {
    title: '',
    description: '',
    startLocal: toLocalInputValue(start),
    durationMinutes: String(DEFAULT_DURATION_MINUTES),
    place: '',
    category: '',
    avgHeartRate: '',
    calories: '',
    people: [],
    exercises: [emptyExerciseGroup()],
  }
}

/** Reverse mapping, for the edit form. */
export function draftFromWorkout(w: Workout): WorkoutDraft {
  return {
    title: w.title,
    description: w.description,
    startLocal: toLocalInputValue(w.startTime),
    // Measured off the stored timestamps rather than `durationMinutes`, which
    // nulls out an implausible span (D-19) — editing such a record should show
    // what it actually holds, not an empty field.
    durationMinutes:
      w.endTime === null
        ? ''
        : String(
            Math.max(
              0,
              Math.round((w.endTime.getTime() - w.startTime.getTime()) / 60_000),
            ),
          ),
    place: w.place ?? '',
    category: w.category ?? '',
    avgHeartRate: w.avgHeartRate === null ? '' : String(w.avgHeartRate),
    calories: w.calories === null ? '' : String(w.calories),
    people: w.people,
    exercises: w.exercises.map((e) => ({
      exercise: { exerciseTitle: e.exerciseTitle, notes: e.notes ?? '' },
      sets: e.sets.map((s) => ({
        setType: s.setType ?? 'normal',
        reps: s.reps === null ? '' : String(s.reps),
        weight:
          s.weight.kind === 'loaded'
            ? String(s.weight.kg)
            : s.weight.kind === 'zero'
              ? '0'
              : '',
        durationSeconds: s.durationSeconds === null ? '' : String(s.durationSeconds),
      })),
    })),
  }
}

export type DraftValidationError = { field: string; message: string }

export type BuildResult =
  { ok: true; raw: RawWorkout } | { ok: false; errors: DraftValidationError[] }

/**
 * The byte-compatible write. Every omission rule here corresponds to a
 * presence figure in CLAUDE.md §3.1 — this function is what keeps a new write
 * indistinguishable, shape-wise, from one of the original 81 records.
 */
/**
 * Name → catalog id, so a saved record can carry `exercise_id` (D-40).
 *
 * Built from the merged catalog at save time. A title with no catalog entry —
 * a genuinely new exercise typed into the form — simply gets no id, and the
 * record falls back to the name join exactly as every record did before.
 */
/** Name → id for a /config vocabulary — workout categories or run types (D-42). */
export function configIdsByName(
  rows: ReadonlyArray<{ id: string; name: string }>,
): Map<string, string> {
  return new Map(rows.map((r) => [r.name, r.id]))
}

export function exerciseIdsByName(
  catalog: readonly CatalogExercise[],
): Map<string, string> {
  return new Map(catalog.map((e) => [e.name, e.id]))
}

/**
 * Name → id maps for the vocabularies a workout references (D-40, D-42).
 *
 * An object rather than more positional parameters: two id maps today, and a
 * third would otherwise mean a fourth argument nobody can read at the call site.
 */
export type WorkoutRefs = {
  exercises?: ReadonlyMap<string, string>
  categories?: ReadonlyMap<string, string>
}

export function buildRawWorkout(
  draft: WorkoutDraft,
  /** Omit to write name-only records, which is what every caller did before. */
  refs: WorkoutRefs = {},
): BuildResult {
  const idByName = refs.exercises ?? new Map()
  const errors: DraftValidationError[] = []

  const title = draft.title.trim()
  if (title === '') errors.push({ field: 'title', message: 'Title is required.' })

  const start = fromLocalInputValue(draft.startLocal)
  if (!start) errors.push({ field: 'startLocal', message: 'Start time is required.' })

  // `end_time` is derived, so the only failure mode left is a duration that
  // isn't a positive number of minutes — the old "end before start" error
  // cannot happen by construction (D-47).
  const minutes = Number(draft.durationMinutes)
  const validMinutes =
    draft.durationMinutes.trim() !== '' && Number.isFinite(minutes) && minutes > 0
  if (!validMinutes) {
    errors.push({ field: 'durationMinutes', message: 'Duration is required.' })
  }

  const end =
    start && validMinutes ? new Date(start.getTime() + minutes * 60_000) : null

  const exerciseGroups = draft.exercises.filter(
    (g) => g.exercise.exerciseTitle.trim() !== '',
  )
  if (exerciseGroups.length === 0) {
    errors.push({ field: 'exercises', message: 'Add at least one exercise.' })
  }
  for (const g of exerciseGroups) {
    if (g.sets.length === 0) {
      errors.push({
        field: 'exercises',
        message: `"${g.exercise.exerciseTitle.trim()}" needs at least one set.`,
      })
    }
  }

  if (errors.length > 0 || !start || !end) return { ok: false, errors }

  const raw: RawWorkout = {
    title,
    description: draft.description.trim(),
    start_time: formatDbDate(start),
    end_time: formatDbDate(end),
    // ALWAYS present, per §3.1 — "" represents no place, never an omitted field.
    gym: draft.place.trim(),
    exercises: exerciseGroups.map((g) => exerciseGroupToRaw(g, idByName)),
  }

  const category = draft.category.trim()
  if (category !== '') {
    raw.category = category
    // ADDITIVE: the id sits on top of the name, never instead of it (D-42), so
    // a record stays readable to anything that knows only about names and the
    // change is undone by deleting one field.
    const categoryId = refs.categories?.get(category)
    if (categoryId !== undefined) raw.category_id = categoryId
  }

  // Zero is the "not recorded" sentinel (§3.2/§3.9) — typing 0 must not write
  // a literal 0 that a future read would immediately re-interpret as absent.
  const hr = Number(draft.avgHeartRate)
  if (draft.avgHeartRate.trim() !== '' && Number.isFinite(hr) && hr > 0) {
    raw.avg_heart_rate = hr
  }

  // New field (D-45), and it follows the same sentinel rule: a typed 0 would
  // read back as null anyway, so it is omitted rather than stored.
  const calories = Number(draft.calories)
  if (draft.calories.trim() !== '' && Number.isFinite(calories) && calories > 0) {
    raw.calories = calories
  }

  if (draft.people.length > 0) raw.people = [...draft.people]

  return { ok: true, raw }
}

function exerciseGroupToRaw(
  g: ExerciseGroupDraft,
  idByName: ReadonlyMap<string, string>,
): RawExerciseEntry {
  const title = g.exercise.exerciseTitle.trim()
  const entry: RawExerciseEntry = {
    exercise_title: title,
    sets: g.sets.map(setDraftToRaw),
  }
  // ADDITIVE: the id goes ON TOP of the title, never instead of it (D-40). A
  // record stays readable by a client that knows nothing about ids, and the
  // whole change is undone by deleting this one field.
  const id = idByName.get(title)
  if (id !== undefined) entry.exercise_id = id
  const notes = g.exercise.notes.trim()
  if (notes !== '') entry.exercise_notes = notes
  return entry
}

function setDraftToRaw(s: SetDraft, index: number): RawSet {
  const raw: RawSet = {
    set_index: index,
    set_type: (SET_TYPES as readonly string[]).includes(s.setType)
      ? s.setType
      : 'normal',
  }

  if (s.reps.trim() !== '') {
    const reps = Number(s.reps)
    if (Number.isFinite(reps)) raw.reps = reps
  }

  // The whole point of D-7b, expressed as one branch: empty means the field
  // was never there (bodyweight); "0" writes a literal, real zero.
  if (s.weight.trim() !== '') {
    const weight = Number(s.weight)
    if (Number.isFinite(weight) && weight >= 0) raw.weight_kg = weight
  }

  if (s.durationSeconds.trim() !== '') {
    const duration = Number(s.durationSeconds)
    if (Number.isFinite(duration)) raw.duration_seconds = duration
  }

  return raw
}
