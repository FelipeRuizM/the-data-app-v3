import { toList } from './normalize'
import type { RawList, RawRun, RawSettings, RawWorkout } from '../types'

/**
 * The rename cascade (D-5).
 *
 * Joins in this database are by NAME STRING, denormalized (§3.7). So renaming
 * an exercise, a place or a person is not a one-row edit — every historical
 * record that mentions the old name has to be rewritten in the same breath, or
 * the rename silently orphans history.
 *
 * D-5: renames cascade in **one atomic multi-path update**, behind a confirm
 * stating the affected record count. Deleting something still referenced is
 * **blocked** — a cascading delete would destroy log history — with "rename and
 * merge" offered instead.
 *
 * This module is pure: it takes RAW database nodes and returns a plan. It never
 * touches Firebase, so every rule below is unit-testable against the fixture.
 *
 * **Why raw, not normalized.** The plan addresses individual paths like
 * `workouts/{id}/exercises/2/exercise_title`, and those indices must be the
 * DATABASE's keys. The normalized `Workout` has a dense, re-sorted, null-filtered
 * exercise array (§3.8), so its indices can differ from the stored ones — writing
 * against them would rename the wrong exercise. The cascade is the one operation
 * that legitimately needs the wire shape.
 */

export type EntityKind = 'exercise' | 'place' | 'person'

/**
 * The DB node behind each UI concept. `gyms` is "places" in the UI and stays
 * `gyms` in the database forever — the rename lives in the parse layer, not in
 * the data (§3.4).
 */
export const ENTITY_NODE: Record<EntityKind, 'exercises' | 'gyms' | 'people'> = {
  exercise: 'exercises',
  place: 'gyms',
  person: 'people',
}

export const ENTITY_LABEL: Record<EntityKind, string> = {
  exercise: 'exercise',
  place: 'place',
  person: 'person',
}

/** The raw nodes a cascade has to look at. Deliberately not the whole profile. */
export type CascadeSource = {
  uid: string
  workouts: Record<string, RawWorkout>
  runs: Record<string, RawRun>
  settings: RawSettings | undefined
}

export type CascadePlan = {
  /** Absolute paths from the database root → new value. One atomic `update()`. */
  updates: Record<string, unknown>
  /** Workouts touched. */
  workouts: number
  /** Runs touched. */
  runs: number
  /** Records touched — the number the confirm dialog states (D-5). */
  records: number
  /** Whether the curated featured list also changes. Not a record. */
  featured: boolean
}

/**
 * Entries with their DATABASE keys intact.
 *
 * `toList` deliberately throws keys away — everything downstream of the parse
 * layer wants a dense array. Here the key IS the address being written to, so
 * this is the one place that keeps it. An array's keys are its indices; a
 * sparse node comes back from RTDB as an object with numeric-string keys (§3.8)
 * and both are handled the same way.
 */
export function rawEntries<T>(value: RawList<T>): Array<[string, T]> {
  if (value == null) return []
  const entries: Array<[string, T]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, T])
    : Object.entries(value)
  return entries.filter(([, v]) => v != null)
}

/** Replace `oldName` with `newName`, collapsing a duplicate the swap creates. */
function replaceInList(names: string[], oldName: string, newName: string): string[] {
  const out: string[] = []
  for (const n of names) {
    const next = n === oldName ? newName : n
    // A merge can make two entries identical — "Ana" and "Ana Silva" on the
    // same workout. Keeping both would leave a person listed twice.
    if (!out.includes(next)) out.push(next)
  }
  return out
}

function stringList(value: RawList<string>): string[] {
  return rawEntries(value)
    .map(([, v]) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v !== '')
}

/**
 * Every place a name appears in history and curation, with the rewrite for it.
 *
 * Passing `newName === oldName` makes this a pure counting pass, which is how
 * the delete guard asks "is this still referenced?" without duplicating the
 * traversal — the count and the write can never disagree about what a reference
 * is, because they are the same code.
 */
