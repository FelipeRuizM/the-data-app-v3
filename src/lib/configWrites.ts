import { push, ref, update } from 'firebase/database'
import { db } from './firebase'
import { loadCascadeSource } from './settingsWrites'
import { planCategoryRename, type CategoryField } from './cascade'
import { CATEGORY_TOKENS } from '../components/ui/tokens'
import type { ConfigCategory } from './config'

/**
 * Writes to the global `/config` node — the admin panel's half of the settings
 * split (D-17b).
 *
 * The rules already gate this: `/config` is writable only by an account whose
 * `/roles` entry says `admin`. The route guard and the hidden nav link are the
 * courtesy; this path failing for a non-admin is the actual boundary.
 *
 * Nothing here is written until an explicit edit — `CONFIG_DEFAULTS` in
 * `config.ts` is what makes the app work on an empty `/config`, and a startup
 * migration that materialized them would be exactly what D-17 forbids.
 */

function newKey(path: string): string {
  const key = push(ref(db(), path)).key
  if (!key) throw new Error('Firebase did not return a push key')
  return key
}

/* ── plain string lists ─────────────────────────────────────────────────── */

export type StringListKey = 'muscleGroups' | 'repBasedExercises'

/**
 * Written whole, as an array. These are short, ordered, and nothing references
 * a member by key — the list IS the value.
 */
export async function saveStringList(
  key: StringListKey,
  values: string[],
): Promise<void> {
  await update(ref(db()), { [`config/${key}`]: values })
}

/* ── named catalogs: shoes, watches ─────────────────────────────────────── */

export type CatalogKey = 'shoes' | 'watches'

/**
 * Also written whole, but as `{ pushId: { name } }` to match the shape §3.5
 * specifies.
 *
 * Fresh keys are generated each save, which looks wasteful until you notice
 * that **nothing references a shoe or watch by id** — a run stores the name
 * string, like every other join here (§3.7). The ids carry no meaning, so
 * regenerating them costs nothing and keeps this a single write.
 */
export async function saveNamedCatalog(
  key: CatalogKey,
  names: string[],
): Promise<void> {
  const node: Record<string, { name: string }> = {}
  for (const name of names) {
    const trimmed = name.trim()
    if (trimmed === '') continue
    node[newKey(`config/${key}`)] = { name: trimmed }
  }
  await update(ref(db()), { [`config/${key}`]: node })
}

/**
 * Append one name to a catalog, if it isn't already there (D-52).
 *
 * The log forms let you type a shoe or watch that doesn't exist yet, and this
 * is what puts it in the vocabulary rather than leaving a name nothing else
 * knows about. It rewrites the whole node, exactly like `saveNamedCatalog` —
 * see the note there for why regenerating the ids is free.
 */
export async function ensureCatalogEntry(
  key: CatalogKey,
  name: string,
  existing: readonly string[],
): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '' || existing.includes(trimmed)) return
  await saveNamedCatalog(key, [...existing, trimmed])
}

/* ── categories and run types ───────────────────────────────────────────── */

export type CategoryKey = 'workoutCategories' | 'runTypes'

/** Which record field carries this vocabulary, denormalized (§3.1, §3.2). */
const FIELD_FOR: Record<CategoryKey, CategoryField> = {
  workoutCategories: 'category',
  runTypes: 'runType',
}

/**
 * Per-entry writes, unlike the catalogs above — these DO have meaningful ids.
 * An entry's colour and order have to survive a rename, and a rename has to
 * find the same row afterwards.
 */
export async function saveCategory(
  key: CategoryKey,
  category: ConfigCategory,
): Promise<void> {
  const id = category.id.trim() === '' ? newKey(`config/${key}`) : category.id
  await update(ref(db()), {
    [`config/${key}/${id}`]: {
      name: category.name.trim(),
      colorToken: category.colorToken,
      order: category.order,
    },
  })
}

