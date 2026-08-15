/**
 * Seed the global base exercise catalog, `/config/exercises`, from the owner's
 * existing per-user list (D-20).
 *
 *   node scripts/seed-config-exercises.mjs                 # dry run, writes nothing
 *   node scripts/seed-config-exercises.mjs --apply         # seed /config/exercises
 *   node scripts/seed-config-exercises.mjs --apply --clear-own-tier
 *
 * A REVIEWED ONE-OFF. Never run at startup, never from the app — PLAN.md Phase
 * 13 and D-17 both say so. It is a deliberate write to the live database, so it
 * refuses to do anything without `--apply` and prints exactly what it would do.
 *
 * ─── why this is safe ────────────────────────────────────────────────────────
 *
 * Joins are by NAME STRING (§3.7). A workout stores `exercise_title: "Pull Up"`,
 * not an id, and the merged catalog resolves that name across both tiers. So
 * moving an entry from the user tier to the base tier changes which node holds
 * the name — and nothing else. No workout record is touched. No migration
 * occurs. That is the whole reason D-20's two-tier split could be introduced
 * without violating "the data is sacred".
 *
 * The script proves it rather than asserting it: it computes the merged catalog
 * before and after, and REFUSES to apply if any historical `exercise_title`
 * would stop resolving, or if any exercise would land in a different muscle
 * group.
 *
 * ─── credentials ─────────────────────────────────────────────────────────────
 *
 * Reads Firebase config from .env.local (gitignored). Writing `/config`
 * requires an account whose /roles entry says admin, so sign in as the owner:
 *
 *   SEED_EMAIL=owner@example.com SEED_PASSWORD=… node scripts/… --apply
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getDatabase, ref, get, update, push } from 'firebase/database'

const here = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const CLEAR_OWN = process.argv.includes('--clear-own-tier')

/* ── env ─────────────────────────────────────────────────────────────────── */

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

const email = process.env.SEED_EMAIL
const password = process.env.SEED_PASSWORD
if (APPLY && (!email || !password)) {
  fail('--apply needs SEED_EMAIL and SEED_PASSWORD for an admin account')
}

function fail(message) {
  console.error(`\n  ✖ ${message}\n`)
  process.exit(1)
}

/* ── the merged catalog, mirroring src/lib/normalize.ts exactly ──────────── */

/**
 * Kept in step with `mergeExerciseCatalog` by hand, because this script must
 * run without a bundler. Merge is by name; on a collision the USER's entry
 * wins. If that rule ever changes in the app, it changes here too — the whole
 * verification below is worthless otherwise.
 */
function mergeCatalog(base, own) {
  const byName = new Map()
  for (const [, entry] of Object.entries(base ?? {})) {
    const name = (entry?.name ?? '').trim()
    if (name) byName.set(name, (entry.muscleGroup ?? 'Unknown').trim() || 'Unknown')
  }
  for (const [, entry] of Object.entries(own ?? {})) {
    const name = (entry?.name ?? '').trim()
    if (name) byName.set(name, (entry.muscleGroup ?? 'Unknown').trim() || 'Unknown')
  }
  return byName
}

/** Array-or-object, per §3.8. */
function toList(value) {
  if (value == null) return []
  if (Array.isArray(value)) return value.filter((v) => v != null)
  return Object.values(value).filter((v) => v != null)
}

function titlesInHistory(workouts) {
  const titles = new Set()
  for (const workout of Object.values(workouts ?? {})) {
    for (const entry of toList(workout.exercises)) {
      const title = (entry?.exercise_title ?? '').trim()
      if (title) titles.add(title)
    }
  }
  return titles
}

/* ── run ─────────────────────────────────────────────────────────────────── */

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})

if (email && password) {
  await signInWithEmailAndPassword(getAuth(app), email, password)
  console.log(`  signed in as ${email}`)
} else {
  console.log('  not signed in — dry run only')
}

const db = getDatabase(app)
const read = async (path) => {
  const snap = await get(ref(db, path))
  return snap.exists() ? snap.val() : {}
}

const [baseBefore, ownBefore, workouts] = await Promise.all([
  read('config/exercises'),
  read(`users/${OWNER_UID}/exercises`),
  read(`users/${OWNER_UID}/workouts`),
])

const ownEntries = Object.entries(ownBefore)
const mergedBefore = mergeCatalog(baseBefore, ownBefore)
const historyTitles = titlesInHistory(workouts)

console.log(`\n  base catalog     ${Object.keys(baseBefore).length} entries`)
console.log(`  owner's own tier ${ownEntries.length} entries`)
console.log(`  merged           ${mergedBefore.size} names`)
console.log(`  history uses     ${historyTitles.size} distinct exercise names`)

/* Build the seed: every name in the owner's tier that isn't already in base. */
const baseNames = new Set(Object.values(baseBefore).map((e) => (e?.name ?? '').trim()))
const seed = {}
const baseAfter = { ...baseBefore }
for (const [, entry] of ownEntries) {
  const name = (entry?.name ?? '').trim()
  if (!name || baseNames.has(name)) continue
  const key = push(ref(db, 'config/exercises')).key
  const row = { name, muscleGroup: (entry.muscleGroup ?? 'Other').trim() || 'Other' }
  seed[`config/exercises/${key}`] = row
  baseAfter[key] = row
  baseNames.add(name)
}

const ownAfter = CLEAR_OWN ? {} : ownBefore
const mergedAfter = mergeCatalog(baseAfter, ownAfter)

/* ── verification — refuse to apply if anything would change meaning ─────── */

const problems = []

for (const title of historyTitles) {
  if (!mergedAfter.has(title)) {
    problems.push(`"${title}" is logged in history but would no longer resolve`)
  }
}

for (const [name, group] of mergedBefore) {
  const after = mergedAfter.get(name)
  if (after === undefined) {
    problems.push(`"${name}" disappears from the merged catalog`)
  } else if (after !== group) {
    problems.push(`"${name}" changes muscle group: ${group} → ${after}`)
  }
}

console.log(`\n  would write      ${Object.keys(seed).length} new base entries`)
if (CLEAR_OWN) {
  console.log(`  would clear      the owner's own tier (${ownEntries.length} entries)`)
}
console.log(`  merged after     ${mergedAfter.size} names`)

if (problems.length > 0) {
  console.error('\n  merged catalog would change — refusing to write:')
  for (const p of problems) console.error(`    ✖ ${p}`)
  process.exit(1)
}
console.log('\n  ✓ every logged exercise still resolves, in the same muscle group')

if (!APPLY) {
  console.log('\n  dry run — nothing written. Re-run with --apply.\n')
  process.exit(0)
}

if (Object.keys(seed).length === 0 && !CLEAR_OWN) {
  console.log('\n  nothing to do.\n')
  process.exit(0)
}

const updates = { ...seed }
if (CLEAR_OWN) updates[`users/${OWNER_UID}/exercises`] = null

await update(ref(db), updates)
console.log('  written.')

/* Re-read and verify against the database as it actually is now. */
const [baseCheck, ownCheck] = await Promise.all([
  read('config/exercises'),
  read(`users/${OWNER_UID}/exercises`),
])
const mergedCheck = mergeCatalog(baseCheck, ownCheck)

const stillBroken = [...historyTitles].filter((t) => !mergedCheck.has(t))
if (stillBroken.length > 0) {
  fail(`after writing, these no longer resolve: ${stillBroken.join(', ')}`)
}
console.log(
  `\n  ✓ verified against the live database: ${mergedCheck.size} names, all ${historyTitles.size} logged exercises resolve\n`,
)
process.exit(0)
