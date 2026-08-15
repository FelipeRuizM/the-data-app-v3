import { get, push, ref, update } from 'firebase/database'
import { db } from './firebase'
import {
  ENTITY_LABEL,
  ENTITY_NODE,
  countReferences,
  planRename,
  type CascadeSource,
  type EntityKind,
} from './cascade'
import type { RawRun, RawSettings, RawWorkout } from '../types'

/**
 * Writes for the per-account Settings page (§4, D-17b).
 *
 * Everything here targets `/users/{uid}` — a user's own subtree and nothing
 * else. Global vocabulary lives in `/config` and is the admin panel's business
 * (Phase 13); nothing in this module can reach it, which is the point.
 *
 * Every mutation is a single multi-path `update()`, including the deletes
 * (written as `null`). That is not stylistic: a rename has to move the catalog
 * row and rewrite the history that references it in ONE operation, or a refresh
 * mid-save leaves records pointing at a name that no longer exists (D-5).
 */

/** Thrown when a delete would orphan history. Carries the count so the UI can say it. */
export class EntityReferencedError extends Error {
  readonly kind: EntityKind
  readonly entityName: string
  readonly records: number

  constructor(kind: EntityKind, entityName: string, records: number) {
    super(
      `“${entityName}” is used by ${records} record${records === 1 ? '' : 's'}. ` +
        `Deleting a referenced ${ENTITY_LABEL[kind]} would destroy log history — rename or merge it instead.`,
    )
    // `name` on an Error is the error's class, not the entity's — hence
    // `entityName`. Conflating them would make the message unreadable.
    this.name = 'EntityReferencedError'
    this.kind = kind
    this.entityName = entityName
    this.records = records
  }
}

function newKey(path: string): string {
  const key = push(ref(db(), path)).key
  if (!key) throw new Error('Firebase did not return a push key')
  return key
}

/**
 * The raw nodes a cascade reads.
 *
 * Fetched fresh at the moment of the write rather than reused from the loaded
 * profile: the profile is normalized (dense arrays, resolved names) and the
 * cascade needs the wire shape to address individual paths. Three targeted
 * reads, not one read of the whole subtree.
 */
export async function loadCascadeSource(uid: string): Promise<CascadeSource> {
  const [workouts, runs, settings] = await Promise.all([
    get(ref(db(), `users/${uid}/workouts`)),
    get(ref(db(), `users/${uid}/runs`)),
    get(ref(db(), `users/${uid}/settings`)),
  ])
  return {
    uid,
    workouts: (workouts.exists() ? workouts.val() : {}) as Record<string, RawWorkout>,
    runs: (runs.exists() ? runs.val() : {}) as Record<string, RawRun>,
    settings: (settings.exists() ? settings.val() : undefined) as
      RawSettings | undefined,
  }
}

/* ── settings ───────────────────────────────────────────────────────────── */

/**
 * Write specific settings keys, leaving every other key untouched.
 *
 * Per-key rather than whole-node, so saving a units toggle can never clobber a
 * featured list edited in another tab. Nothing is written until an explicit
 * edit — there is no startup migration that materializes defaults (§3.5).
 */
export async function saveSettings(
  uid: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    updates[`users/${uid}/settings/${key}`] = value
  }
  await update(ref(db()), updates)
}

/* ── catalog entities: exercises, places, people ────────────────────────── */

export type EntityDraft = {
  name: string
  /** Exercises only. */
  muscleGroup?: string
}

/**
 * Create an entry in the user's OWN tier. Creating an exercise never touches
 * `/config/exercises` — that is the shared base catalog (D-20).
 */
export async function createEntity(
  uid: string,
  kind: EntityKind,
  draft: EntityDraft,
): Promise<string> {
  const node = ENTITY_NODE[kind]
  const path = `users/${uid}/${node}`
  const id = newKey(path)
  const value =
    kind === 'exercise'
      ? { name: draft.name, muscleGroup: draft.muscleGroup ?? 'Other' }
      : { name: draft.name }
  await update(ref(db()), { [`${path}/${id}`]: value })
  return id
}

