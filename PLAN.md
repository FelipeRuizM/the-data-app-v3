# PLAN.md — the-data-app-v3

Companion to `CLAUDE.md` (the spec) and `DECISIONS.md` (the record of every resolved
question).

Each phase is independently shippable, ends with a green typecheck + build, a working
GitHub Pages deploy, and one conventional commit. **Stop after every phase and wait
for "continue."**

---

## Status — 2026-08-14

**All 19 open questions are answered.** They are recorded as D-1 … D-19 in
`DECISIONS.md` and folded into `CLAUDE.md`. Part A of this file is gone; the questions
no longer live here.

**The data contract is verified**, not transcribed — `RTDB.json` was added and every
§3 figure re-derived from it. Five corrections came out of that pass, all recorded in
`DECISIONS.md`.

**Nothing is blocking.** NQ-1 … NQ-4 are answered too (D-20 … D-23): the exercise
catalog is two-tier, a scrubbed test fixture gets committed, `.gitignore` is fixed,
and guest access runs through a `/roles` node. **Phase 1 can start on approval.**

### What changed since the last version of this plan

D-3 replaced the auth model wholesale, and that reshapes the build:

- The app is now **multi-tenant with a login wall**, not one owner's data with public
  read. Every route except `#/login` requires authentication.
- Auth grew from "Google sign-in plus an owner check" into **four roles, a shared
  guest account, and a `/roles` node**. It is now its own phase, and it has to land
  before any read path, because reads are scoped to a profile. Per D-27 the provider
  is **email/password only** — Google is not used at all.
- Settings split into **two panels backed by two locations** — per-account
  `/users/{uid}/settings` and global `/config` — so one Settings phase became two.
- The monthly report is **one cross-category page** (D-8), not one per category.

Phases went 14 → 15.

---

## Phase 1 — Scaffold, tokens, styleguide, deploy pipeline

Ships an empty-but-live site, so a broken deploy is never diagnosed at the same time
as broken data logic.

- [ ] Vite + React + TypeScript **strict** scaffold; ESLint + Prettier
- [ ] `base: '/the-data-app-v3/'` in `vite.config.ts`
- [ ] Tailwind extending `src/styles/tokens.css`
- [ ] `tokens.css` with the **validated** values from `CLAUDE.md` §5 — do not
      substitute colors by eye; re-run the validator if any change is wanted
- [ ] **IBM Plex Sans + IBM Plex Mono self-hosted and subsetted** (D-14); verify
      tabular lining figures actually render before any table is built
- [ ] `HashRouter` shell: nav, route table, route-level error boundary, 404
- [ ] `/styleguide` rendering every token plus first primitives (Button, Chip,
      StatFigure, hairline Rule, category dot)
- [ ] GitHub Actions: build + deploy to Pages on push to `main`, six `VITE_*` injected
- [ ] `.gitignore` extended (`node_modules`, `dist`, coverage); `RTDB.json` and
      `.env.local` stay ignored (D-13, D-22)
- [ ] Deployed URL loads; `/styleguide` renders
- [ ] `feat: scaffold, design tokens, styleguide, and pages deploy`

## Phase 2 — Auth, roles, and the login wall  ·  *substantially bigger than before*

- [ ] Firebase init from `import.meta.env`, modular v10 imports
- [x] **Email/password provider only** (D-27) — no Google, no registration flow
- [ ] `#/login` — the only route reachable unauthenticated; everything else redirects
- [ ] `useRole()` → `admin | user | guest | none`; `useCanWrite(profileUid)`;
      `useIsAdmin()`. **`useIsOwner()` must not exist** (`CLAUDE.md` §2)
- [ ] Route guards: `#/admin` admin-only; write routes gated by `useCanWrite`
- [ ] `/roles` node populated from the console (D-23); `database.rules.json` deployed.
      **`/roles` must be client-unwritable** — verify a signed-in user cannot promote
      themselves to admin
- [ ] Provision the guest account; **verify by hand** that it reads the owner's
      profile and that every write is rejected by the rules, not merely hidden in the UI