function collect(
  source: CascadeSource,
  kind: EntityKind,
  oldName: string,
  newName: string,
): CascadePlan {
  const base = `users/${source.uid}`
  const updates: Record<string, unknown> = {}
  let workouts = 0
  let runs = 0
  let featured = false

  for (const [wid, w] of Object.entries(source.workouts ?? {})) {
    let touched = false

    if (kind === 'exercise') {
      for (const [key, entry] of rawEntries(w.exercises)) {
        if (entry?.exercise_title !== oldName) continue
        updates[`${base}/workouts/${wid}/exercises/${key}/exercise_title`] = newName
        touched = true
      }
    } else if (kind === 'place') {
      if (w.gym === oldName) {
        updates[`${base}/workouts/${wid}/gym`] = newName
        touched = true
      }
    } else {
      const names = stringList(w.people)
      if (names.includes(oldName)) {
        // The whole list is rewritten rather than the one index, so a merge
        // that collides with a name already on the record collapses instead of
        // duplicating. Writes go back as arrays (§3.8).
        updates[`${base}/workouts/${wid}/people`] = replaceInList(
          names,
          oldName,
          newName,
        )
        touched = true
      }
    }

    if (touched) workouts++
  }

  for (const [rid, r] of Object.entries(source.runs ?? {})) {
    let touched = false

    if (kind === 'place') {
      // A run's `location` resolves against the same places table (§3.4).
      if (r.location === oldName) {
        updates[`${base}/runs/${rid}/location`] = newName
        touched = true
      }
    } else if (kind === 'person') {
      const names = stringList(r.people)
      if (names.includes(oldName)) {
        updates[`${base}/runs/${rid}/people`] = replaceInList(names, oldName, newName)
        touched = true
      }
    }
    // Runs have no exercises — nothing to do for that kind.

    if (touched) runs++
  }

  if (kind === 'exercise') {
    const list = toList(source.settings?.featuredExercises)
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter((n) => n !== '')
    if (list.includes(oldName)) {
      // Curation, not history — rewritten whole, and it does NOT count as an
      // affected record. Saying "12 records" when 11 are workouts and one is a
      // shortlist entry would overstate the blast radius.
      updates[`${base}/settings/featuredExercises`] = replaceInList(
        list,
        oldName,
        newName,
      )
      featured = true
    }
  }

  return { updates, workouts, runs, records: workouts + runs, featured }
}

/**
 * The multi-path update that renames `oldName` to `newName` everywhere.
 *
 * Does NOT include the catalog row itself — that is the entity, not a
 * reference to it. The caller merges the row's own write into the same
 * `update()` so the whole rename stays one atomic operation.
 */
export function planRename(
  source: CascadeSource,
  kind: EntityKind,
  oldName: string,
  newName: string,
): CascadePlan {
  return collect(source, kind, oldName, newName)
}

/** How much history depends on this name. Zero is what makes a delete legal (D-5). */
export function countReferences(
  source: CascadeSource,
  kind: EntityKind,
  name: string,
): { records: number; workouts: number; runs: number; featured: boolean } {
  const { records, workouts, runs, featured } = collect(source, kind, name, name)
  return { records, workouts, runs, featured }
}

/**
 * Categories and run types are ALSO stored denormalized, as a name on each
 * record (`workouts/{id}/category`, `runs/{id}/type`) — so renaming one in the
 * admin panel has the same orphaning problem as renaming an exercise.
 *
 * Unlike exercises, the vocabulary itself is global while the records are
 * per-profile, and the rules let an admin write only their own subtree. So this
 * cascade covers the ADMIN'S OWN profile and says so; other profiles keep the
 * old name and degrade to `--cat-none`, which §4 already requires never to be
 * an error state (D-32).
 */
export type CategoryField = 'category' | 'runType'

export function planCategoryRename(
  source: CascadeSource,
  field: CategoryField,
  oldName: string,
  newName: string,
): CascadePlan {
  const base = `users/${source.uid}`
  const updates: Record<string, unknown> = {}
  let workouts = 0
  let runs = 0

  if (field === 'category') {
    for (const [wid, w] of Object.entries(source.workouts ?? {})) {
      if (w.category !== oldName) continue
      updates[`${base}/workouts/${wid}/category`] = newName
      workouts++
    }
  } else {
    for (const [rid, r] of Object.entries(source.runs ?? {})) {
      if (r.type !== oldName) continue
      updates[`${base}/runs/${rid}/type`] = newName
      runs++
    }
  }

  return { updates, workouts, runs, records: workouts + runs, featured: false }
}

/** A human sentence for the confirm dialog — the count is the whole point (D-5). */
export function describeImpact(plan: {
  workouts: number
  runs: number
  records: number
}): string {
  if (plan.records === 0) return 'No logged records mention it.'
  const parts: string[] = []
  if (plan.workouts > 0)
    parts.push(`${plan.workouts} workout${plan.workouts === 1 ? '' : 's'}`)
  if (plan.runs > 0) parts.push(`${plan.runs} run${plan.runs === 1 ? '' : 's'}`)
  return `${parts.join(' and ')} will be rewritten.`
}
