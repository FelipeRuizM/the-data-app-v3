import { formatDistance, formatVolume } from '../lib/units'
import { colorTokenFor, type AppConfig } from '../lib/config'
import { workoutVolumeKg } from '../lib/normalize'
import type { ActivityItem, Profile } from '../types'

/**
 * THE CATEGORY REGISTRY (CLAUDE.md §1).
 *
 * Home's log buttons, the nav, and every cross-category aggregator ITERATE this
 * list. They must never hardcode `"workouts"` / `"runs"`. Adding "Flights"
 * later means adding a module and one entry here — not touching Home, nav, or
 * Analytics.
 *
 * Do NOT over-abstract past this. Two concrete implementations plus a registry.
 * No plugin framework, no generic schema engine. Workouts and Runs have
 * genuinely different shapes and are allowed genuinely different components.
 */
export type CategoryDefinition = {
  id: string
  /** Plural, for nav and headings. */
  label: string
  /** Singular, for the log button: "Log a workout". */
  labelSingular: string
  basePath: string
  newPath: string
  /** How many records this category holds for a profile. */
  count: (profile: Profile) => number
  /** Flatten this category's records into the shared activity shape. */
  toActivity: (profile: Profile, config: AppConfig) => ActivityItem[]
}

const workouts: CategoryDefinition = {
  id: 'workouts',
  label: 'Workouts',
  labelSingular: 'workout',
  basePath: '/workouts',
  newPath: '/workouts/new',
  count: (p) => p.workouts.length,
  toActivity: (profile, config) =>
    profile.workouts.map((w) => ({
      id: w.id,
      categoryId: 'workouts',
      title: w.title,
      startTime: w.startTime,
      label: w.category,
      colorToken: colorTokenFor(config.workoutCategories, w.category),
      metric: formatVolume(
        workoutVolumeKg(w, profile.settings.bodyweightKg),
        profile.settings.units,
      ),
      durationMinutes: w.durationMinutes,
    })),
}

const runs: CategoryDefinition = {
  id: 'runs',
  label: 'Runs',
  labelSingular: 'run',
  basePath: '/runs',
  newPath: '/runs/new',
  count: (p) => p.runs.length,
  toActivity: (profile, config) =>
    profile.runs.map((r) => ({
      id: r.id,
      categoryId: 'runs',
      title: r.title,
      startTime: r.startTime,
      label: r.type,
      colorToken: colorTokenFor(config.runTypes, r.type),
      metric: formatDistance(r.distanceKm),
      durationMinutes: r.durationMinutes,
    })),
}

export const CATEGORIES: CategoryDefinition[] = [workouts, runs]

export function categoryById(id: string): CategoryDefinition | undefined {
  return CATEGORIES.find((c) => c.id === id)
}

/**
 * Every category's records on one timeline, newest first. This is what Home and
 * Analytics consume — neither knows how many categories exist.
 */
export function recentActivity(
  profile: Profile,
  config: AppConfig,
  limit?: number,
): ActivityItem[] {
  const all = CATEGORIES.flatMap((c) => c.toActivity(profile, config)).sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  )
  return limit == null ? all : all.slice(0, limit)
}

/** Total records across every category — the "is this profile empty?" question. */
export function totalRecords(profile: Profile): number {
  return CATEGORIES.reduce((n, c) => n + c.count(profile), 0)
}
