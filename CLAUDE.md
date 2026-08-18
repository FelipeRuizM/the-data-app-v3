# CLAUDE.md — the-data-app-v3

**Read this file in full at the start of every session before touching any code.**
It is the durable spec. `DECISIONS.md` records every resolved ambiguity;
`CLAUDE_CODE_PROMPT.md` is the original brief; `PLAN.md` holds the phased build order.

**Precedence when they disagree: `DECISIONS.md` → this file → the brief.** The owner
has explicitly overridden parts of the brief — most importantly the entire auth model
(D-3) — so the brief is history, not law. If this file contradicts `DECISIONS.md`,
fix this file in the same commit.

> **Status — 2026-08-14.** All 19 open questions are answered; see `DECISIONS.md`.
> The data contract in §3 is **verified against the real export**, not transcribed.
> Four follow-on questions (NQ-1 … NQ-4) are open but do not block Phase 1.
> No application code exists yet.

---

## 0. How to work in this repo

1. **One phase at a time**, in `PLAN.md` order. At the end of a phase: run typecheck
   + build, **bump `APP_VERSION`** (rule 6), commit with a conventional-commit
   message, report what changed **including the version number**, then **stop and wait
   for "continue"**. Never run ahead into the next phase.
2. **When something is underspecified or contradicted by the real data, stop and
   ask.** Do not pick silently. Every such decision goes into `DECISIONS.md` (created
   at the start of Phase 1) with the question, the options, and the chosen answer.
3. **The data is sacred.** The schema in §3 stays exactly as-is. You may add new
   *optional* fields going forward. You may **not** rename, restructure, or require a
   migration of the existing records. The app reads the data as shaped.
4. **Never read `RTDB.json` into context.** See §3.0.
5. Do not add dependencies casually. The stack in §2 is the stack; anything else
   needs a justification logged in `DECISIONS.md`.
6. **THE VERSION COUNTER. Every deploy gets a new number.**
   `src/version.ts` holds `APP_VERSION`, rendered beside the app name in the header
   and on the login screen. **Bump it in the same commit as the deploy** — never
   after, never in a follow-up — and **state the deployed version number in the
   report.** Currently **3.6**.
   - `major.minor`, not semver: it marks deploys, not API compatibility. A normal
     phase bumps the minor (3.0 → 3.1). Bump the major only when the owner says so.
   - It is the **only** version string in the repo. `package.json` stays at `0.0.0`
     — this app is never published to a registry, and a second number is a second
     thing to forget. Do not add one.

---

## 1. What this is

A personal life-data app. Today it holds **Workouts** and **Runs**. The architecture
must assume more categories later — flights, games, films, series, books.

**Accounts, behind a login wall.** Four roles — admin, user, guest, and everyone
else, who sees only the login screen. Each account owns its own profile and its own
data. See §2. **This replaces the brief's public-read model entirely** (D-3): there is
now a login wall, content is not world-readable, and the app is multi-tenant.

### The registry rule

There is a **category registry** — one entry per life-data category, holding:

```
id, label, icon, accentToken, routes, list/detail/form components,
plus the aggregator hooks Analytics and Home use
```

Home's log buttons, the nav, and the Analytics aggregators **iterate the registry**.
They must never hardcode `"workouts"` / `"runs"`. Adding a third category later means
adding a module and a registry entry — not refactoring pages.

**Do not over-abstract past this.** Two concrete implementations plus a registry. No
plugin framework, no generic schema engine, no runtime-configurable field system.
Workouts and Runs have genuinely different shapes and are allowed to have genuinely
different components.

---

## 2. Stack, deployment, auth

| Concern | Choice |
|---|---|
| Build | Vite + React + **TypeScript strict** |
| Styling | Tailwind CSS, extending tokens from `src/styles/tokens.css` |
| Routing | **HashRouter** — GitHub Pages has no SPA rewrite. Never `BrowserRouter`. |
| Charts | **Hand-drawn SVG / HTML — no charting library** (D-34). Recharts was specified here, never imported, and removed in Phase 15. |
| Dates | date-fns, only through `src/lib/dates.ts` |
| Backend | Firebase Web SDK v10+ — Realtime Database + Auth |
| Hosting | GitHub Pages via GitHub Actions on push to `main` |
| Base path | `base: '/the-data-app-v3/'` in `vite.config.ts` |

Rules:

- **No state management library.** Plain hooks + context. React Query is *permitted*
  only with a justification in `DECISIONS.md` (see `PLAN.md` OQ-11 — the standing
  recommendation is not to use it).
- **No opinionated component library.** No untouched shadcn/ui, no MUI, no Chakra.
  Build the components. Headless primitives (Radix, Headless UI) are fine for
  dialogs, menus, and tabs where accessibility is hard to get right by hand.
- Firebase config lives in `src/lib/firebase.ts`, read from `import.meta.env`,
  injected at build time by the Action. **This config is public by design.** It is
  not a secret; security comes from database rules, not from hiding it. Never write
  auth logic that assumes the config is private.

### Environment variables