/**
 * Re-file an exercise into a different muscle group.
 *
 * For a base-tier exercise this writes a USER-TIER entry with the same name —
 * the merge is by name and the user's entry wins, so it shadows the shared one
 * without an admin and without mutating data other accounts read (D-20). No
 * cascade: no record stores a muscle group, only the exercise name.
 */
export async function setExerciseMuscleGroup(
  uid: string,
  exercise: { id: string; name: string; tier: 'base' | 'user' },
  muscleGroup: string,
): Promise<void> {
  const path = `users/${uid}/exercises`
  const id = exercise.tier === 'user' ? exercise.id : newKey(path)
  await update(ref(db()), {
    [`${path}/${id}`]: { name: exercise.name, muscleGroup },
  })
}

/**
 * Count what a rename or delete would touch, for the confirm dialog (D-5).
 * Read-only — nothing is written by asking.
 */
export async function countEntityReferences(
  uid: string,
  kind: EntityKind,
  name: string,
): Promise<{ records: number; workouts: number; runs: number; featured: boolean }> {
  return countReferences(await loadCascadeSource(uid), kind, name)
}

/**
 * Rename an entity and rewrite every record that mentions it — one atomic
 * multi-path update covering both the catalog row and the history (D-5).
 *
 * The plan is recomputed here rather than carried over from the confirm
 * dialog's count, so the write always reflects the database as it is now.
 */
export async function renameEntity(
  uid: string,
  kind: EntityKind,
  entity: { id: string; muscleGroup?: string },
  oldName: string,
  newName: string,
): Promise<{ records: number }> {
  const trimmed = newName.trim()
  if (trimmed === '') throw new Error('A name is required.')
  if (trimmed === oldName) return { records: 0 }

  const source = await loadCascadeSource(uid)
  const plan = planRename(source, kind, oldName, trimmed)

  const node = ENTITY_NODE[kind]
  const row =
    kind === 'exercise'
      ? { name: trimmed, muscleGroup: entity.muscleGroup ?? 'Other' }
      : { name: trimmed }

  await update(ref(db()), {
    ...plan.updates,
    [`users/${uid}/${node}/${entity.id}`]: row,
  })

  return { records: plan.records }
}

/**
 * "Rename and merge" — the answer D-5 gives instead of a cascading delete.
 *
 * Every record referencing `sourceName` is rewritten to `targetName`, and the
 * source's catalog row is removed, in one update. History is preserved; only
 * the duplicate vocabulary entry disappears.
 */
export async function mergeEntity(
  uid: string,
  kind: EntityKind,
  source: { id: string; name: string },
  targetName: string,
): Promise<{ records: number }> {
  const target = targetName.trim()
  if (target === '') throw new Error('Choose what to merge into.')
  if (target === source.name) throw new Error('Cannot merge something into itself.')

  const raw = await loadCascadeSource(uid)
  const plan = planRename(raw, kind, source.name, target)

  await update(ref(db()), {
    ...plan.updates,
    // The target already exists in the catalog under its own key; only the
    // now-redundant source row goes.
    [`users/${uid}/${ENTITY_NODE[kind]}/${source.id}`]: null,
  })

  return { records: plan.records }
}

/**
 * Delete — **blocked while anything references it** (D-5).
 *
 * The check runs here, at the write boundary, not only in the dialog. A UI
 * guard is a courtesy; this is the code that actually cannot be talked into
 * orphaning a workout.
 */
export async function deleteEntity(
  uid: string,
  kind: EntityKind,
  entity: { id: string; name: string },
): Promise<void> {
  const source = await loadCascadeSource(uid)
  const refs = countReferences(source, kind, entity.name)
  if (refs.records > 0) {
    throw new EntityReferencedError(kind, entity.name, refs.records)
  }

  const updates: Record<string, unknown> = {
    [`users/${uid}/${ENTITY_NODE[kind]}/${entity.id}`]: null,
  }

  // Unreferenced by history, but possibly still on the shortlist — that is
  // curation, so it is cleaned up rather than treated as a blocker.
  if (refs.featured) {
    const plan = planRename(source, kind, entity.name, entity.name)
    const featuredPath = `users/${uid}/settings/featuredExercises`
    const current = plan.updates[featuredPath]
    if (Array.isArray(current)) {
      updates[featuredPath] = current.filter((n) => n !== entity.name)
    }
  }

  await update(ref(db()), updates)
}