- [ ] Verify a signed-out visitor can reach nothing but `#/login`
- [ ] Temporary role-state panel on `/styleguide`, removed in Phase 13
- [ ] `feat: auth, roles, and the login wall`

## Phase 3 — Data layer + Home  ·  *the hinge phase*

- [ ] Raw DB types and app types, kept separate (`CLAUDE.md` §3.9)
- [ ] `src/lib/dates.ts` — the only module touching the raw date string; round-trip
      test (verified: 174 timestamps, zero failures)
- [ ] **Generate and commit the anonymised fixture** (D-21) via a local script,
      preserving every edge case: both key styles, `weight_kg` in all three states,
      the set with no `reps`, sentinel zeros on a workout *and* a run, the mismatched
      pace, a workout with no category, single- and double-digit days
- [ ] **Merged exercise catalog** (D-20): `/config/exercises` ∪ the profile's own tier,
      merged by name with the user's entry winning on collision — unit-tested, and
      exposed as one catalog so nothing downstream knows there are two tiers
- [ ] `src/lib/db.ts` — **profile-scoped** typed reads for all six nodes plus
      `/config`; array-or-object coercion; `0 → null` sentinels **on workouts as well
      as runs**; derived `paceSecPerKm`; name-join resolution; duration guard (D-19)
- [ ] **The three-state `weight_kg` rule** (D-7b) in the parse layer, unit-tested:
      `> 0` real · `0` genuine zero · **absent ≠ zero**, absent means bodyweight
- [ ] `src/lib/units.ts` — kg/lb display conversion, one helper
- [ ] `/config` code-level defaults, read-through, no startup migration (D-17)
- [ ] `src/categories/registry.ts` — Workouts and Runs, components stubbed
- [ ] Home: registry-driven log buttons (hidden without write access) plus recent
      activity on real data, with designed loading and empty states
- [ ] `feat: typed multi-tenant data layer, dates module, and home`

## Phase 4 — Workouts list + detail (read-only)

- [ ] Scannable rows: date, title, category, volume, duration, HR
- [ ] Filters: category, place, person, date range
- [ ] Category colors from `/config` with code defaults; uncategorized → `--cat-none`
- [ ] Detail: every exercise, every set with type badge, notes, HR, people, place
      (PR badges deferred to Phase 8)
- [ ] 375px-first, then desktop; loading and empty states
- [ ] `feat: workouts list and detail`

## Phase 5 — Runs list + detail (read-only)

- [ ] List, filters, run-type color tokens
- [ ] Detail: **derived** pace, elevation, difficulty, steps, calories, shoes, watch;
      `—` for every sentinel zero; **no splits** (D-16)
- [ ] Registry drives both sections with no hardcoded ids
- [ ] `feat: runs list and detail`

## Phase 6 — Workout write path

- [ ] Create / edit / delete; exercise and set editor; place and people typeahead with
      create-on-the-fly
- [ ] Writes **byte-compatible with the existing schema** — absent fields stay absent
      (never written as `0`), dates round-trip, no sentinels invented
- [ ] Controls hidden without write access; delete confirms
- [ ] `feat: workout create, edit, and delete`

## Phase 7 — Run write path

- [ ] Create / edit / delete; `pace` written as the derived value
- [ ] **`shoes` and `watch`** on the form, defaulting from per-account settings (D-16)
- [ ] Sentinel fields written as absent, never `0`
- [ ] `feat: run create, edit, and delete`

## Phase 8 — Records engine + Records pages

- [ ] `calculatePRs` per D-7: **reps-only ranking** for bodyweight exercises;
      `maxWeight` / `maxVolume` undefined → `—`, never `0`
- [ ] `computePRAchievements` — **exactly three types, no reps badge** (D-9); session
      grouping; one badge per session per metric; first session silent; Epley 1RM;
      `failure`+`0`-reps exclusion (verified: matches 0 sets today, keep as a guard)
