/**
 * Stamp `category_id` on workouts and `type_id` on runs (D-42).
 *
 *   node scripts/add-category-ids.mjs            # dry run, writes nothing
 *   node scripts/add-category-ids.mjs --apply
 *
 * ADDITIVE, exactly like `add-exercise-ids.mjs`: the id is written alongside
 * the stored name and nothing is removed, so §0.3 holds, a half-finished run
 * leaves a working app, and the whole change is undone by deleting one field.
 *
 * What it buys, and why this one is worth doing where places and people are
 * not: workout categories and run types are GLOBAL vocabulary in `/config`,
 * but the records referencing them are per-profile. The rules let an account
 * write only its own subtree, so an admin renaming a category could previously
 * only ever fix their own history (D-32) — every other profile kept the stale
 * name and degraded to neutral. With an id, the rename is one write in
 * `/config` and every record carrying that id follows it, in every profile,
 * with nobody's subtree touched.
 *
 * SELF-HEALING. An entry that already has an id is re-stamped unless that id
 * still resolves to the name stored beside it. "Has an id" is not the same as
 * "has a correct id", and a script you cannot safely run twice is a trap.
 *
 * Credentials: SEED_EMAIL / SEED_PASSWORD, from the environment or .env.local.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getDatabase, ref, get, update } from 'firebase/database'

const here = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

function fail(message) {
  console.error(`\n  ✖ ${message}\n`)
  process.exit(1)
}

function readEnvLocal() {
  const text = readFileSync(resolve(here, '../.env.local'), 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = readEnvLocal()
const OWNER_UID = env.VITE_OWNER_UID
if (!OWNER_UID) fail('VITE_OWNER_UID is missing from .env.local')

const email = process.env.SEED_EMAIL ?? env.SEED_EMAIL
const password = process.env.SEED_PASSWORD ?? env.SEED_PASSWORD
if (!email || !password) {
  fail('needs SEED_EMAIL and SEED_PASSWORD — every read here requires auth')
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})

await signInWithEmailAndPassword(getAuth(app), email, password)
console.log(`  signed in as ${email}`)

const db = getDatabase(app)
const read = async (path) => {
  const snap = await get(ref(db, path))
  return snap.exists() ? snap.val() : {}
}

const [config, workouts, runs] = await Promise.all([
  read('config'),
  read(`users/${OWNER_UID}/workouts`),
  read(`users/${OWNER_UID}/runs`),
])

/**
 * The /config vocabularies. An EMPTY node is not "no categories" — the app
 * falls back to CONFIG_DEFAULTS, which have no database rows and therefore no
 * ids to stamp. Refusing here is better than stamping ids that do not exist.
 */
function vocabulary(node, label) {
  const rows = Object.entries(node ?? {})
    .map(([id, v]) => [id, (v?.name ?? '').trim()])
    .filter(([, name]) => name !== '')
  if (rows.length === 0) {
    console.log(
      `  ⚠ /config/${label} is empty — the app is running on code-level defaults,\n` +
        `    which have no rows to point at. Create them in the admin panel first.`,
    )
  }
  return {
    idByName: new Map(rows.map(([id, name]) => [name, id])),
    nameById: new Map(rows),
  }
}

const categories = vocabulary(config.workoutCategories, 'workoutCategories')
const runTypes = vocabulary(config.runTypes, 'runTypes')

const updates = {}
const stats = { workouts: 0, runs: 0, correct: 0, restamped: 0 }
const unresolved = new Map()

/** One pass, shared by both collections — same rule, different field names. */
function stamp(records, basePath, nameField, idField, vocab, counter) {
  for (const [rid, record] of Object.entries(records ?? {})) {
    const name = (record?.[nameField] ?? '').trim()
    if (name === '') continue // uncategorized is a legal shape (§3.1)

    const existing = record?.[idField]
    if (existing && vocab.nameById.get(existing) === name) {
      stats.correct++
      continue
    }

    const id = vocab.idByName.get(name)
    if (!id) {
      unresolved.set(name, (unresolved.get(name) ?? 0) + 1)
      continue
    }
    if (existing) stats.restamped++
    updates[`${basePath}/${rid}/${idField}`] = id
    stats[counter]++
  }
}

stamp(
  workouts,
  `users/${OWNER_UID}/workouts`,
  'category',
  'category_id',
  categories,
  'workouts',
)
stamp(runs, `users/${OWNER_UID}/runs`, 'type', 'type_id', runTypes, 'runs')

console.log(`\n  categories in /config  ${categories.idByName.size}`)
console.log(`  run types in /config   ${runTypes.idByName.size}`)
console.log(`  workouts to stamp      ${stats.workouts}`)
console.log(`  runs to stamp          ${stats.runs}`)
console.log(`  already correct        ${stats.correct}`)
console.log(`  stale, re-stamped      ${stats.restamped}`)

if (unresolved.size > 0) {
  console.log(
    `\n  ${unresolved.size} name(s) with no /config row — SKIPPED, not guessed:`,
  )
  for (const [name, count] of unresolved) console.log(`    · "${name}" ×${count}`)
  console.log('  Those records keep working through the name join, as they do today.')
}

/* Every write must be a no-op in meaning: the id has to resolve back to the
   name already stored, or this is rewriting history rather than annotating it. */
const problems = []
for (const [path, id] of Object.entries(updates)) {
  const isRun = path.includes('/runs/')
  const vocab = isRun ? runTypes : categories
  const rid = path.split('/').at(-2)
  const record = (isRun ? runs : workouts)[rid]
  const stored = ((isRun ? record.type : record.category) ?? '').trim()
  if (vocab.nameById.get(id) !== stored) {
    problems.push(`${path}: id is "${vocab.nameById.get(id)}", record says "${stored}"`)
  }
}

if (problems.length > 0) {
  console.error('\n  refusing to write — an id would change what a record means:')
  for (const p of problems.slice(0, 10)) console.error(`    ✖ ${p}`)
  process.exit(1)
}
console.log('\n  ✓ every id resolves back to the name already stored')

if (!APPLY) {
  console.log('\n  dry run — nothing written. Re-run with --apply.\n')
  process.exit(0)
}
if (Object.keys(updates).length === 0) {
  console.log('\n  nothing to do.\n')
  process.exit(0)
}

await update(ref(db), updates)
console.log('  written.')

/* Re-read and confirm against the database as it now is. */
const [afterW, afterR] = await Promise.all([
  read(`users/${OWNER_UID}/workouts`),
  read(`users/${OWNER_UID}/runs`),
])
let stamped = 0
let mismatched = 0
for (const [records, nameField, idField, vocab] of [
  [afterW, 'category', 'category_id', categories],
  [afterR, 'type', 'type_id', runTypes],
]) {
  for (const record of Object.values(records)) {
    const id = record?.[idField]
    if (!id) continue
    stamped++
    if (vocab.nameById.get(id) !== (record[nameField] ?? '').trim()) mismatched++
  }
}

if (mismatched > 0) fail(`${mismatched} records now point at a different name`)
console.log(
  `\n  ✓ verified live: ${stamped} records carry an id, every one still resolving to its own name\n`,
)
process.exit(0)
