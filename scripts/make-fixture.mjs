/**
 * Generate the committed test fixture from the real export (D-21).
 *
 *   node scripts/make-fixture.mjs
 *
 * RTDB.json is gitignored and must stay that way — it holds real workout
 * titles, training-partner names and places. This produces a scrubbed subset
 * that IS committed, so CI has something to test against.
 *
 * What is scrubbed: titles, descriptions, exercise notes, place names, people
 * names. What is preserved exactly: dates, weights, reps, set types, structure,
 * and generic exercise names — those carry no personal information and are
 * precisely what the engines get wrong.
 *
 * The script FAILS if the selected subset does not cover every edge case. A
 * fixture that quietly stopped covering `weight_kg === 0` would let a real
 * regression through, so coverage is asserted rather than assumed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const IN = resolve(here, '../RTDB.json')
const OUT = resolve(here, '../src/test/fixture.json')

const raw = JSON.parse(readFileSync(IN, 'utf8'))
const root = raw.users ? raw.users[Object.keys(raw.users)[0]] : raw

const asArray = (v) =>
  v == null ? [] : Array.isArray(v) ? v.filter(Boolean) : Object.values(v)
const sets = (w) => asArray(w.exercises).flatMap((e) => asArray(e.sets))

/* ── pick a subset that covers every edge case ──────────────────────────── */

const workoutEntries = Object.entries(root.workouts ?? {})
const runEntries = Object.entries(root.runs ?? {})

const pick = new Set()
const need = (label, fn) => {
  const hit = workoutEntries.find(([k, w]) => fn(k, w))
  if (!hit) throw new Error(`fixture: no workout covers "${label}"`)
  pick.add(hit[0])
}

need('numeric-string key', (k) => /^\d+$/.test(k))
need('push id key', (k) => !/^\d+$/.test(k))
need('no category', (_k, w) => w.category == null)
need('has category Push', (_k, w) => w.category === 'Push')
need('has category Pull', (_k, w) => w.category === 'Pull')
need('has category Legs', (_k, w) => w.category === 'Legs')
need('no people', (_k, w) => w.people == null)
need('has people', (_k, w) => asArray(w.people).length > 0)
need('avg_heart_rate === 0 sentinel', (_k, w) => w.avg_heart_rate === 0)
need('avg_heart_rate absent', (_k, w) => w.avg_heart_rate == null)
need('weight_kg absent on a set', (_k, w) => sets(w).some((s) => s.weight_kg == null))
need('weight_kg === 0 on a set', (_k, w) => sets(w).some((s) => s.weight_kg === 0))
need('reps absent on a set', (_k, w) => sets(w).some((s) => s.reps == null))
need('single-digit day', (_k, w) => /^\d /.test(w.start_time))
need('double-digit day', (_k, w) => /^\d\d /.test(w.start_time))
for (const t of ['normal', 'warmup', 'feeder', 'failure', 'dropset']) {
  need(`set_type ${t}`, (_k, w) => sets(w).some((s) => s.set_type === t))
}

// All 12 runs: the set is tiny and includes the mismatched-pace record and the
// zero sentinels, which are the two traps that matter for runs.
const paceMismatch = runEntries.find(([, r]) => {
  const [m, s] = String(r.pace).split(':').map(Number)
  return Math.abs(m * 60 + s - r.duration_seconds / r.distance_km) > 3
})
if (!paceMismatch) throw new Error('fixture: no run with a mismatched stored pace')
if (!runEntries.some(([, r]) => r.avg_heart_rate === 0)) {
  throw new Error('fixture: no run with avg_heart_rate === 0')
}
if (!runEntries.some(([, r]) => r.calories === 0)) {
  throw new Error('fixture: no run with calories === 0')
}

/* ── scrub ──────────────────────────────────────────────────────────────── */

const placeNames = new Map(
  Object.values(root.gyms ?? {}).map((g, i) => [
    g.name,
    `Place ${String.fromCharCode(65 + i)}`,
  ]),
)
const personNames = new Map(
  Object.values(root.people ?? {}).map((p, i) => [
    p.name,
    `Person ${String.fromCharCode(65 + i)}`,
  ]),
)

