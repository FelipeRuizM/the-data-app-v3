import { durationMinutes, parseDbDate } from './dates'
import {
  SET_TYPES,
  type CatalogExercise,
  type ExerciseEntry,
  type Place,
  type Person,
  type RawExerciseCatalogEntry,
  type RawList,
  type RawNamed,
  type RawRun,
  type RawSet,
  type RawSettings,
  type RawWorkout,
  type Run,
  type Settings,
  type SetType,
  type WeightState,
  type CalculatorSettings,
  type RampSet,
  type Workout,
  type WorkoutSet,
} from '../types'

/**
 * The normalization boundary (CLAUDE.md §3.9). Pure — no Firebase imports — so
 * every rule below is unit-testable against the committed fixture.
 *
 * Components never see anything this module takes as input.
 */

/* ── array-or-object coercion (§3.8) ────────────────────────────────────── */

/**
 * RTDB returns a node as a JS array only when its keys are the contiguous
 * integers 0..n. Remove one element, or write out of order, and the SAME node
 * comes back as an object with numeric-string keys. Nothing downstream may call
 * `Array.isArray`, so every list crosses this function first.
 *
 * Numeric-string keys are ordered numerically — `"10"` must not sort before
 * `"2"`, which is exactly what a lexicographic sort would do.
 */
export function toList<T>(value: RawList<T>): T[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.filter((v): v is T => v != null)

  const entries = Object.entries(value).filter(([, v]) => v != null)
  const allNumeric = entries.every(([k]) => /^\d+$/.test(k))
  if (allNumeric) entries.sort((a, b) => Number(a[0]) - Number(b[0]))
  return entries.map(([, v]) => v)
}

/* ── scalar normalization ───────────────────────────────────────────────── */

/** `undefined` → `null`, so the app type has no `?` ambiguity. */
function num(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * `0` means "not recorded" for run `avg_heart_rate` and `calories` — and, as the
 * export proved, for at least one workout's `avg_heart_rate` too. It must never
 * be averaged in or plotted (§3.2).
 */
export function zeroIsMissing(value: number | undefined | null): number | null {
  const n = num(value)
  return n === null || n === 0 ? null : n
}

function str(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function setType(value: string | undefined): SetType | null {
  return (SET_TYPES as readonly string[]).includes(value ?? '')
    ? (value as SetType)
    : null
}

/* ── the three-state weight rule (D-7b) ─────────────────────────────────── */

/**
 * ABSENT IS NOT ZERO. This is the subtlest rule in the codebase.
 *
 *   a number > 0   a real load
 *   exactly 0      a genuine 0 kg — assisted or unloaded machine work
 *   absent         bodyweight; volume substitutes the settings bodyweight,
 *                  and records rank on reps only
 *
 * Defaulting a missing `weight_kg` to 0 would silently convert bodyweight work
 * into no work, and 27 sets in the real export are exactly that case.
 */
export function weightState(value: number | undefined | null): WeightState {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return { kind: 'bodyweight' }
  if (value === 0) return { kind: 'zero' }
  return { kind: 'loaded', kg: value }
}

/**
 * The kilograms a set contributes to VOLUME, given the profile's bodyweight.
 *
 * Bodyweight substitution is confined to volume and must never reach a record
 * (D-7). Returns null when the weight is unknowable — i.e. bodyweight with no
 * bodyweight configured — so callers can exclude rather than count zero.
 */
export function volumeKg(
  weight: WeightState,
  bodyweightKg: number | null,
): number | null {
  switch (weight.kind) {
    case 'loaded':
      return weight.kg
    case 'zero':
      return 0
    case 'bodyweight':
      return bodyweightKg != null && bodyweightKg > 0 ? bodyweightKg : null
  }
}

/* ── records ────────────────────────────────────────────────────────────── */

function normalizeSet(raw: RawSet, index: number): WorkoutSet {
  return {
    setIndex: num(raw.set_index) ?? index,
    setType: setType(raw.set_type),
    reps: num(raw.reps),
    weight: weightState(raw.weight_kg),
    durationSeconds: num(raw.duration_seconds),
  }
}

function normalizeExerciseEntry(raw: {
  exercise_id?: string
  exercise_title?: string
  exercise_notes?: string
  sets?: RawList<RawSet>
}): ExerciseEntry {
  const sets = toList(raw.sets)
    .map(normalizeSet)
    // Sets carry their own index; trust it over arrival order.
    .sort((a, b) => a.setIndex - b.setIndex)

  return {
    // The stored title stands until the catalog is available to resolve the id
    // against — see `applyExerciseIds`, which runs once the catalog is built.
    exerciseTitle: str(raw.exercise_title) ?? 'Unknown',
    exerciseId: str(raw.exercise_id),
    notes: str(raw.exercise_notes),
    sets,
  }
}

/**
 * Resolve every entry's `exerciseId` to the catalog's CURRENT name (D-40).
 *
 * This is the whole point of the id: the record keeps pointing at the same
 * catalog row when that row is renamed, so a rename stops being a cascade over
 * history and becomes one write.
 *
 * Resolution deliberately goes **id → name → merged catalog**, not id → entry:
 * D-20 says a user's own entry wins over the shared one on a NAME collision, and
 * looking the entry up by id alone would bypass that and hand back the base
 * row's muscle group. Taking the id's name and re-resolving it keeps the
 * two-tier rule intact.
 *
 * An id that resolves to nothing leaves the stored title alone — §3.7 requires
 * every join to be total, and a dangling id is just another unresolvable name.
 */
export function applyExerciseIds(
  workouts: Workout[],
  catalog: CatalogExercise[],
): Workout[] {
  const nameById = new Map(catalog.map((e) => [e.id, e.name]))
  if (nameById.size === 0) return workouts

  return workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((entry) => {
      if (entry.exerciseId === null) return entry
      const current = nameById.get(entry.exerciseId)
      if (current === undefined || current === entry.exerciseTitle) return entry
      return { ...entry, exerciseTitle: current }
    }),
  }))
}