- [ ] Vitest coverage of both engines, **especially the two non-trivial rules**
- [ ] Featured (fallback top-3 by `maxWeight`, **skipping undefined**) + Hall of Fame
- [ ] Per-exercise detail: progression, 1RM curve, volume per session, PR events marked
- [ ] PR badges backfilled into the workout detail page
- [ ] **Runs Records page** (D-10): fastest pace, longest distance, longest duration,
      most elevation, most steps — each `{ value, date, runId }`
- [ ] `feat: pr engine and records pages`

## Phase 9 — Monthly report, layers 1–2  ·  *one cross-category page at `#/reports/:yyyy-MM`*

- [ ] `getMonthlySummary` + `getVolumeByMuscleGroup`
- [ ] **Volume uses the bodyweight substitution** (D-7) — a bodyweight session must not
      total zero; unit-test that explicitly
- [ ] Stat cards with absolute and % deltas, arrows, `invertTrend` for pace
- [ ] Workout / Run sections **hidden entirely** when absent from both months
- [ ] Sets-per-group bars; radar toggling sets/reps/volume with `Core` and `Other`
      excluded; main exercises; session calendar
- [ ] Aggregation tests: hidden-section rule, derived average pace (total seconds ÷
      total km, never a mean of per-run paces)
- [ ] `feat: cross-category monthly report — stat cards and muscle groups`

## Phase 10 — Monthly report, layers 3–4 + trends

- [ ] Records broken this month, one best per exercise per type, collapsible
- [ ] That month's runs, newest first, compact cards, no aggregation
- [ ] `getMonthlySeries` + trend chart across all history, selected month highlighted
- [ ] In-progress-month overlay with "Unlock anyway", dismissed per visit
- [ ] Month navigation and deep links
- [ ] `feat: monthly report records, run list, and trends`

## Phase 11 — Warm-up & feeder calculator

- [ ] Computation across the §8 ranges
- [ ] **One total weight per set**, nearest 2.5 kg / 5 lb, increment overridable (D-12)
- [ ] kg/lb display setting respected; optional per-exercise memory
- [ ] Unit tests for rounding and percentage edge cases
- [ ] `feat: warm-up and feeder calculator`

## Phase 12 — Settings (per-account)

- [x] Units toggle (display layer only, D-18)
- [x] Reorderable featured exercises
- [x] **Bodyweight value** — wired into volume, never into a record
- [x] Calculator percentages and rounding increment
- [x] Default shoes / default watch
- [x] CRUD the user's **own** exercise tier (name + muscle group, incl. `Core`), places,
      people. Creating an exercise never writes to `/config` (D-20)
- [x] **Rename cascade** as one atomic multi-path update with an affected-record count;
      **deletion blocked while referenced**, "rename and merge" offered (D-5)
- [x] Sign out
- [x] `feat: per-account settings`

## Phase 13 — Admin panel (global config)

- [x] Route-guarded to `admin`, hidden from nav for everyone else
- [x] **Seed `/config/exercises` from the existing 74** — `scripts/seed-config-exercises.mjs`,
      dry-run by default. Verifies every historical `exercise_title` still resolves and
      refuses to write otherwise. **Not yet run against the live database** — needs the
      owner's credentials
- [x] CRUD the **global base** exercise catalog — **add and re-file only**. Rename and
      delete would have to write other profiles, which the rules forbid, so they are
      console operations and the panel says so (D-31)
- [x] CRUD workout categories and run types, colors as **palette token ids** (D-17);
      deleted categories degrade to `--cat-none` on existing records
- [x] Rep-based exercise list (D-6)
- [x] Muscle-group list including `Core`
- [x] Shoes and watches catalogs
- [x] Temporary role panel removed from `/styleguide`
- [x] `feat: global admin panel`

## Phase 14 — Analytics

- [x] Aggregation driven **entirely** by the category registry
- [x] Totals, time, average HR, volume over time, muscle-group balance
- [x] **Weekly streaks starting Sunday** (D-15) — current and longest, longest with its
      date range; `weekStartsOn: 0` passed explicitly; unit-tested
- [x] Day × hour heatmap on the sequential ramp, **zero drawn as an outline, not
      `--seq-1`**; place and partner breakdowns