const scrubPlace = (n) => (n == null ? n : (placeNames.get(n) ?? n))
const scrubPerson = (n) => (n == null ? n : (personNames.get(n) ?? n))

// Preserve presence/absence exactly: an absent field must stay absent, and an
// empty string must stay an empty string. Both are load-bearing.
const put = (target, key, value) => {
  if (value !== undefined) target[key] = value
}

const scrubWorkout = (w, i) => {
  const out = {}
  put(out, 'title', w.title === '' ? '' : `Workout ${i + 1}`)
  put(out, 'description', w.description === '' ? '' : `Description ${i + 1}`)
  put(out, 'start_time', w.start_time)
  put(out, 'end_time', w.end_time)
  put(out, 'gym', w.gym === '' ? '' : scrubPlace(w.gym))
  put(out, 'category', w.category)
  put(out, 'avg_heart_rate', w.avg_heart_rate)
  if (w.people !== undefined) out.people = asArray(w.people).map(scrubPerson)
  out.exercises = asArray(w.exercises).map((e, ei) => {
    const ex = {}
    put(ex, 'exercise_title', e.exercise_title)
    if (e.exercise_notes !== undefined) ex.exercise_notes = `Note ${i + 1}.${ei + 1}`
    ex.sets = asArray(e.sets).map((s) => {
      const st = {}
      put(st, 'set_index', s.set_index)
      put(st, 'set_type', s.set_type)
      put(st, 'reps', s.reps)
      put(st, 'weight_kg', s.weight_kg)
      put(st, 'duration_seconds', s.duration_seconds)
      return st
    })
    return ex
  })
  return out
}

const scrubRun = (r, i) => {
  const out = {}
  for (const k of [
    'start_time',
    'type',
    'distance_km',
    'duration_seconds',
    'pace',
    'avg_heart_rate',
    'calories',
    'difficulty',
    'elevation_gain_m',
    'max_elevation_m',
    'steps',
  ])
    put(out, k, r[k])
  put(out, 'title', `Run ${i + 1}`)
  put(out, 'description', `Run description ${i + 1}`)
  put(out, 'location', scrubPlace(r.location))
  if (r.people !== undefined) out.people = asArray(r.people).map(scrubPerson)
  return out
}

/* ── emit ───────────────────────────────────────────────────────────────── */

const workouts = {}
;[...pick].forEach((k, i) => {
  workouts[k] = scrubWorkout(root.workouts[k], i)
})

const runs = {}
runEntries.forEach(([k, r], i) => {
  runs[k] = scrubRun(r, i)
})

const exercises = {}
Object.entries(root.exercises ?? {}).forEach(([k, e]) => {
  exercises[k] = { name: e.name, muscleGroup: e.muscleGroup }
})

const gyms = {}
Object.entries(root.gyms ?? {}).forEach(([k, g]) => {
  gyms[k] = { name: scrubPlace(g.name) }
})

const people = {}
Object.entries(root.people ?? {}).forEach(([k, p]) => {
  people[k] = { name: scrubPerson(p.name) }
})

const fixture = {
  workouts,
  runs,
  exercises,
  gyms,
  people,
  settings: {
    featuredExercises: (root.settings?.featuredExercises ?? []).slice(0, 4),
  },
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n')

const allSets = Object.values(workouts).flatMap((w) => sets(w))
console.log(`wrote ${OUT}`)
console.log(
  `  workouts ${Object.keys(workouts).length}  runs ${Object.keys(runs).length}`,
)
console.log(`  sets ${allSets.length}  exercises ${Object.keys(exercises).length}`)
console.log(
  `  weight_kg: >0 ${allSets.filter((s) => s.weight_kg > 0).length}` +
    `  ===0 ${allSets.filter((s) => s.weight_kg === 0).length}` +
    `  absent ${allSets.filter((s) => s.weight_kg == null).length}`,
)
console.log(
  `  timestamps ${Object.values(workouts).length * 2 + Object.values(runs).length}`,
)
console.log('  every edge case asserted present.')
