import { push, ref, remove, update } from 'firebase/database'
import { db } from './firebase'
import type { RawRun, RawWorkout } from '../types'

/**
 * The write path. Deliberately thin — validation and shaping already happened
 * in `workoutDraft.ts`; this module only talks to Firebase.
 *
 * New places and people are created in the SAME atomic multi-path `update()`
 * as the workout itself, the same pattern D-5 specifies for the rename
 * cascade: one write, not several, so a page refresh mid-save can never leave
 * a workout referencing a place that doesn't exist in the profile's own list.
 */

/**
 * A client-generated push key, without writing anything yet.
 *
 * Exported because the caller sometimes needs the id BEFORE the write: an
 * exercise typed into the log form has to exist in the id map by the time
 * `buildRawWorkout` stamps `exercise_id` (D-40), which happens before this
 * module is reached.
 */
export function newKey(path: string): string {
  const key = push(ref(db(), path)).key
  if (!key) throw new Error('Firebase did not return a push key')
  return key
}

/** An exercise typed into a log form, already keyed by the caller (D-52). */
export type NewExercise = { id: string; name: string; muscleGroup: string }

export type SaveParams<T> = {
  uid: string
  /** Present when editing; absent when creating. */
  id?: string | null
  raw: T
  /** Place/person names not already in the profile's own lists (§4 "create-on-the-fly"). */
  newPlaces: string[]
  newPeople: string[]
  /**
   * Written into the user's OWN tier, never `/config` (D-20) — creating an
   * exercise must not touch shared vocabulary.
   */
  newExercises?: NewExercise[]
}

/**
 * Shared because it is genuinely the same operation on a different path —
 * unlike the filter and draft modules, where workouts and runs differ in
 * substance. The only variable here is the collection name.
 */
async function saveRecord<T>(
  collection: 'workouts' | 'runs',
  params: SaveParams<T>,
): Promise<{ id: string }> {
  const { uid, id, raw, newPlaces, newPeople, newExercises = [] } = params
  const updates: Record<string, unknown> = {}

  for (const name of newPlaces) {
    updates[`users/${uid}/gyms/${newKey(`users/${uid}/gyms`)}`] = { name }
  }
  for (const name of newPeople) {
    updates[`users/${uid}/people/${newKey(`users/${uid}/people`)}`] = { name }
  }
  for (const exercise of newExercises) {
    updates[`users/${uid}/exercises/${exercise.id}`] = {
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
    }
  }

  const recordId = id ?? newKey(`users/${uid}/${collection}`)
  updates[`users/${uid}/${collection}/${recordId}`] = raw

  await update(ref(db()), updates)
  return { id: recordId }
}

export const saveWorkout = (params: SaveParams<RawWorkout>) =>
  saveRecord('workouts', params)

export const saveRun = (params: SaveParams<RawRun>) => saveRecord('runs', params)

export async function deleteWorkout(uid: string, id: string): Promise<void> {
  await remove(ref(db(), `users/${uid}/workouts/${id}`))
}

export async function deleteRun(uid: string, id: string): Promise<void> {
  await remove(ref(db(), `users/${uid}/runs/${id}`))
}

/** Names present in `values` but not already in `existing` — case-sensitive, matching how joins work everywhere else (§3.7). */
export function namesNotIn(
  values: readonly string[],
  existing: readonly string[],
): string[] {
  const known = new Set(existing)
  const seen = new Set<string>()
  const result: string[] = []
  for (const v of values) {
    const trimmed = v.trim()
    if (trimmed === '' || known.has(trimmed) || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}
