/**
 * Stamp `exercise_id` onto every logged exercise entry (D-40).
 *
 *   node scripts/add-exercise-ids.mjs            # dry run, writes nothing
 *   node scripts/add-exercise-ids.mjs --apply
 *
 * ─── this migration is ADDITIVE ──────────────────────────────────────────────
 *
 * It writes `exercise_id` ALONGSIDE the existing `exercise_title` and removes
 * nothing. That matters more than it sounds:
 *
 *   · it does not violate §0.3 — no record is renamed, restructured, or made
 *     unreadable by anything that knows only about names;
 *   · a half-finished run leaves a perfectly working app, because the parse
 *     layer falls back to the name join for any entry without an id;
 *   · it is undone by deleting one field per entry, so "restore from backup" is
 *     not the only recovery path.
 *
 * What it buys: a record points at a catalog ROW rather than at a string, so
 * renaming that row is one write instead of a cascade over history — which is
 * the whole reason D-31 had to block base-exercise renames.
 *
 * ─── safety ──────────────────────────────────────────────────────────────────
 *
 * Refuses to write unless every entry it would stamp resolves to exactly the
 * name already stored. An entry whose title is not in the catalog is skipped and
 * reported, never guessed at.
 *
 * Credentials: SEED_EMAIL / SEED_PASSWORD, from the environment or .env.local.
 * Every read here is gated by the rules, so there is no unauthenticated mode.
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

/** Entries with their DATABASE keys intact — the key is the write address (§3.8). */
function rawEntries(value) {
  if (value == null) return []
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value)
  return entries.filter(([, v]) => v != null)
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

const [baseCatalog, ownCatalog, workouts] = await Promise.all([
  read('config/exercises'),
  read(`users/${OWNER_UID}/exercises`),
  read(`users/${OWNER_UID}/workouts`),
])

/**
 * Name → id, mirroring `mergeExerciseCatalog`: base first, then the user's own
 * tier, so a user entry shadowing a base name wins (D-20). The id written is
 * therefore the one the app would resolve that name to today.
 */
const idByName = new Map()
for (const [id, entry] of Object.entries(baseCatalog)) {
  const name = (entry?.name ?? '').trim()
  if (name) idByName.set(name, id)
}
for (const [id, entry] of Object.entries(ownCatalog)) {
  const name = (entry?.name ?? '').trim()
  if (name) idByName.set(name, id)
}

const nameById = new Map([...idByName].map(([name, id]) => [id, name]))

const updates = {}
let entriesTotal = 0
let alreadyStamped = 0
let restamped = 0
const unresolved = new Map()

for (const [wid, workout] of Object.entries(workouts)) {
  for (const [key, entry] of rawEntries(workout.exercises)) {
    entriesTotal++
    const title = (entry?.exercise_title ?? '').trim()
    // "Has an id" is NOT the same as "has a RESOLVABLE id". Seeding /config and
    // clearing the owner's own tier deletes the rows an earlier run stamped, and
    // a skip-if-present check would then report "nothing to do" while 385
    // entries point at rows that no longer exist. Re-stamp a stale id; skip only
    // one that still resolves to the title stored beside it.
    const existing = entry?.exercise_id
    if (existing && nameById.get(existing) === title) {
      alreadyStamped++
      continue
    }
    if (existing) restamped++
    const id = idByName.get(title)
    if (!id) {
      unresolved.set(title, (unresolved.get(title) ?? 0) + 1)
      continue
    }
    updates[`users/${OWNER_UID}/workouts/${wid}/exercises/${key}/exercise_id`] = id
  }
}

console.log(`\n  catalog          ${idByName.size} distinct names`)
console.log(`  workouts         ${Object.keys(workouts).length}`)
console.log(`  exercise entries ${entriesTotal}`)
console.log(`  already correct  ${alreadyStamped}`)
console.log(`  stale, re-stamped ${restamped}`)
console.log(`  would stamp      ${Object.keys(updates).length}`)

if (unresolved.size > 0) {
  console.log(
    `\n  ${unresolved.size} title(s) not in the catalog — SKIPPED, not guessed:`,
  )
  for (const [name, count] of unresolved) console.log(`    · "${name}" ×${count}`)
  console.log('  Those entries keep working through the name join, as they do today.')
}

/* Every write must be a no-op in meaning: the id must resolve back to the
   name already stored, or the migration is changing history rather than
   annotating it. */
const problems = []
for (const [path, id] of Object.entries(updates)) {
  const [wid, , key] = path
    .replace(`users/${OWNER_UID}/workouts/`, '')
    .replace('/exercise_id', '')
    .split('/')
  const entry = rawEntries(workouts[wid].exercises).find(([k]) => k === key)?.[1]
  const stored = (entry?.exercise_title ?? '').trim()
  if (nameById.get(id) !== stored) {
    problems.push(
      `${path}: id resolves to "${nameById.get(id)}", record says "${stored}"`,
    )
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
const after = await read(`users/${OWNER_UID}/workouts`)
let stamped = 0
let mismatched = 0
for (const workout of Object.values(after)) {
  for (const [, entry] of rawEntries(workout.exercises)) {
    if (!entry?.exercise_id) continue
    stamped++
    const title = (entry.exercise_title ?? '').trim()
    if (nameById.get(entry.exercise_id) !== title) mismatched++
  }
}

if (mismatched > 0) fail(`${mismatched} entries now point at a different name`)
console.log(
  `\n  ✓ verified live: ${stamped} entries carry an id, every one still resolving to its own title\n`,
)
process.exit(0)