- [x] Every chart hand-drawn rather than restyled off Recharts, which is never
      imported (D-34); each carries a visually-hidden table of the same numbers
- [x] `feat: cross-category analytics`

## Phase 15 — Quality pass

- [x] Full Vitest suite green against every item in `CLAUDE.md` §9
- [x] Keyboard nav, real focus states, semantic headings, chart text alternatives,
      `prefers-reduced-motion` honoured
- [x] Lighthouse on mobile: **performance 97, accessibility 100, best practices 100**
      on `#/login` — the only route measurable without a session. Route-level code
      splitting done; no Recharts to lazy-load (D-34); the popup/redirect resolver
      dropped (D-36). Accessibility verified on **every** route with axe: 0 violations
- [x] Loading / empty state audit; no bare "No data"
- [x] Console clean on a fresh run
- [x] `chore: quality pass — tests, a11y, and lighthouse`

---

## Notes on sequencing

- Phase 1 ships a live site before any data code exists; Phase 2 makes it private
  before any real data is on it. In that order, deliberately.
- **Phase 2 is the risky one now.** Roles, two providers, and rules that must be
  verified from the guest's side rather than the owner's — a mistake here is a data
  leak, not a layout bug. Budget for hand-verification, not just a green build.
- Phase 3 is the hinge: the data layer plus exactly one real page. Nothing broadens
  until it is deployed and correct.
- Read paths (4–5) precede write paths (6–7), so a bug in the parse layer surfaces
  before it can be written back into a sacred database.
- Settings (12) precedes the admin panel (13) because per-account settings feed the
  engines built in 8–11; global config only feeds presentation.
- Analytics is last of the feature phases: the widest page, and the one most likely to
  expose a registry abstraction that didn't hold.

## Phase 16 — Exercise ids (D-40)

- [x] `exercise_id` added to the raw and app types, **alongside** `exercise_title`
- [x] Parse layer resolves id → name → merged catalog, keeping D-20’s two-tier rule;
      a dangling id falls back to the stored title (§3.7)
- [x] The writer stamps `exercise_id` on every save where the title is catalogued
- [x] `scripts/add-exercise-ids.mjs` — dry-run by default, refuses to write unless
      every id resolves back to the name already stored, re-verifies live afterwards
- [x] Verified offline against the real export: 385/385 entries resolve, 0 unresolved
- [ ] **Run against the live database** — blocked on D-41, the owner-uid mismatch
- [ ] Enable base-exercise rename in the admin panel — only once records carry ids
- [x] `feat: exercise ids, written alongside names`

## Phase 17 — Category and run-type ids (D-42)

- [x] `category_id` on workouts and `type_id` on runs, **alongside** the names
- [x] Parse layer adopts the /config row’s current name; an unresolvable id falls
      back to the stored name, so §4’s `--cat-none` degradation still holds
- [x] Both writers stamp the id — but only for a vocabulary that came from the
      database, never from the code-level defaults (D-43)
- [x] `scripts/add-category-ids.mjs` — dry-run by default, self-healing (D-44)
- [x] `add-exercise-ids.mjs` re-stamps stale ids instead of skipping them (D-44)
- [ ] **Run both against the live database** — still blocked on D-41, and the
      category script additionally needs real /config rows to point at
- [ ] Retire the D-32 cascade — only once every profile’s records carry ids
- [x] `feat: category and run-type ids`

## Phase 18 — Logging ergonomics and a data-model trim (D-45 … D-51)

Owner-requested, not from the original brief. The log forms are the surface the app is
actually used through, and most of this is about making them answerable one-handed.

**Forms**

- [x] `SelectInput` — a `<select>` wherever the value comes from a known set (D-49),
      keeping an unknown stored value selectable and `allowCreate` for places and
      exercises only
- [x] Start defaults to now behind a disclosure; the form asks for a **duration** and
      derives `end_time` (D-47) — round-tripped over every fixture workout
- [x] A new set is prefilled from the previous one (D-50)
- [x] "+ Add exercise" moved below the exercise list (D-50)
- [x] Run difficulty is a 1–10 picker