`.env.local` (gitignored) and the Actions build both need:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_OWNER_UID
```

The owner UID is `oaM2fM7K52ak6EzqDNzDzXSRWXr1`. It must be read from
`VITE_OWNER_UID`, **not hardcoded in source**. (It is not a secret either — it ships
in the bundle regardless. The env var exists so the app isn't pinned to one person.)

### Auth model — D-3

**Four roles. There is a login wall.** Nothing in the app renders to an unauthenticated
visitor except the login screen.

| Role | Identified by | Can |
|---|---|---|
| **admin** | `uid === VITE_OWNER_UID` | everything a user can, plus the global admin panel (§4) |
| **user** | any other invited account | view, create, edit, delete **within their own profile only** |
| **guest** | one shared account | **read-only**, pointed at the owner's profile |
| **none** | not signed in | the login screen, and nothing else |

- **Provider: email/password ONLY** (D-27, which supersedes D-3 on this point).
  **There is no Google provider** — every role signs in the same way, through
  `signIn(email, password)`. Do not reintroduce `signInWithPopup` or
  `GoogleAuthProvider`.
- **Invite-only. There is no public sign-up.** Accounts are created by the owner in
  the Firebase console. **Do not build a registration flow.** With email/password
  this is a genuine gate: sign-in cannot succeed at all for an account the owner
  never created, and `/roles` is then a second gate on top.
- **Sign-in errors collapse to one message** for `invalid-credential`,
  `wrong-password`, `user-not-found` and `invalid-email`. Distinguishing "no such
  account" from "wrong password" would tell an attacker which emails are registered.
  Keep them collapsed.
- **Guest reads the owner's profile.** Accepted consequence: anyone holding the guest
  credential can read real workout titles, training-partner names and places.
- Every mutating control — add, edit, delete, settings, calculator saves, reorder —
  is **hidden entirely** when the viewer cannot write. Not disabled. Not rendered and
  then rejected. Absent.

**Hooks — the single sources of truth. Nothing else compares UIDs or roles.**

```ts
useRole()                 // 'admin' | 'user' | 'guest' | 'none'
useCanWrite(profileUid)   // true only when the signed-in account owns that profile
useIsAdmin()              // gates the global admin panel only
```

> `useIsOwner()` from the brief **no longer exists.** It encoded a single-owner model
> that D-3 replaced. Writing it back is a bug: it cannot express "this user may write
> to their own profile but not to yours."

- The UI hiding is a courtesy. **`database.rules.json` is the actual boundary.**
  Never write code whose security depends on a client-side check.

Rules shape (`.read: true` from the brief is **gone** — reads now require auth):

```json
{
  "rules": {
    "roles": {
      ".read":  "auth != null",
      ".write": false
    },
    "config": {
      ".read":  "auth != null",
      ".write": "root.child('roles').child(auth.uid).child('role').val() === 'admin'"
    },
    "users": {
      "$uid": {
        ".read":  "auth != null && (auth.uid === $uid || root.child('roles').child(auth.uid).child('readsProfile').val() === $uid)",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

### `/roles` — D-23

```
/roles/{uid} → { role: "admin" | "user" | "guest", readsProfile?: "<uid>" }
```

The guest account carries `{ role: "guest", readsProfile: "<owner uid>" }`.

> **`/roles` is writable by nobody from the client — not even admin.** It is
> maintained from the Firebase console or a server-side script. This is deliberate: it
> makes privilege escalation impossible from a compromised client. If you find
> yourself needing to write roles from the app, that is a design smell, not a missing
> feature.

Chosen over custom claims (which would need a Cloud Function this project doesn't
otherwise have, and only refresh with the ID token) and over a UID allowlist inside
the rules (where adding a second guest means redeploying security rules).

---

## 3. The data contract

Everything lives under `/users/{OWNER_UID}/`. Exactly six children:

```
exercises · gyms · people · runs · settings · workouts
```

### 3.0 Verification status — READ THIS

**Verified 2026-08-14 against the real export.** `RTDB.json` (352 KB) is in the
project root and every figure in §3.1–§3.5 has been re-derived from it. These are
facts, not hints. Five corrections to the brief came out of that pass — each is
marked **[verified]** or **[corrected]** below, and all are logged in `DECISIONS.md`.

> **Never read `RTDB.json` into context.** It is 352 KB and will burn a large share
> of the window for no benefit.

Inspect it only with **short throwaway Node or Python scripts** written to the
scratchpad — field-presence counts, distinct values, edge cases — and read back only
the handful of specific records you actually need. `jq` is **not installed** on this
machine; `node` and `python` are.

**The file is gitignored and must stay that way** (D-13) — it would put real workout
titles, training-partner names and places into public git history.

**Tests therefore run against a committed anonymised fixture** (D-21), generated from
the real export by a local script. The fixture must preserve every edge case, because
these are exactly what the engines get wrong: both key styles, `weight_kg` in all
three states, the set with no `reps`, `avg_heart_rate: 0` on both a workout and a run,
the run whose stored `pace` disagrees, a workout with no `category`, and both
single- and double-digit days. The full 174-timestamp round-trip stays a local check;
CI runs the fixture.

### 3.1 `workouts/{id}`

**Keys are mixed and must be treated as opaque strings.** ~37 records use numeric
string keys (`"0"`–`"36"`, from an original import); ~44 use Firebase push IDs.

> **Trap.** Never parse a key as a number. Never sort by key. Never assume push IDs
> are chronologically ordered relative to the numeric keys. **`start_time` is the
> only ordering authority.** New records are created with `push()`.

| Field | Presence (unverified) | Notes |
|---|---|---|
| `title` | always | free text, often jokes in Portuguese — never assume English |
| `description` | always | may be `""` |
| `start_time` | always | string, §3.6 format |
| `end_time` | always | string, §3.6 format. Duration = end − start |
| `gym` | always | **denormalized name string**, joins to `gyms` by name. **[corrected]** no record has `""` — all 81 resolve |
| `exercises` | always | array — see below |
| `category` | 67/81 | `"Push"` \| `"Pull"` \| `"Legs"`. **14 records have no category** |
| `avg_heart_rate` | 56/81 | number. Absent = not recorded. **[corrected]** one record has `0` — the sentinel is **not** runs-only, normalize `0 → null` here too (§3.9) |
| `calories` | 0/81 | **new, additive (D-45)**. Same `0 → null` sentinel |
| `people` | 43/81 | **array of name strings**, denormalized, joins to `people` by name |

> **`end_time` is derived on write (D-47).** The form asks for a **duration** and
> defaults the start to now; `end_time = start + duration`, written in the identical
> §3.6 format. Both timestamps are still stored, always — the *schema* is untouched,
> only the question the form asks changed.

`exercises[]` entries:

| Field | Presence | Notes |
|---|---|---|
| `exercise_title` | always | **denormalized name**, joins to `exercises` by name |
| `exercise_notes` | 291/385 | free text |
| `sets` | always | array |

`sets[]` entries:

| Field | Presence | Notes |
|---|---|---|
| `set_index` | always | 0-based position |
| `set_type` | always | `normal` (1027) \| `warmup` (132) \| `feeder` (78) \| `failure` (26) \| `dropset` (11) |
| `reps` | 1273/1274 | **one set genuinely lacks it** — the parse layer must survive this |
| `weight_kg` | 1247/1274 | **absent on bodyweight sets** — Pull Up, Hanging Knee Raise, etc. |
| `duration_seconds` | 708/1274 | time under tension / set duration |

### 3.2 `runs/{id}`

All push IDs. All 12 records have every field except `people` (3/12).

```
title, description, start_time, type, location, distance_km, duration_seconds,
pace, avg_heart_rate, calories, difficulty (1–10), elevation_gain_m,
max_elevation_m, steps, people?, shoes?, watch?
```

> **`elevation_gain_m`, `max_elevation_m` and `steps` are RETIRED (D-46).** Nothing
> asks for, renders or aggregates them. They are **not deleted** — all 12 records keep
> theirs, and the edit form carries them through untouched, because `saveRun` replaces
> the whole record and "not in the draft" would mean "deleted on next edit". The app
> types keep the three fields marked *retained, not supported*: **do not add a
> consumer.**

**How runs are logged (D-16).** Strava records the run on the watch; the owner then
transcribes the values into the app. `duration_seconds` is Strava's **moving time**.

**`shoes` and `watch` are new optional fields.** Verified absent from all 12 existing
records, so they are purely additive — no migration, consistent with the
data-is-sacred rule. Each is a **denormalized name string** like every other join
here, resolving against an admin-managed catalog (§3.5). Per-account defaults:

```
shoes  →  "Adidas Ultraboost 21"
watch  →  "Apple Watch Series 8"
```

> **No splits.** §4 asks for "splits if derivable". They are **not** derivable — the
> schema holds totals only, with no per-kilometre or GPS data. Do not synthesise them
> from average pace; a flat bar per km is one number repeated (D-16).

> **Trap 1 — zero sentinels.** `avg_heart_rate: 0` and `calories: 0` mean **"not
> recorded"**, not a real zero. They must never be averaged in, summed as zero into a
> mean's denominator, or plotted. **Normalize `0 → null` at the data-access
> boundary** (§3.9) and render as `—`. Downstream code must never see the `0`.

> **Trap 2 — pace is a string, and it is derived.** `pace` is stored as `"7:17"`
> (min:sec per km), **not a number**. It is also derivable from
> `duration_seconds / distance_km`. **The derived value is the truth for all math.**
> Display the stored string only if it has been verified to agree with the derived
> one; otherwise recompute. Never parse the string for arithmetic in a component.
>
> **[verified]** This is not hypothetical: **1 of the 12 runs disagrees.** One record
> stores `"8:00"` against a derived 450 s/km — a 30 s/km gap. Always recompute.

`type` is currently `"Other"` (11) and `"Light"` (1). §4 makes run types
user-editable — do not hardcode this pair anywhere but a fallback default.

`location` is a **denormalized place-name string** that joins to `gyms` — see §3.4.

### 3.3 Exercises — **two tiers** (D-20)

```
/config/exercises/{pushId}      → { name, muscleGroup }   global base, admin-only
/users/{uid}/exercises/{pushId} → { name, muscleGroup }   user's own additions
```

> **Nothing outside the parse layer knows there are two tiers.** `src/lib/db.ts`
> exposes a single **merged catalog** per profile; muscle-group lookup, Records
> grouping and the radar chart all consume the merged view.
>
> - **Merge is by `name`** — name is the actual join key (§3.7), not the push ID.
> - **On a name collision the user's entry wins.** That lets someone re-file a base
>   exercise into a different muscle group without an admin and without mutating
>   shared data.
> - **Users write only their own tier.** Creating an exercise never touches `/config`.
> - **Renaming or deleting a base exercise is NOT an app feature (D-31).** It would
>   have to rewrite `exercise_title` in every profile that logged it, and
>   `database.rules.json` lets an account write **only its own subtree** — an admin
>   included. So the admin panel offers **add and re-file only**, and rename/delete
>   are console or server-script operations. This supersedes the earlier plan for a
>   cross-profile cascade behind a confirm; that cascade was never implementable
>   without weakening the tenant boundary.

**Seeding (Phase 13, a reviewed one-off script — never at startup):** the existing 74
exercises seed `/config/exercises`; the owner's own tier starts empty. This is safe
**only because joins are by name string** — every historical `exercise_title` keeps
resolving against the merged catalog, so no workout record changes and no migration
occurs.

`gyms` and `people` are **not** two-tier. They stay per-user (§3.4) — 5 places and 7
training partners are personal data, not shared vocabulary.

74 entries today. Muscle groups in use:

```
Legs (18) · Arms (17) · Back (15) · Chest (12) · Shoulders (10) · Other (2)
```

> **`Core` is added as a seventh group (D-4).** It does not exist in the export —
> core work currently sits in `Other` (only 2 exercises) or under a movement group.
> **Nothing is reassigned automatically:** the owner re-files exercises through the
> admin panel in Phase 12. `muscleGroup` is a plain string, so this needs no
> migration. Until then those sets stay where they are and are excluded from the §7
> radar either way, so nothing is misreported in the meantime.

An `exercise_title` that does not resolve against this table must degrade to muscle
group `Unknown` in aggregates — never throw, never drop the set.

### 3.4 `gyms/{pushId}` → `{ name }` · `people/{pushId}` → `{ name }`

5 gyms, 7 people.

> **`gyms` is really "places".** It is also where runs happen — a run's `location`
> (e.g. `"casa natal"`) resolves against the same table. **Model it as a single
> `places` concept in the UI and in the type layer**, while the DB path stays `gyms`
> forever. The rename lives in the parse layer, not in the database.

**[corrected]** The brief claimed one workout had `gym: ""`. It does not — all 81
resolve, and **referential integrity is currently perfect**: zero unresolved
`exercise_title`, `gym`, `location` or `people` values anywhere in the export. Still
handle the empty/unresolved case (render `—` / "No place", never an error), because
D-5's cascade is what keeps this true and nothing enforces it at the database level.

### 3.5 `settings`

Currently holds only:

```
featuredExercises: string[]   // ordered list of EXERCISE NAMES, drives Records page
```

**Settings are split across two locations (D-17b), by the panel that edits them:**
*what the admin panel edits is global; what the Settings page edits is per-account.*

**Per-account** — `/users/{uid}/settings`, edited on the Settings page:

```
settings/
  featuredExercises   : string[]                       // exists today (9 entries)
  units               : "kg" | "lb"                    // DISPLAY ONLY (D-18)
  bodyweightKg        : number                         // volume only, never PRs (D-7)
  calculator          : { warmup: {...}, feeders: [...], roundingKg, roundingLb }
  defaultShoes        : string                         // "Adidas Ultraboost 21"
  defaultWatch        : string                         // "Apple Watch Series 8"
```

**Global** — a new top-level `/config` node, edited only in the admin panel:

```
config/
  exercises           : { [pushId]: { name, muscleGroup } }   // base catalog (D-20)
  workoutCategories   : { [pushId]: { name, colorToken, order } }
  runTypes            : { [pushId]: { name, colorToken, order } }
  repBasedExercises   : string[]        // exercise names, drives maxReps (§6.1)
  muscleGroups        : string[]        // incl. Core (D-4)
  shoes               : { [pushId]: { name } }
  watches             : { [pushId]: { name } }
```

> **This is a second settings location, which the brief forbade.** Accepted
> deliberately: the brief predates the multi-account model, and vocabulary shared by
> every account cannot live inside one user's subtree. **Do not add a third.**
> Anything personal goes per-account; anything shared goes in `/config`.

**`exercises` is two-tier** — a global base in `/config/exercises` plus per-user
additions (§3.3, D-20). **`gyms` and `people` stay per-user**, unchanged.

All of these must have **code-level defaults** so the app works before anyone has
opened Settings — this is also what lets a newly invited account work immediately.
Writing defaults into the DB happens only on a first explicit edit — **never as a
startup migration.**

### 3.6 Dates — the biggest trap

Format: `"8 Apr 2026, 16:50"` · `"30 May 2026, 17:53"`

That is **`d MMM yyyy, HH:mm`**:

- **Single-digit days are NOT zero-padded** (`8 Apr`, not `08 Apr`)
- Month is a three-letter **English** abbreviation
- **No seconds**
- **No timezone.** These are local wall-clock times.

Rules:

- Parse **only** with `date-fns/parse` and that exact format string.
  `new Date("8 Apr 2026, 16:50")` is engine-dependent and will silently misparse.
- Write back in the **identical** format. Round-trip must be lossless.
- **`src/lib/dates.ts` is the only module in the codebase that touches the raw
  string.** Everything else deals in `Date` objects. No exceptions, including tests
  fixtures and forms.
- Never call `.toISOString()`, never `Date.parse`, never do UTC conversion. Because
  the strings carry no timezone, they are wall-clock facts about the owner's day; a
  viewer in another timezone must see the same `16:50`.
- Ship a unit test that round-trips **every** `start_time` and `end_time` in
  `RTDB.json` through parse → format and asserts byte equality.

### 3.7 Referential integrity

Joins are **by name string**, not by ID — with one exception, added additively:

> **Exercises carry `exercise_id` (D-40); workouts carry `category_id` and runs
> carry `type_id` (D-42).** Each is stored *alongside* the name it accompanies,
> never instead of it. The parse layer resolves
> **id → name → merged catalog**, so a renamed catalog row is picked up without any
> record being rewritten, while D-20's "the user's entry wins on a name collision"
> still applies. An entry with no id, or an id that resolves to nothing, falls back to
> the name join exactly as before, and §4's "a deleted category degrades to
> `--cat-none`" holds by construction. **Places and people remain name-joined** —
> they are per-user, so D-5's cascade already does the whole job. An id is only ever
> written when a database row exists behind it (D-43).

The brief reports that every `exercise_title`, `people` entry, and `gym`/`location`
currently resolves against its lookup table (the one empty-string gym aside). **Do not
assume that holds forever.**

Every join in the app must be **total**: an unresolvable name renders as itself with
a neutral treatment and aggregates under `Unknown`. Never throw, never drop the
record, never show an error state for a dangling name.

> **Renaming in Settings must either cascade to every historical record or be
> blocked.** This is an open question — `PLAN.md` OQ-5. Deletion of a referenced
> exercise/place/person is the same question with a different answer.

### 3.8 Arrays vs. objects — Firebase RTDB trap

RTDB returns a node as a JS **array** only when its keys are the contiguous integers
`0..n`. If any element is ever removed or written out of order, the *same* node comes
back as an **object with numeric-string keys**.

`workouts[].exercises`, `exercises[].sets`, and `workouts[].people` are all affected.

**The parse layer must accept array-or-object for every one of these and normalize to
a dense array**, ordered by `set_index` for sets and by key order otherwise. Nothing
downstream may assume `Array.isArray`. Writes go back as arrays.

### 3.9 The normalization boundary

**Components never touch raw DB shapes.** Every Firebase read passes through a typed
parse/normalize layer (`src/lib/db.ts` + `src/types/`) that is solely responsible
for:

- coercing array-or-object (§3.8)
- `0 → null` on run `avg_heart_rate` and `calories` (§3.2)
- `undefined` → `null` on optional fields, so the app type has no `?` ambiguity
- parsing `start_time` / `end_time` into `Date` via `src/lib/dates.ts`
- deriving `paceSecPerKm` from `duration_seconds / distance_km` (§3.2)
- resolving denormalized names to their lookup entries, with an `Unknown` fallback
- the empty-string gym → `null` place

The app-facing types are **not** the DB types. Keep them in two clearly named layers,
e.g. `RawWorkout` (mirrors the DB exactly, all optionals) and `Workout` (the app
type, normalized, no surprise `undefined`). The writer inverts the same mapping and
must produce a record byte-compatible with the existing schema.

**No `any`. Anywhere.**

---

## 4. Pages and information architecture

Everything is **desktop and mobile**. Design the data-dense views for a **375px
viewport first**, then let them breathe on desktop. Tables become card stacks; charts
stay legible; nav never hides the primary action.

### Routes (HashRouter)

```
#/login                         The only route an unauthenticated visitor sees
#/                              Home
#/workouts                      List
#/workouts/new                  Create              (write access)
#/workouts/:id                  Detail
#/workouts/:id/edit             Edit                (write access)
#/workouts/records              Records
#/workouts/records/:exercise    Per-exercise record detail (URI-encoded name)
#/workouts/calculator           Warm-up & feeder calculator
#/runs, #/runs/:id, ...         Same shape, driven by the registry
#/runs/records                  Run personal bests  (D-10)
#/reports/:yyyy-MM              ONE cross-category monthly report (D-8)
#/analytics                     Cross-category
#/settings                      Per-account settings — any signed-in user
#/admin                         Global config — admin only, hidden from nav
#/styleguide                    Every token and component in isolation
#/workouts/fix-times            Bulk timestamp repair — UNLINKED, typed URL only (D-66)
```

**Every route except `#/login` requires authentication** (D-3). An unauthenticated
visitor is redirected there and sees nothing else. `#/reports/:yyyy-MM` is deliberately
**not** nested under a category — there is one combined report, not one per category.

Per-exercise record pages key on the **encoded exercise name**, because the name —
not the push ID — is the actual join key in the set log.

### Home

Deliberately sparse. Large tap targets to log a new entry, **one per registry
category**. Below that, a short recent-activity strip. Nothing else. For viewers
without write access (the guest account), the log buttons are **absent** and the page
is the activity strip alone.

### Workouts / Runs — one pattern, two instances

- **List** — browse, filter, edit, delete. Filters: category/type, place, person,
  date range. Each row is scannable without opening: date, title, category,
  volume-or-distance, duration, HR.
- **Category color coding** — each workout category and run type has a distinct hue,
  used **consistently everywhere**: list rows, calendar cells, charts, detail
  headers. Defined once as tokens (§5), assigned via `settings`. **Uncategorized gets
  a neutral treatment, never an error state.**
- **Detail** — full breakdown: every exercise, every set with its type badge, notes,
  duration, HR, people, place, calories, and the PR badges earned that session
  (§6.2). For runs: pace, difficulty, calories (D-46 retired elevation and steps).
- **Records** sub-page → §6
- **Monthly report** sub-page → §7
- **Calculator** (workouts only) → §8

### Form conventions — the log forms are the primary surface

These are durable rules, not one-off tweaks. The forms are used on a phone, standing
in a gym, between sets.

- **NO FORM CONTROL BELOW 16px** (D-55). iOS Safari zooms on focus below that and
  never zooms back out. The rule lives **unlayered** in `index.css` so no Tailwind
  utility can override it — do not put a `text-sm` on an input and do not move that
  rule into `@layer base`. Density comes from padding, never from smaller text.
- **`ComboBox` for every value that comes from a catalog** (D-52) — place, category,
  run type, exercise, shoes, watch. You type, it filters on a substring, and **a name
  that matches nothing is a valid value that the form then creates**:
  - places, people and **exercises** are created in `/users/{uid}` — the user's own
    tier, never `/config` (D-20). Exercises land in muscle group `Other`.
  - categories, run types, shoes and watches are `/config` vocabulary, so they are
    created **only when the viewer is an admin**. For anyone else the name is still
    stored on the record and still joins by string, degrading to `--cat-none` exactly
    as a deleted category does.
  - **Featured exercises is the one place free entry must NOT create** — the shortlist
    points at lifts you already have history for (§6.3).
  - Reps, weight, heart rate, calories, duration and a run's moving time stay typed
    numbers. **Duration is not a picker** (D-47).
- **Ask for a duration, not an end time** (D-47). Start defaults to now and lives
  behind a "Change date & time" disclosure; `end_time` is derived. See §3.1.
- **Difficulty is a slider** (D-54) — a 1–10 rating is a judgement, not a measurement.
  Blank stays reachable; "not rated" must not collapse to 1.
- **Naming an exercise prefills it from the last session that logged it** (D-53), and
  **only when nothing has been typed into that group's sets** — the guard is what makes
  it safe, since the handler fires on every keystroke.
- **A new set inherits the previous one** (D-50) — `setLike`, a copy and not an alias.
- **"+ Add exercise" sits below the exercise list**, not above it (D-50).

### No explanatory prose in the chrome — D-48, D-55

Analytics, the monthly report, the admin panel and **Settings** carry no descriptive
paragraphs under their headings. The rules they used to narrate are all still enforced
in code. What stays: error messages, save state, designed empty states (§9), and the
bodyweight warning on a workout detail — those are *state*, not explanation.

### Analytics

Cross-category statistics over everything: total activities, total time, average
heart rate, streaks, volume over time, muscle-group balance, activity heatmap by day
of week × hour, place breakdown, training-partner breakdown.

> **Streaks are weekly, and weeks start Sunday (D-15).** A streak is **consecutive
> weeks containing at least one activity of any category** — not consecutive days, so
> a rest day never breaks it. Use `startOfWeek(d, { weekStartsOn: 0 })`, passed
> **explicitly** every time; never rely on the locale default. Show both the **current**
> streak and the **longest ever**, the longest with its date range. Computed on
> wall-clock dates per §3.6 — never UTC.

**This page reads from the category registry** so a future "Flights" category
contributes without editing the page's core.

### Two panels, not one (D-17b)

**`#/settings` — per-account.** Any signed-in user, editing their own profile.

- **Weight units (kg ⇄ lb)** — a **display-layer conversion only**. Storage stays
  `weight_kg` always. **Never write lb to the database.** The conversion lives in one
  formatting helper.
- Curate `featuredExercises` (reorderable).
- **Bodyweight value** — feeds volume only, never a record (§6.1).
- Calculator percentages and rounding increment.
- Default shoes and default watch.
- CRUD exercises (name + muscle group), places, people — per-user (NQ-1).
- Sign out.

**`#/admin` — global, admin only, route-guarded *and* hidden from nav.**

- **CRUD workout categories and run types.** Currently Push/Pull/Legs and Other/Light;
  the owner will change splits. Stored in `/config` as name + **color token id**,
  driving **all** color coding. Records referencing a deleted category **must not
  break — they degrade to `--cat-none`.**
- Rep-based exercise list (§6.1).
- Muscle-group list, including `Core`.
- Shoes and watches catalogs.

> A `user` sees `#/settings` but not `#/admin`. The `guest` account sees **neither** —
> it has no write access to anything.
>
> **`#/admin` is reached from Settings, not from the nav** (D-62) — the same
> sub-page shape as Records and the monthly report. `<RequireAdmin>` still guards
> the route; the nav entry only ever advertised it.
>
> **Sign out is at the bottom of Settings**, with one exception that is
> load-bearing: the nav keeps it for a viewer who cannot reach Settings. Settings
> is behind `<RequireWrite>`, so removing it outright strands the guest account
> signed in with no way out.

---

## 5. Design system

**Direction: editorial data-piece, dark.** The reference is The Pudding's near-black
visual essays, plus Nicholas Felton's Annual Reports and Datawrapper's default chart
craft.

### The grammar — follow precisely

- **Ground is near-black**: a very dark neutral with a slight hue cast (e.g.
  `#0C0C0F`) — **not `#000`, not a blue-grey slate**. Content sits directly on it.
  **There is no card layer.**
- **One saturated accent carries meaning.** A single vivid hue is the primary data
  color. Everything else is the ground plus 3–4 steps of dim neutral for labels,
  axes, and rules. Category colors are the *one* place additional hues appear, and
  they are a deliberate small set, not picked ad hoc.
- **Color encodes data, never decorates.** A sequential ramp appears only where a
  value is mapped to it (heatmaps, intensity). No gradient backgrounds, no gradient
  text, no accent glow.
- **Charts are made of discrete marks.** Prefer squares, dots, stipple, and thin bars
  over smooth area fills — a stippled bar reads as "counted things", which is what
  this data is. Where a continuous line is genuinely right (weight progression),
  keep it **hairline and unfilled**.
- **Typography inverts the usual weight.** Labels, axis ticks, legends, and metadata
  are **small, mono or small-caps, letter-spaced, and dim**. The numbers and the
  chart are **large and bright**. Axis labels feel like annotations on a plot, not UI
  chrome.
- **No container chrome.** No borders around cards, no shadows, no rounded corners
  beyond 2–4px. Separation comes from **whitespace and hairline rules only**.
- **Legends and toggles are inline chips** in the same small mono type — a row of
  switches sitting directly above the chart, not a settings panel.
- On **Records** and **Monthly Report**, push further editorial: **one huge figure
  per stat, dim label beneath, generous vertical rhythm.**

### Hard bans — these read as generated-by-default

- purple→blue (or any) gradient backgrounds; gradient text
- glassmorphism, `backdrop-blur`, translucent floating panels
- glowing / neon borders, colored box-shadows
- `rounded-3xl` cards with drop shadows as the default container
- **emoji used as iconography or in UI copy**
- untouched shadcn/ui, or Tailwind default palette straight out of the box
  (`bg-slate-800`, `text-gray-400`, …)
- animated gradient blobs, aurora backgrounds
- **`Inter` as the only typeface**
- **Light mode.** Dark only. Do not build one.

### Token layer

`src/styles/tokens.css` defines CSS custom properties; the Tailwind config **extends
from those tokens**. **No raw hex in components — ever.** If a component needs a
color that doesn't exist as a token, add the token.

**Validated values — 2026-08-14.** The categorical palette and the sequential ramp
were run through a colorblind-separation validator against the real `#0C0C0F` ground,
not chosen by eye. **The first draft of both failed** and these are the corrected
sets. Re-run the validator before changing any of them.

```css
:root {
  /* ground + neutrals */
  --ground:  #0C0C0F;   /* the only background. no card layer. */
  --rule:    #1E1E24;   /* hairline rules, chart gridlines */
  --ink-3:   #4A4A55;   /* axes, disabled */
  --ink-2:   #7A7A85;   /* labels, metadata, mono chrome */
  --ink-1:   #B6B6C0;   /* prose */
  --ink-0:   #F4F4F6;   /* headlines, big figures */

  /* the one accent — primary data color. 6.31:1 on ground. */
  --accent:      #FF5B2E;
  --accent-dim:  #8C2E17;   /* de-emphasised marks of the same series */

  /* categorical — VALIDATED. fixed order, never cycled. */
  --cat-1: #A15A09;   --cat-2: #15AF53;   --cat-3: #15A4B8;
  --cat-4: #0760BF;   --cat-5: #9C73FC;   --cat-6: #C40F77;
  --cat-none: #6B6B76;  /* uncategorized / deleted category — neutral, not error */

  /* sequential — VALIDATED. magnitude only. one hue, terminates on the accent. */
  --seq-1: #684035; --seq-2: #8C4836; --seq-3: #B15036;
  --seq-4: #D85634; --seq-5: #FF5B2E;

  --radius-sm: 2px;  --radius-md: 4px;   /* nothing larger exists */
}
```

**Categorical** — all six pass on *all pairs*: lightness band, chroma floor, contrast,
worst-pair ΔE 11.4 under deuteranopia (target 8.0), worst-pair ΔE 15.6 normal vision
(floor 15.0).

> **Do not "fix" `--cat-1` by brightening it.** It reads as a muddy bronze rather than
> a gold, and that is load-bearing. Red-green colorblindness collapses that hue axis,
> leaving lightness as the only cue — so the warm hue **must** sit darker than
> `--cat-2`. Three brighter golds were tested and all failed at ΔE 4.9–6.9, i.e.
> indistinguishable from the green for roughly 1 in 12 men.

**Sequential** — passes monotonicity, ΔL ≥ 0.06 per step, single hue (1° spread), and
a dark end clearing the ground at 2.21:1.

> **Zero is not on the ramp.** An empty heatmap cell is drawn as a `--rule` outline,
> not as `--seq-1`. "Never trained at 6am" must look different from "trained once".

The original draft failed for reasons worth remembering: every hue sat above the dark
lightness band, a pink/teal pair collapsed to ΔE 1.0 under deuteranopia, and the ramp
was neither single-hue nor visible at its dark end.

**Category colors are stored in `settings` as a token id** (`"cat-1"`), not a hex.
That keeps the palette coherent no matter what the owner names their splits, and
keeps "no raw hex in components" true even for user-chosen colors. Deleted or unknown
categories fall back to `--cat-none`.

### Type pairing — **decided: IBM Plex Sans + IBM Plex Mono** (D-14)

One **grotesk for prose**, one **mono with true tabular figures** for every number and
every label. Numbers in tables and stat blocks align vertically.

**Self-host and subset both in Phase 1** — no CDN request (the CSP on published pages
blocks them, and it helps the Lighthouse target). Verify tabular lining figures are
actually active before building any table or stat block.

The rationale, and the two runners-up, are kept below for the record.

**A. IBM Plex Sans + IBM Plex Mono — chosen.**
One superfamily designed together, so metrics, x-height, and terminals already agree;
Plex Mono ships genuine tabular lining figures and a full weight range for label
hierarchy; open-licensed and self-hostable (no CDN request — helps the Lighthouse
target); and it carries an established data-journalism association that lands
squarely on the Pudding/Felton/Datawrapper reference set. Downside: it is common in
developer tooling, so it can read as "default" if the layout doesn't carry weight.

**B. Archivo + Fragment Mono.**
Archivo is a grotesk drawn for high-performance small sizes — tight apertures, low
contrast — which is exactly the 375px data-dense case; Fragment Mono is a monospaced
cut of a neo-grotesk, so the pairing reads as one voice and feels more editorial and
less IDE-flavoured than Plex. Downside: Fragment Mono ships essentially one weight,
so label hierarchy has to come from letter-spacing and dimming alone — workable given
the grammar above, but less room to maneuver.

**C. Space Grotesk + JetBrains Mono.**
The most distinctive display voice; Space Grotesk's oddities give big headings real
character, and JetBrains Mono has excellent tabular figures across eight weights.
Downside: this design puts *every* number in the mono, so Space Grotesk only ever
carries prose — its personality is largely wasted, and its quirky digits would fight
the mono if they ever met.

### Charts

- Charts inherit the token palette. There is **no charting library** (D-34) — §5's
  discrete marks and near-invisible axes meant overriding everything recognisable
  about one, so each chart is drawn directly. Axes, ticks,
  tooltips, and legends completely.
- **Axes and gridlines recede to near-invisible** (`--rule` / `--ink-3`); data
  advances (`--accent`, `--ink-0`).
- Discrete marks by default (§ grammar). Hairline unfilled lines where continuous is
  genuinely right.
- Every chart has a **text alternative** — a caption or a visually-hidden table
  conveying the same values.

### Motion

Functional only: state transitions and chart entry. Nothing decorative, nothing
looping. **Respect `prefers-reduced-motion`** — under it, transitions collapse to
instant, chart entry animations do not run.

### `/styleguide`

A route rendering **every token and every component in isolation** so the system can
be reviewed without navigating the app. It is built in Phase 1 and kept current as
components are added — a component that isn't in the styleguide isn't done.

---

## 6. Records engine — exact specification

Two distinct definitions coexist. **Both are pure functions of the immutable set-log
history, computed client-side on every render, and NEVER written back to the
database.** There is no `records` node and there never will be.

Both live in `src/utils/prEngine.ts`.

### 6.1 All-time PR per exercise — `calculatePRs`

For each exercise, walk every logged set and track **three independent maxima, each
with the date it happened**:

- `maxWeight` — heaviest single set (`weight_kg`)
- `maxReps` — most reps in a single set. Only meaningful for rep-based/bodyweight
  exercises: Pull Up, Chin Up, Dip, Push Up, Muscle Up. **This list is configurable
  in `settings/repBasedExercises`, not hardcoded** (see `PLAN.md` OQ-6).
- `maxVolume` — highest single-set `weight_kg × reps`

Rules:

- **A set with `set_type === 'failure'` AND `reps === 0` is excluded entirely.** The
  lift wasn't completed: it can neither set a record nor count toward one. (Note the
  conjunction — a `failure` set with reps > 0 *does* count, and a `0`-rep set of any
  other type is a data oddity, not a failure.)
- A set with **no `reps` field at all** (there is one) contributes to nothing that
  needs reps — no `maxReps`, no `maxVolume`, no 1RM — but is not an error.
- **`daysSinceLastPR`** = days since the most recent of that exercise's relevant PR
  dates — weight + volume, plus reps if the exercise is rep-based.
- The record for an exercise is this **three-field struct (`PRData`)**, not a single
  scalar. Every consumer takes the struct.

> **Bodyweight — resolved (D-7, D-7b). This is the subtlest rule in the codebase.**
>
> **`weight_kg` has three distinct states, and they mean different things:**
>
> | State | Count | Means | Volume | PRs |
> |---|---|---|---|---|
> | a number > 0 | 1,220 | a real load | `weight × reps` | counts normally |
> | exactly `0` | 27 | **a genuine 0 kg** — assisted or unloaded machine work | `0` | counts as 0 |
> | **absent** | 27 | **bodyweight** | `settings.bodyweightKg × reps` | **reps only** |
>
> **Absent is never `0`.** Do not coalesce them, and do not let the parse layer
> default a missing `weight_kg` to zero — that silently converts bodyweight work into
> no work.
>
> **Bodyweight substitution applies to volume only, never to a record.** For an
> exercise whose sets lack `weight_kg`, `maxWeight` and `maxVolume` are **undefined**
> and render as `—`, never `0`; only `maxReps` is meaningful. The substituted
> bodyweight must never appear in `maxWeight`, `maxVolume`, `oneRM`, or any PR badge.
>
> **[verified]** The absent-weight sets span **9 exercises, not just Pull Up**:
> Pull Up (13), Back Extension (4), Hip Thrust (Barbell) (2), Hanging Knee Raise (2),
> Standing Calf Raise (2), Chin Up (Assisted) (1), Squat (Barbell) (1), Treadmill (1),
> Bent Over Row (Barbell) (1). Several are loaded barbell lifts where the number was
> simply not logged. Per D-7b those still receive bodyweight **in volume totals**;
> because substitution is confined to volume, no record is distorted.
>
> The **Featured fallback "top 3 by `maxWeight`" must skip** exercises with no
> `maxWeight` rather than ranking them as zero (§6.3).

### 6.2 Per-set PR badges — `computePRAchievements`

A finer-grained **chronological** pass, used to badge individual sets on detail pages
and in monthly summaries. Three record types per exercise:

- `weight` — `weight_kg`
- `volume` — `weight_kg × reps`
- `oneRM` — **Epley**: `weight_kg × (1 + reps / 30)`

The non-trivial rules — these are what the unit tests exist for:

1. **Sets are grouped into sessions** (same workout), and sessions are ordered
   **oldest → newest** by `start_time` (never by key — §3.1).
2. **Within a session, only the single best set per metric counts.** A session can
   improve a given record **at most once**, even if several sets that day beat the
   old max. Three sets over the old weight PR in one session = **one** weight badge,
   on the heaviest of them.
3. **A record can only be broken, not established.** An exercise's **very first
   session sets the baseline silently and produces zero badges**, no matter how many
   sets it contains.
4. **One set can earn multiple badges simultaneously** — e.g. heaviest weight *and*
   best estimated 1RM on the same set. The three metrics are independent.
5. The `failure` + `reps === 0` exclusion from §6.1 applies here identically.

> **There are exactly three record types. No `reps` badge (D-9).**
>
> Note the deliberate asymmetry with §6.1, which *does* track `maxReps`. Because this
> engine has no reps type, and because D-7 gives bodyweight exercises no `weight_kg`
> to work from, **purely bodyweight exercises can never earn a per-set badge.**
> Pull-up progress shows on the Records page as `maxReps`, but never as a badge on a
> set and never in the monthly "records broken" card.
>
> This was flagged to the owner and accepted. **Do not "fix" it by adding a fourth
> type** — that decision has already been made and reversed once.

### 6.3 Records page presentation

- **Featured** — the owner-curated `settings/featuredExercises` shortlist, shown
  first, **grouped by muscle group**. If empty, fall back to **top 3 by `maxWeight`**.
- **Hall of Fame** — every other exercise that has a record, grouped by muscle group,
  **sorted by `maxWeight` descending within group**.
- **Rep-based exercises display "Max Reps PR" as their headline stat** instead of Max
  Weight.
- **Each record gets its own detail page** carrying **one interactive plot of every
  set** — reps, weight and volume together, each toggleable, with **every PR event
  marked** (D-63). This supersedes the four per-session charts originally specified
  here (weight progression, 1RM curve, volume per session): they showed only each
  session’s best set, so a 5×5 and one heavy single looked identical.
  - **Never a second y-axis.** With two or more series on, each is drawn against its
    own maximum and the axis reads in percent; with one series on it reads in real
    units. A dual axis lets any correlation be manufactured by choosing where the
    axes cross, and is banned here as everywhere else.
  - **Warm-up and feeder sets are excluded** (D-64) — they are scaffolding at
    20–75% of the working load (§8), and plotting them makes every session a
    sawtooth. `dropset` and `failure` stay: those are the work, done hard.

---

## 7. Monthly report — exact specification

Also **never stored**. A pure recomputation over full workout + run history, scoped to
one calendar month (`startOfMonth` → `endOfMonth`), **diffed against the same
computation for the previous month**. Entry point `getMonthlySummary` in
`src/utils/workoutUtils.ts`.

**There is no "consistency score."** The comparison mechanism is
last-month-vs-this-month deltas on every stat card. Do not invent a composite index.

### Layer 1 — stat cards

Every `StatCard` shows `current` plus a delta vs `prev` (**absolute + %, arrow
up/down/flat**). An **`invertTrend`** flag flips arrow semantics for metrics where
lower is better — pace being the obvious one.

- **Activities** (workouts + runs combined): count; total duration with a
  `"Xh lifting · Yh running"` sub-breakdown; avg session time; avg heart rate across
  every session/run **that logged one** (absent and `0`-sentinel HR excluded from
  both numerator and denominator).
- **Workouts section**: volume (Σ `weight_kg × reps` over every set), total reps,
  total sets, avg volume per session.
- **Runs section**: distance, **avg pace = total run seconds ÷ total km** — a derived
  rate, **not a mean of per-run paces** — calories. (Elevation gain was retired,
  D-46.)

> **Workout and Run sections are hidden entirely, not zeroed, when neither this month
> nor last month had that activity type.** A lifter who never runs must not see a
> permanent empty Runs block.

### Layer 2 — muscle-group breakdown (workouts only)

Two charts from **one** `getVolumeByMuscleGroup` aggregation:

- **Sets per Muscle Group** — bar chart of set counts.
- **Radar chart** — toggleable between sets / reps / volume, restricted to primary
  movement groups. **`Core` and `Other` are excluded** — they distort the balance
  shape. (See §3.3: `Core` does not exist in the data yet.)

Plus **Main Exercises** (top lifts that month) and a full **session calendar** view.

### Layer 3 — records broken this month

Reuses `computePRAchievements`, filtered to `isSameMonth(a.date, month)`. Within that
filtered set, **collapse to one best achievement per exercise per record type** —
hitting the same PR type twice in a month shows only the heaviest instance.

Rendered as a **collapsible card**: closed shows a count
(`"3 personal records broken this month"`); expanded shows type totals as chips plus
a per-exercise line-item breakdown.

### Layer 4 — run list

That month's runs, **newest first**, as compact cards: type, distance, duration,
pace, HR, calories. **No aggregation** — this layer is a list.

### Trend charts

`getMonthlySeries` produces **one point per calendar month across all history** (not
just the selected month), so `MonthlyTrendChart` can plot selected metrics over time
with the current month highlighted. This is **separate from** the single-month
comparison cards.

### Access rule

The **current, in-progress month** sits behind a
`"still in progress, unlocks on [1st of next month]"` overlay by default, dismissible
**per-visit** via "Unlock anyway". Past months always open.

This is a **pure UX guard, not a data concept** — the aggregation runs regardless, and
the dismissal is `sessionStorage`, never the database.

---

## 8. Warm-up & feeder calculator

Lives inside the Workouts section (`#/workouts/calculator`). Input: **target working
weight**, and optionally the exercise (to remember per-exercise settings).

- **Warm-up sets** — 20–30% of working load for 6–12 reps. Purpose is blood flow and
  joint lubrication, **not fatigue**.
- **Feeder sets** — 2–3 progressive sets to lock in working weight and technique:
  - First feeder: **40–50%** of working load, **4–6 reps**
  - Second/third feeders: **50–75%** of load, reps dropping as weight rises so the
    lifter is fresh for the working set

Requirements:

- Output a **clean table: set · % · weight · reps.**
- **One total weight number per set. No plate breakdown, no per-side math** (D-12).
  Round to the nearest **2.5 kg** in kg mode and **5 lb** in lb mode; the increment is
  overridable in per-account settings (some machines and dumbbells step by 1–2 kg).
- **Respect the kg/lb display setting** (§4 — display layer only).
- **Percentages are editable and persisted** to per-account settings. Those ranges are
  a preference, not a law. Never hardcode them beyond a default.
- Saving percentages is a mutating control → hidden without write access.

---

## 9. Quality bar

- **TypeScript strict. No `any`.** Every Firebase read passes through the typed
  parse/normalize layer of §3.9; **components never touch raw DB shapes.**
- **Vitest** unit tests, minimum:
  - date round-tripping over every timestamp in `RTDB.json`
  - `calculatePRs` — including the `failure`+`0`-reps exclusion and the missing-`reps`
    set
  - `computePRAchievements` — **especially first-session-silent and
    one-badge-per-session-per-metric**
  - monthly aggregation, including section-hidden-when-absent
  - pace derivation (derived vs stored, and the `0`-sentinel fields)
  - calculator rounding
- **Loading and empty states for every data view.** Empty must be *designed*, not a
  bare "No data".
- **Error boundary at the route level.**
- Keyboard accessible, real focus states, semantic headings, **charts have text
  alternatives**.
- **Lighthouse: performance and accessibility ≥ 90 on mobile.** Practically this
  means route-level code splitting, modular Firebase imports,
  and self-hosted subsetted fonts.
- **No console errors or warnings in a clean run.**

---

## 10. Conventions

### Repo layout

```
src/
  categories/     registry.ts + one module per category (workouts/, runs/)
  components/     shared primitives — no category knowledge
  hooks/          useAuth, useIsOwner, data hooks
  lib/            firebase.ts, db.ts, dates.ts, units.ts
  pages/          route components
  styles/         tokens.css
  types/          raw DB types + app types
  utils/          prEngine.ts, workoutUtils.ts, runUtils.ts
database.rules.json
RTDB.json         committed fixture — NEVER read into context (§3.0)
```

### Naming and code

- Component files `PascalCase.tsx`; everything else `camelCase.ts`.
- Named exports; default export only where a router requires it.
- `weight_kg`, `start_time`, `avg_heart_rate` etc. keep **snake_case in raw DB types**
  (they mirror the wire shape); app types use `camelCase`. The mapping happens once,
  in the parse layer.
- Derived values are named for being derived: `paceSecPerKm`, `derivedPace` — never
  shadowing the stored `pace`.
- No barrel `index.ts` re-export files.

### Git

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`.
- One commit per phase, at the end of the phase, after typecheck + build pass.
- `.env.local` stays gitignored. `RTDB.json` is **committed** (it is a fixture, and
  the database is world-readable by design — see `PLAN.md` OQ-13).

### Things that will bite you — quick list

1. Workout keys are **opaque strings**; some look numeric. Order by `start_time` only.
2. Dates are `d MMM yyyy, HH:mm`, **unpadded day, no timezone**. Only `dates.ts`
   touches the string.
3. Run `avg_heart_rate: 0` / `calories: 0` are **"not recorded"**. Normalize to
   `null`.
4. `pace` is a **string**, and the derived value is the truth.
5. `weight_kg` is **absent** on bodyweight sets. One set has no `reps` at all.
6. 14 workouts have **no `category`** — neutral, never an error state.
7. Joins are **by name**, denormalized. Every join must be total.
8. RTDB arrays come back as **objects** when keys aren't contiguous.
9. `gyms` in the DB is **places** in the UI. One gym is `""`.
10. `weight_kg` is the only stored unit. **lb is display-only.**
11. Records and monthly reports are **computed, never stored.**
12. **The data is sacred.** No migrations, no renames, no restructuring.

---

## 11. Open questions

**OQ-1 … OQ-19 are all answered.** The answers are in `DECISIONS.md` as D-1 … D-19,
and are already folded into this file. `DECISIONS.md` is authoritative if the two ever
disagree.

**NQ-1 … NQ-4 are also answered** (D-20 … D-23): the exercise catalog is two-tier, a
scrubbed fixture is committed, `.gitignore` is corrected, and guest access runs through
a `/roles` node.

**Nothing is blocking. Phase 1 can start.**

If a new ambiguity appears mid-build, the rule from §0 still holds: **stop and ask, do
not pick silently**, and record the answer here and in `DECISIONS.md`.
