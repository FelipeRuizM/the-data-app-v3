/**
 * Two layers, deliberately not one (CLAUDE.md §3.9).
 *
 *   Raw*  — mirrors the database exactly. Everything optional, `0` sentinels
 *           intact, dates as strings, arrays possibly objects. Only src/lib/db.ts
 *           may touch these.
 *   App   — normalized. No surprise `undefined`, no sentinels, dates as `Date`,
 *           arrays dense. This is all any component ever sees.
 *
 * No `any`. Anywhere.
 */

/* ═══════════════════════════════ RAW (database) ═════════════════════════ */

/** RTDB collapses a sparse array into an object with numeric-string keys (§3.8). */
export type RawList<T> = T[] | Record<string, T> | null | undefined

export type RawSet = {
  set_index?: number
  set_type?: string
  reps?: number
  /** Three distinct states — see `WeightState` (D-7b). Absent is NOT zero. */
  weight_kg?: number
  duration_seconds?: number
}

export type RawExerciseEntry = {
  exercise_title?: string
  exercise_notes?: string
  sets?: RawList<RawSet>
}

export type RawWorkout = {
  title?: string
  description?: string
  start_time?: string
  end_time?: string
  gym?: string
  category?: string
  avg_heart_rate?: number
  people?: RawList<string>
  exercises?: RawList<RawExerciseEntry>
}

export type RawRun = {
  title?: string
  description?: string
  start_time?: string
  type?: string
  location?: string
  distance_km?: number
  duration_seconds?: number
  pace?: string
  avg_heart_rate?: number
  calories?: number
  difficulty?: number
  elevation_gain_m?: number
  max_elevation_m?: number
  steps?: number
  people?: RawList<string>
  shoes?: string
  watch?: string
}

export type RawNamed = { name?: string }
export type RawExerciseCatalogEntry = { name?: string; muscleGroup?: string }

export type RawProfile = {
  workouts?: Record<string, RawWorkout>
  runs?: Record<string, RawRun>
  exercises?: Record<string, RawExerciseCatalogEntry>
  gyms?: Record<string, RawNamed>
  people?: Record<string, RawNamed>
  settings?: RawSettings
}

export type RawSettings = {
  featuredExercises?: RawList<string>
  units?: string
  bodyweightKg?: number
  defaultShoes?: string
  defaultWatch?: string
  calculator?: {
    warmup?: RawList<{ percent?: number; reps?: number }>
    feeders?: RawList<{ percent?: number; reps?: number }>
    roundingKg?: number
    roundingLb?: number
  }
}

/* ═══════════════════════════════ APP (normalized) ═══════════════════════ */

export const SET_TYPES = ['normal', 'warmup', 'feeder', 'failure', 'dropset'] as const
export type SetType = (typeof SET_TYPES)[number]

/**
 * `weight_kg` has three meanings, and collapsing any two of them is a bug (D-7b):
 *
 *   loaded     a real load       → counts in volume and in records
 *   zero       a genuine 0 kg    → assisted/unloaded machine work, counts as 0
 *   bodyweight the field was ABSENT → volume substitutes settings bodyweight;
 *              records rank on reps only, never on weight
 */
export type WeightState =
  { kind: 'loaded'; kg: number } | { kind: 'zero' } | { kind: 'bodyweight' }

export type WorkoutSet = {
  setIndex: number
  setType: SetType | null
  reps: number | null
  weight: WeightState
  durationSeconds: number | null
}

export type ExerciseEntry = {
  exerciseTitle: string
  notes: string | null
  sets: WorkoutSet[]
}

export type Workout = {
  id: string
  title: string
  description: string
  startTime: Date
  endTime: Date | null
  /** Null when unrecorded, empty, or unresolvable — never an error state. */
  place: string | null
  category: string | null
  /** `0` in the database means "not recorded" and arrives here as null. */
  avgHeartRate: number | null
  people: string[]
  exercises: ExerciseEntry[]
  /** Null when non-positive or implausible (D-19). */
  durationMinutes: number | null
}

export type Run = {
  id: string
  title: string
  description: string
  startTime: Date
  type: string | null
  place: string | null
  distanceKm: number | null
  durationSeconds: number | null
  /** DERIVED, always. The stored `pace` string is never trusted for maths (§3.2). */
  paceSecPerKm: number | null
  /** The stored string, kept only so the detail page can flag a disagreement. */
  storedPace: string | null
  avgHeartRate: number | null
  calories: number | null
  difficulty: number | null
  elevationGainM: number | null
  maxElevationM: number | null
  steps: number | null
  people: string[]
  shoes: string | null
  watch: string | null
  durationMinutes: number | null
}

export type Place = { id: string; name: string }
export type Person = { id: string; name: string }

export type CatalogExercise = {
  id: string
  name: string
  muscleGroup: string
  /** Which tier it came from. The UI mostly ignores this; Settings does not (D-20). */
  tier: 'base' | 'user'
}

/** Re-exported so components import display types from one place. */
export type Units = 'kg' | 'lb'

/** One prescribed set in the warm-up / feeder ramp (§8). */
export type RampSet = {
  /** Percent of the target working load. */
  percent: number
  reps: number
}

/**
 * Calculator preferences (§8). The percentages are the owner's current
 * preference, not a law — editable and persisted, never hardcoded beyond a
 * default.
 */
export type CalculatorSettings = {
  warmup: RampSet[]
  feeders: RampSet[]
  /** Loadable increment in each display unit (D-12). */
  roundingKg: number
  roundingLb: number
}

export type Settings = {
  featuredExercises: string[]
  units: Units
  bodyweightKg: number | null
  defaultShoes: string
  defaultWatch: string
  calculator: CalculatorSettings
}

/** Everything one profile needs, already normalized. */
export type Profile = {
  workouts: Workout[]
  runs: Run[]
  exercises: CatalogExercise[]
  places: Place[]
  people: Person[]
  settings: Settings
}

/** A single row in the cross-category recent-activity strip. */
export type ActivityItem = {
  id: string
  categoryId: string
  title: string
  startTime: Date
  /** Category/type name, e.g. "Push" or "Light". Null when uncategorized. */
  label: string | null
  colorToken: string
  /** The one scannable number: volume for workouts, distance for runs. */
  metric: string
  durationMinutes: number | null
}