**Data model**

- [x] `calories` on workouts — additive, same `0 → null` sentinel (D-45)
- [x] Elevation and steps retired from runs at every surface, **retained in the
      record** so an edit cannot delete them (D-46)

**Analytics**

- [x] Total volume in tonnes, short tons in lb mode (D-51)
- [x] Explanatory prose removed from Streaks, Muscle-group balance, the radar and the
      whole admin panel (D-48)

- [x] `feat: logging ergonomics, workout calories, retired run fields`

**Not done, deliberately:** workout calories is not a monthly-report stat card — the
Workouts section is a four-card grid and a fifth would sit alone. The elevation and
steps values are still in the database and still round-trip; only the app stopped
using them.

## Phase 19 — Corrections from actually using it (D-52 … D-55)

Owner feedback after Phase 18 shipped. Three of these reverse decisions made a day
earlier, which is what the feedback was for.

- [x] **No form control below 16px** — the iOS zoom-on-focus bug, fixed with one
      unlayered rule so no utility can override it. Verified against the built CSS.
- [x] `ComboBox` replaces `SelectInput` everywhere: type, filter on a substring, and
      a name that matches nothing gets created (D-52). Per-user catalogs create
      always; `/config` vocabulary creates for an admin, and degrades gracefully
      otherwise
- [x] Naming an exercise prefills its sets from the last session that logged it,
      guarded so it can never overwrite typed input (D-53)
- [x] Difficulty is a slider; duration is a plain number field again (D-54)
- [x] Every explanatory description and hint removed from **Settings** too — D-48 had
      only done Analytics, the report and the admin panel (D-55)

- [x] `fix: no zoom on focus, real comboboxes, prefill from last session`

**Superseded:** D-49 (a `<select>` wherever the value comes from a known set) and the
duration picker half of D-47. The rest of D-47 — start defaults to now, `end_time`
derived — stands.

## Phase 20 — Version counter (D-56)

- [x] `src/version.ts` — `APP_VERSION`, the single version string in the repo
- [x] Rendered beside the app name in the header and on the login screen
- [x] `CLAUDE.md` §0 rule 6: bump it in the same commit as every deploy, and report
      the number
- [x] `chore: version counter, starting at 3.0`

**Deployed as 3.0.**

## Phase 21 — Log-form ergonomics, round two (D-57 … D-60)

- [x] Category is a row of colour-carrying pills; tapping the selected one clears it
- [x] People are typed in, not toggled off a wall of chips — and `ComboBox`'s
      duplicate accessible name (listbox vs input) fixed along the way
- [x] Per-set seconds off the form, retained in the record
- [x] `normal` is displayed as **working** — `SET_TYPE_LABEL`, display only
- [x] **Form controls added to `/styleguide`**, which had none — closing a standing
      §5 gap ("a component that isn't in the styleguide isn't done")
- [x] `feat: category pills, typed people, working sets`

**Deployed as 3.1.**

## Phase 22 — One shared profile read (D-61)

- [x] `<ProfileProvider>` — one `loadProfile` for the session, outside `<Routes>`
- [x] `useProfile` reads context and throws without a provider
- [x] `invalidateProfile()` returns a promise; `writes.ts` and `useSave` await it
- [x] Refetch on returning to the tab, when the data is older than 30s
- [x] Tests prove the two claims directly: navigation issues **no** read, and the
      write-then-navigate destination never renders against the old profile
- [x] `perf: one profile read for the session, refresh on return`

**Deployed as 3.2.**

## Phase 23 — Admin under Settings, sign out out of the nav (D-62)

- [x] `SubNav` extracted; `CategorySubNav` delegates to it
- [x] Admin linked from beside the Settings heading, with a `← Settings` back link
- [x] Admin removed from the primary nav (still `<RequireAdmin>`-guarded)
- [x] Sign out removed from the nav — **except** for a viewer who cannot reach
      Settings, or the guest account would have no way out
- [x] The last stray Settings description removed
- [x] `feat: admin under settings, sign out at the bottom of settings`

**Deployed as 3.3.**