/**
 * Resolve a stored vocabulary id to the config row's CURRENT name (D-42).
 *
 * The same rule as `applyExerciseIds`, and the same fallback: an id that
 * resolves to nothing leaves the stored name alone, because §3.7 requires every
 * join to be total and §4 requires an unknown category to render neutral rather
 * than as an error.
 *
 * Unlike exercises there is no two-tier merge here — categories and run types
 * live only in `/config` — so this resolves straight to the row.
 */
function currentName(
  id: string | null,
  stored: string | null,
  rows: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  if (id === null) return stored
  return rows.find((r) => r.id === id)?.name ?? stored
}

/** Adopt the current category name on every workout carrying a resolvable id. */
export function applyCategoryIds<
  T extends { category: string | null; categoryId: string | null },
>(workouts: T[], categories: ReadonlyArray<{ id: string; name: string }>): T[] {
  if (categories.length === 0) return workouts
  return workouts.map((w) => {
    const name = currentName(w.categoryId, w.category, categories)
    return name === w.category ? w : { ...w, category: name }
  })
}

/** The same for a run's type. */
export function applyRunTypeIds<
  T extends { type: string | null; typeId: string | null },
>(runs: T[], runTypes: ReadonlyArray<{ id: string; name: string }>): T[] {
  if (runTypes.length === 0) return runs
  return runs.map((r) => {
    const name = currentName(r.typeId, r.type, runTypes)
    return name === r.type ? r : { ...r, type: name }
  })
}

/**
 * `place` resolution is total: an empty string, a missing field, or a name that
 * doesn't resolve all yield null, which renders as "—" / "No place". Never an
 * error state (§3.4, §3.7).
 */
export function normalizeWorkout(id: string, raw: RawWorkout): Workout | null {
  const startTime = parseDbDate(raw.start_time)
  // A record with no parseable start time has no place on a timeline. Drop it
  // rather than invent a date — and the caller reports how many were dropped.
  if (!startTime) return null

  const endTime = parseDbDate(raw.end_time)

  return {
    id,
    title: str(raw.title) ?? 'Untitled',
    description: str(raw.description) ?? '',
    startTime,
    endTime,
    place: str(raw.gym),
    category: str(raw.category),
    categoryId: str(raw.category_id),
    avgHeartRate: zeroIsMissing(raw.avg_heart_rate),
    // Same sentinel as everywhere else: a stored 0 means "not recorded", never
    // a session that burned nothing (§3.9, D-45).
    calories: zeroIsMissing(raw.calories),
    people: toList(raw.people)
      .map((p) => str(p))
      .filter((p): p is string => p !== null),
    exercises: toList(raw.exercises).map(normalizeExerciseEntry),
    durationMinutes: durationMinutes(startTime, endTime),
  }
}