/**
 * Create a category typed into a log form, if that name is new (D-52).
 *
 * Returns the row's id so the record can carry `category_id` / `type_id` on the
 * very first save (D-42), rather than waiting for the next edit to pick it up.
 * An existing name returns its existing id and writes nothing.
 *
 * The colour is the first token not already in use, falling back to cycling
 * once all six are taken — §5 fixes the categorical palette at six, and a
 * seventh split reusing a hue is better than inventing an off-system one.
 */
export async function ensureCategory(
  key: CategoryKey,
  name: string,
  existing: readonly ConfigCategory[],
): Promise<string | null> {
  const trimmed = name.trim()
  if (trimmed === '') return null

  const match = existing.find((c) => c.name === trimmed)
  if (match) return match.id

  const used = new Set(existing.map((c) => c.colorToken))
  const colorToken =
    CATEGORY_TOKENS.find((t) => !used.has(t)) ??
    CATEGORY_TOKENS[existing.length % CATEGORY_TOKENS.length]!

  const id = newKey(`config/${key}`)
  await update(ref(db()), {
    [`config/${key}/${id}`]: {
      name: trimmed,
      colorToken,
      order: existing.length,
    },
  })
  return id
}

/** Reorder in one write, so a drag from bottom to top isn't six round trips. */
export async function saveCategoryOrder(
  key: CategoryKey,
  categories: ConfigCategory[],
): Promise<void> {
  const updates: Record<string, unknown> = {}
  categories.forEach((c, order) => {
    updates[`config/${key}/${c.id}/order`] = order
  })
  await update(ref(db()), updates)
}

/**
 * Rename a category, and rewrite the admin's own records that carry the old
 * name — one atomic update covering both (D-32).
 *
 * Records in OTHER profiles are not rewritten and cannot be: the rules let an
 * account write only its own subtree. Those records keep the old name and
 * render neutral, which §4 requires never to be an error state. The caller
 * states this in the confirm rather than hiding it.
 */
export async function renameCategory(
  uid: string,
  key: CategoryKey,
  category: ConfigCategory,
  newName: string,
): Promise<{ records: number }> {
  const trimmed = newName.trim()
  if (trimmed === '') throw new Error('A name is required.')
  if (trimmed === category.name) return { records: 0 }

  const source = await loadCascadeSource(uid)
  const plan = planCategoryRename(source, FIELD_FOR[key], category.name, trimmed)

  await update(ref(db()), {
    ...plan.updates,
    [`config/${key}/${category.id}`]: {
      name: trimmed,
      colorToken: category.colorToken,
      order: category.order,
    },
  })

  return { records: plan.records }
}

/**
 * Delete a category.
 *
 * NOT blocked while referenced, unlike an exercise or a place (D-5). The
 * difference is what happens to the record: a workout whose category no longer
 * exists is still a complete workout, and §4 already requires it to degrade to
 * `--cat-none` rather than break. Nothing is lost, so nothing needs preventing
 * — the confirm just says how many of the admin's own records will go neutral.
 */
export async function deleteCategory(key: CategoryKey, id: string): Promise<void> {
  await update(ref(db()), { [`config/${key}/${id}`]: null })
}

/** How many of the admin's own records carry this name, for the confirm. */
export async function countCategoryUses(
  uid: string,
  key: CategoryKey,
  name: string,
): Promise<number> {
  const source = await loadCascadeSource(uid)
  return planCategoryRename(source, FIELD_FOR[key], name, name).records
}

/* ── the global base exercise catalog (D-20) ────────────────────────────── */

/**
 * Add a base exercise, or re-file an existing one into a different muscle
 * group. Both are safe: neither changes a name any record joins on.
 *
 * There is deliberately **no rename and no delete here** — see D-31. Both
 * would have to rewrite history in every profile, and the rules let an admin
 * write only its own subtree. They are console operations, not app features.
 */
export async function saveBaseExercise(
  id: string | null,
  name: string,
  muscleGroup: string,
): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('A name is required.')
  const key = id ?? newKey('config/exercises')
  await update(ref(db()), {
    [`config/exercises/${key}`]: { name: trimmed, muscleGroup },
  })
}
