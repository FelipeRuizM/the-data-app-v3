import { get, ref } from 'firebase/database'
import { db } from './firebase'
import { CONFIG_DEFAULTS, type AppConfig, type ConfigCategory } from './config'
import {
  mergeExerciseCatalog,
  normalizePeople,
  normalizePlaces,
  normalizeRun,
  normalizeSettings,
  normalizeWorkout,
  toList,
} from './normalize'
import type {
  Profile,
  RawExerciseCatalogEntry,
  RawNamed,
  RawProfile,
  RawRun,
  RawWorkout,
  Run,
  Workout,
} from '../types'

/**
 * The Firebase read layer. **Profile-scoped** — every read is against one
 * `/users/{uid}` subtree, because a guest is pointed at the owner's profile
 * while an admin or user reads their own (D-3, D-23).
 *
 * All parsing lives in `normalize.ts`, which is pure and tested. This module
 * only fetches and delegates, so there is no untested logic behind the network.
 */

export type LoadResult = {
  profile: Profile
  config: AppConfig
  /** Records dropped for having no parseable start time. Surfaced, never silent. */
  dropped: { workouts: number; runs: number }
}

function objectOf<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' ? (value as Record<string, T>) : {}
}

/**
 * Merge stored global config over the code-level defaults (D-17). A partially
 * populated `/config` is normal — the admin panel writes one key at a time —
 * so every field falls back independently.
 */
export function mergeConfig(raw: unknown): AppConfig {
  const node = objectOf<unknown>(raw)

  const categories = (value: unknown, fallback: ConfigCategory[]): ConfigCategory[] => {
    const entries = Object.entries(objectOf<Record<string, unknown>>(value))
    if (entries.length === 0) return fallback
    return entries
      .map(([id, v], i) => ({
        id,
        name: typeof v['name'] === 'string' ? v['name'] : id,
        colorToken: (typeof v['colorToken'] === 'string'
          ? v['colorToken']
          : 'cat-none') as ConfigCategory['colorToken'],
        order: typeof v['order'] === 'number' ? v['order'] : i,
      }))
      .sort((a, b) => a.order - b.order)
  }

  const strings = (value: unknown, fallback: string[]): string[] => {
    const list = toList(value as never)
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v !== '')
    return list.length > 0 ? list : fallback
  }

  const names = (value: unknown, fallback: string[]): string[] => {
    const list = Object.values(objectOf<RawNamed>(value))
      .map((v) => (typeof v?.name === 'string' ? v.name.trim() : ''))
      .filter((v) => v !== '')
    return list.length > 0 ? list : fallback
  }

  return {
    workoutCategories: categories(
      node['workoutCategories'],
      CONFIG_DEFAULTS.workoutCategories,
    ),
    runTypes: categories(node['runTypes'], CONFIG_DEFAULTS.runTypes),
    muscleGroups: strings(node['muscleGroups'], CONFIG_DEFAULTS.muscleGroups),
    repBasedExercises: strings(
      node['repBasedExercises'],
      CONFIG_DEFAULTS.repBasedExercises,
    ),
    shoes: names(node['shoes'], CONFIG_DEFAULTS.shoes),
    watches: names(node['watches'], CONFIG_DEFAULTS.watches),
  }
}

/** Normalize a whole raw profile plus the global config into app types. */
export function buildProfile(rawProfile: RawProfile, rawConfig: unknown): LoadResult {
  const config = mergeConfig(rawConfig)

  const workoutEntries = Object.entries(objectOf<RawWorkout>(rawProfile.workouts))
  const runEntries = Object.entries(objectOf<RawRun>(rawProfile.runs))

  const workouts: Workout[] = []
  for (const [id, raw] of workoutEntries) {
    const w = normalizeWorkout(id, raw)
    if (w) workouts.push(w)
  }

  const runs: Run[] = []
  for (const [id, raw] of runEntries) {
    const r = normalizeRun(id, raw)
    if (r) runs.push(r)
  }

  // start_time is the ONLY ordering authority. Keys are opaque strings — 37 of
  // them are numeric from an original import and push IDs are not chronological
  // relative to them, so sorting by key would scramble history (§3.1).
  const newestFirst = (a: { startTime: Date }, b: { startTime: Date }) =>
    b.startTime.getTime() - a.startTime.getTime()
  workouts.sort(newestFirst)
  runs.sort(newestFirst)

  const baseCatalog = objectOf<RawExerciseCatalogEntry>(
    objectOf<unknown>(rawConfig)['exercises'],
  )
  const ownCatalog = objectOf<RawExerciseCatalogEntry>(rawProfile.exercises)

  return {
    profile: {
      workouts,
      runs,
      exercises: mergeExerciseCatalog(baseCatalog, ownCatalog),
      places: normalizePlaces(objectOf<RawNamed>(rawProfile.gyms)),
      people: normalizePeople(objectOf<RawNamed>(rawProfile.people)),
      settings: normalizeSettings(rawProfile.settings),
    },
    config,
    dropped: {
      workouts: workoutEntries.length - workouts.length,
      runs: runEntries.length - runs.length,
    },
  }
}

/**
 * Load one profile and the global config.
 *
 * Two reads, in parallel. `/config` is readable by any provisioned account; the
 * profile is readable by its owner or by a guest pointed at it. A denied read
 * throws, and the caller renders an error state rather than an empty app —
 * "no data" and "not allowed" must never look the same.
 */
export async function loadProfile(profileUid: string): Promise<LoadResult> {
  const [profileSnap, configSnap] = await Promise.all([
    get(ref(db(), `users/${profileUid}`)),
    get(ref(db(), 'config')),
  ])

  const rawProfile = (profileSnap.exists() ? profileSnap.val() : {}) as RawProfile
  const rawConfig: unknown = configSnap.exists() ? configSnap.val() : {}

  return buildProfile(rawProfile, rawConfig)
}