/**
 * Pace is DERIVED, always. One of the 12 real runs stores `"8:00"` against a
 * derived 450 s/km — a 30 s/km gap — so the stored string is kept only so the
 * detail page can flag the disagreement (§3.2).
 */
export function derivePaceSecPerKm(
  durationSeconds: number | null,
  distanceKm: number | null,
): number | null {
  if (durationSeconds == null || distanceKm == null) return null
  if (durationSeconds <= 0 || distanceKm <= 0) return null
  const pace = durationSeconds / distanceKm
  return Number.isFinite(pace) ? pace : null
}

/** Parse a stored `"m:ss"` pace into seconds — for comparison only, never maths. */
export function parseStoredPace(value: string | null): number | null {
  if (!value) return null
  const m = /^(\d+):([0-5]\d)$/.exec(value.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function normalizeRun(id: string, raw: RawRun): Run | null {
  const startTime = parseDbDate(raw.start_time)
  if (!startTime) return null

  const durationSeconds = num(raw.duration_seconds)
  const distanceKm = num(raw.distance_km)

  return {
    id,
    title: str(raw.title) ?? 'Untitled',
    description: str(raw.description) ?? '',
    startTime,
    type: str(raw.type),
    typeId: str(raw.type_id),
    place: str(raw.location),
    distanceKm,
    durationSeconds,
    paceSecPerKm: derivePaceSecPerKm(durationSeconds, distanceKm),
    storedPace: str(raw.pace),
    avgHeartRate: zeroIsMissing(raw.avg_heart_rate),
    calories: zeroIsMissing(raw.calories),
    difficulty: num(raw.difficulty),
    // Retained, not supported (D-46) — parsed only so an edit can write them
    // back unchanged. Nothing downstream reads these three.
    elevationGainM: num(raw.elevation_gain_m),
    maxElevationM: num(raw.max_elevation_m),
    steps: num(raw.steps),
    people: toList(raw.people)
      .map((p) => str(p))
      .filter((p): p is string => p !== null),
    shoes: str(raw.shoes),
    watch: str(raw.watch),
    durationMinutes: durationSeconds != null ? durationSeconds / 60 : null,
  }
}

/* ── lookups ────────────────────────────────────────────────────────────── */

export function normalizeNamed(
  node: Record<string, RawNamed> | undefined,
): Array<{ id: string; name: string }> {
  return Object.entries(node ?? {})
    .map(([id, v]) => ({ id, name: str(v?.name) }))
    .filter((v): v is { id: string; name: string } => v.name !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const normalizePlaces = (node: Record<string, RawNamed> | undefined): Place[] =>
  normalizeNamed(node)

export const normalizePeople = (node: Record<string, RawNamed> | undefined): Person[] =>
  normalizeNamed(node)

/**
 * Merge the two exercise tiers into one catalog (D-20).
 *
 * Merge is BY NAME, because name is the actual join key in the set log — not
 * the push id. On a collision the user's entry wins, which is what lets someone
 * re-file a base exercise into a different muscle group without an admin and
 * without mutating shared data.
 *
 * Nothing downstream knows there are two tiers.
 */
export function mergeExerciseCatalog(
  base: Record<string, RawExerciseCatalogEntry> | undefined,
  own: Record<string, RawExerciseCatalogEntry> | undefined,
): CatalogExercise[] {
  const byName = new Map<string, CatalogExercise>()

  const add = (
    node: Record<string, RawExerciseCatalogEntry> | undefined,
    tier: 'base' | 'user',
  ) => {
    for (const [id, entry] of Object.entries(node ?? {})) {
      const name = str(entry?.name)
      if (name === null) continue
      byName.set(name, {
        id,
        name,
        muscleGroup: str(entry?.muscleGroup) ?? 'Unknown',
        tier,
      })
    }
  }

  add(base, 'base') // base first...
  add(own, 'user') // ...so the user's entry overwrites it on a name collision

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Muscle group for an exercise name. An unresolvable name aggregates under
 * `Unknown` — never throws, never drops the set (§3.3, §3.7).
 */
export function muscleGroupFor(
  catalog: CatalogExercise[],
  exerciseTitle: string,
): string {
  return catalog.find((e) => e.name === exerciseTitle)?.muscleGroup ?? 'Unknown'
}

/* ── settings ───────────────────────────────────────────────────────────── */

/**
 * Calculator defaults, sitting inside the §8 ranges: warm-up 20–30% for 6–12
 * reps; first feeder 40–50% for 4–6; second and third 50–75% with reps
 * dropping as the weight rises, so the lifter is fresh for the working set.
 */
export const CALCULATOR_DEFAULTS: CalculatorSettings = {
  warmup: [
    { percent: 20, reps: 12 },
    { percent: 30, reps: 8 },
  ],
  feeders: [
    { percent: 45, reps: 5 },
    { percent: 60, reps: 3 },
    { percent: 75, reps: 2 },
  ],
  roundingKg: 2.5,
  roundingLb: 5,
}

export const SETTINGS_DEFAULTS: Settings = {
  featuredExercises: [],
  units: 'kg',
  bodyweightKg: null,
  defaultShoes: 'Adidas Ultraboost 21',
  defaultWatch: 'Apple Watch Series 8',
  calculator: CALCULATOR_DEFAULTS,
}

/** A stored ramp, falling back whole rather than per-set on nonsense input. */
function normalizeRamp(
  raw: RawSettings['calculator'],
  key: 'warmup' | 'feeders',
): RampSet[] {
  const list = toList(raw?.[key])
    .map((r) => ({ percent: num(r?.percent), reps: num(r?.reps) }))
    .filter(
      (r): r is { percent: number; reps: number } =>
        r.percent !== null && r.reps !== null && r.percent > 0 && r.reps > 0,
    )
  return list.length > 0 ? list : CALCULATOR_DEFAULTS[key]
}

function normalizeCalculator(raw: RawSettings['calculator']): CalculatorSettings {
  const roundingKg = num(raw?.roundingKg)
  const roundingLb = num(raw?.roundingLb)
  return {
    warmup: normalizeRamp(raw, 'warmup'),
    feeders: normalizeRamp(raw, 'feeders'),
    roundingKg:
      roundingKg !== null && roundingKg > 0
        ? roundingKg
        : CALCULATOR_DEFAULTS.roundingKg,
    roundingLb:
      roundingLb !== null && roundingLb > 0
        ? roundingLb
        : CALCULATOR_DEFAULTS.roundingLb,
  }
}

/**
 * Code-level defaults so the app works before anyone has opened Settings — which
 * is also what lets a newly invited account work immediately. Nothing is written
 * to the database until a first explicit edit; never a startup migration (D-17).
 */
export function normalizeSettings(raw: RawSettings | undefined): Settings {
  const units = raw?.units === 'lb' ? 'lb' : 'kg'
  const bodyweight = num(raw?.bodyweightKg)

  return {
    featuredExercises: toList(raw?.featuredExercises)
      .map((n) => str(n))
      .filter((n): n is string => n !== null),
    units,
    bodyweightKg: bodyweight != null && bodyweight > 0 ? bodyweight : null,
    defaultShoes: str(raw?.defaultShoes) ?? SETTINGS_DEFAULTS.defaultShoes,
    defaultWatch: str(raw?.defaultWatch) ?? SETTINGS_DEFAULTS.defaultWatch,
    calculator: normalizeCalculator(raw?.calculator),
  }
}

/* ── aggregate helpers used by Home ─────────────────────────────────────── */

/** Total volume for a workout, honouring the three weight states (D-7/D-7b). */
export function workoutVolumeKg(workout: Workout, bodyweightKg: number | null): number {
  let total = 0
  for (const entry of workout.exercises) {
    for (const set of entry.sets) {
      if (set.reps == null) continue
      const kg = volumeKg(set.weight, bodyweightKg)
      if (kg == null) continue
      total += kg * set.reps
    }
  }
  return total
}

export function workoutSetCount(workout: Workout): number {
  return workout.exercises.reduce((n, e) => n + e.sets.length, 0)
}
