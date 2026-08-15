import type { CategoryToken } from '../components/ui/tokens'

/**
 * Global app vocabulary — the `/config` node, edited only in the admin panel
 * (D-17b). Everything here ships as a CODE-LEVEL DEFAULT so the app works
 * before anyone has opened the admin panel, and so a newly invited account
 * works immediately.
 *
 * Nothing is written to the database until a first explicit edit. **Never a
 * startup migration** (D-17).
 *
 * Colours are stored as PALETTE TOKEN IDS, never hexes. That is what keeps
 * "no raw hex in components" true even for owner-chosen colours (§5).
 */

export type ConfigCategory = {
  id: string
  name: string
  colorToken: CategoryToken
  order: number
}

export type AppConfig = {
  workoutCategories: ConfigCategory[]
  runTypes: ConfigCategory[]
  muscleGroups: string[]
  repBasedExercises: string[]
  shoes: string[]
  watches: string[]
}

/** The three splits currently in the data. The owner will change these. */
const DEFAULT_WORKOUT_CATEGORIES: ConfigCategory[] = [
  { id: 'push', name: 'Push', colorToken: 'cat-1', order: 0 },
  { id: 'pull', name: 'Pull', colorToken: 'cat-2', order: 1 },
  { id: 'legs', name: 'Legs', colorToken: 'cat-3', order: 2 },
]

/** Only `Other` and `Light` exist in the export. */
const DEFAULT_RUN_TYPES: ConfigCategory[] = [
  { id: 'other', name: 'Other', colorToken: 'cat-4', order: 0 },
  { id: 'light', name: 'Light', colorToken: 'cat-5', order: 1 },
]

/**
 * Six groups exist in the data; `Core` is the seventh, added by D-4. Nothing is
 * reassigned automatically — the owner re-files exercises in the admin panel.
 */
const DEFAULT_MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Other',
]

/**
 * Drives the reps-only ranking for bodyweight exercises (§6.1, D-6). Editable
 * in the admin panel; these five are the starting point.
 */
const DEFAULT_REP_BASED_EXERCISES = [
  'Pull Up',
  'Chin Up',
  'Dip',
  'Push Up',
  'Muscle Up',
]

export const CONFIG_DEFAULTS: AppConfig = {
  workoutCategories: DEFAULT_WORKOUT_CATEGORIES,
  runTypes: DEFAULT_RUN_TYPES,
  muscleGroups: DEFAULT_MUSCLE_GROUPS,
  repBasedExercises: DEFAULT_REP_BASED_EXERCISES,
  shoes: ['Adidas Ultraboost 21'],
  watches: ['Apple Watch Series 8'],
}

/**
 * Groups excluded from the monthly radar chart, because they distort the
 * balance shape (§7 Layer 2).
 */
export const RADAR_EXCLUDED_GROUPS = ['Core', 'Other', 'Unknown']

/**
 * Resolve a category NAME (as denormalized onto each record) to its palette
 * token. An unknown or deleted category degrades to the neutral — never an
 * error state (§4).
 */
export function colorTokenFor(
  categories: ConfigCategory[],
  name: string | null,
): string {
  if (!name) return 'cat-none'
  return categories.find((c) => c.name === name)?.colorToken ?? 'cat-none'
}
