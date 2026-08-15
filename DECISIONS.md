# DECISIONS.md

Chronological record of every decision that resolved an ambiguity in the brief.
Append-only — never edit an entry retroactively. If a decision is reversed, add a
new entry that supersedes it and say so.

Companion to `CLAUDE.md` (the durable spec) and `PLAN.md` (the build order).

---

# 2026-08-14 — Data contract verified against the real export

`RTDB.json` (352 KB) was added to the project root and re-derived with a throwaway
script. **Every §3 figure in `CLAUDE.md` is now verified, not transcribed.** The
export is *not* committed (see D-13); the script is not part of the repo.

Confirmed exactly as the brief described: 81 workouts (37 numeric-string keys, 44
push IDs), 1,274 sets, set-type distribution, 385 exercise entries, 291 with notes,
12 runs, 74 exercises, 5 gyms, 7 people, muscle groups with **no `Core`**, run types
`Other` (11) / `Light` (1), and `settings` holding only `featuredExercises` (9).

**Date format fully confirmed.** All 174 timestamps match `d MMM yyyy, HH:mm`
exactly — zero non-conforming, zero zero-padded days, zero round-trip failures.

### Drift from the brief — five corrections

1. **No empty-string `gym`.** The brief claimed one record had `""`. All 81 resolve.
   Referential integrity is currently perfect across exercises, gyms, locations and
   people — zero unresolved names anywhere.
2. **`failure` + `reps === 0` matches zero sets.** The §6.1 exclusion rule is real
   but currently inert. Kept as a defensive guard, not deleted — it protects the
   engine the first time such a set is logged.
3. **27 sets have `weight_kg` exactly `0`** — never mentioned in the brief. See D-7b.
4. **Sets with no `weight_kg` span 9 exercises, not just Pull Up.** The brief said
   "13 Pull Up sets". Reality: 27 sets across Pull Up (13), Back Extension (4), Hip
   Thrust (Barbell) (2), Hanging Knee Raise (2), Standing Calf Raise (2), Chin Up
   (Assisted) (1), Squat (Barbell) (1), Treadmill (1), Bent Over Row (Barbell) (1).
   Several are loaded barbell lifts. See D-7b.
5. **One workout has `avg_heart_rate: 0`.** The brief framed the `0` sentinel as a
   runs-only concern. It is not — the normalization must cover workouts too.

### Two further findings

- **The stored `pace` is wrong on one of 12 runs**: `"8:00"` stored against 450s/km
  derived — a 30s/km gap. Concrete justification for treating the derived value as
  truth (`CLAUDE.md` §3.2).
- **The array-vs-object trap does not currently manifest** — all `exercises`, `sets`
  and `people` nodes are real arrays. The coercion in §3.8 stays as a write-path
  guard, since RTDB collapses sparse arrays on future writes.
- **All 81 workout durations are sane** — none non-positive, none over 8h. D-19's
  guard is therefore defensive only.

---

# 2026-08-14 — Open questions OQ-1 … OQ-19 resolved

## D-1 · `RTDB.json` added ✅
**Decision:** file added to the project root; contract verified (above).

## D-2 · `VITE_OWNER_UID` added ✅
**Decision:** present in `.env.local`. All six `VITE_*` values must also be injected
by the GitHub Action at build time.

## D-3 · Auth model — **replaces the brief's public-read model entirely**
**Decision:** four roles, and a login wall.

| Role | Can |
|---|---|
| **Admin** (owner, `VITE_OWNER_UID`) | everything a user can, plus the global admin panel |
| **User** (invited account) | view, create, edit, delete **within their own profile** |
| **Guest** (one shared account) | read-only, pointed at the owner's profile |
| **Everyone else** | sees the login screen and nothing else |

**This reverses three things in the brief:** there is now a login wall; content is
no longer world-readable; and the app is multi-tenant rather than one owner's data
with public read.

**Sub-decisions:**
- **Invite-only.** No public sign-up. Accounts are provisioned by the owner. Chosen
  to keep scope near the brief — no registration flow, no per-user seeding of
  lookup tables, no abuse or quota surface.
- **Guest is a shared email/password credential reading the owner's profile.**
  This requires enabling the **email/password provider** alongside Google — Google
  alone cannot express a shared guest login. Chosen because a guest seeing real data
  demonstrates the app; an empty profile does not.
- **Accepted consequence:** anyone given the guest credential can read real workout
  titles, training-partner names, and places. Acknowledged and accepted.
- `useIsOwner()` is no longer sufficient. Replaced by a `useRole()` hook returning
  `admin | user | guest | none`, plus `useCanWrite(profileUid)`. Write controls stay
  **hidden**, never disabled.
- **Rules are the boundary.** `.read: true` is gone; reads require `auth != null`.

## D-4 · Add `Core` muscle group ✅
**Decision:** add `Core` as a seventh value. Nothing is reassigned automatically —
the owner re-files exercises through the admin panel. No migration: `muscleGroup` is
a plain string. Verified: only 2 exercises currently sit in `Other`.

## D-5 · Renames cascade, deletes are blocked ✅
**Decision:** renaming an exercise, place or person rewrites every referencing record
in **one atomic multi-path update**, behind a confirm dialog stating the affected
record count. Deleting an entity that is still referenced is **blocked**, with
"rename and merge" offered instead — a cascading delete would destroy log history.

## D-6 · Rep-based exercise list lives in the admin panel ✅
**Decision:** global, admin-only, editable in the admin panel. See D-17b for the
global-vs-per-account split.

## D-7 · Bodyweight — reps for PRs, bodyweight for volume ✅
**Decision:** a hybrid of the two options originally offered.
- **PRs:** bodyweight exercises rank on **reps only**. `maxWeight` and `maxVolume`
  are not tracked for them and render as an em dash, never `0`.
- **Volume:** aggregate volume calculations (monthly totals, volume per muscle
  group, volume per session) **do** substitute the bodyweight value from settings,
  so a pull-up session is not counted as zero work.
- The Featured fallback "top 3 by `maxWeight`" must **skip** exercises with no
  `maxWeight` rather than ranking them as zero.

## D-7b · `weight_kg` — zero is real, absent is bodyweight ✅
**Decision:** `weight_kg === 0` is a **genuine 0 kg** (assisted or unloaded machine
work) and is counted as such. An **absent** `weight_kg` means bodyweight, and gets
the settings bodyweight substituted for volume purposes.

**Consequence, accepted knowingly:** absence is treated as bodyweight regardless of
exercise, so the 4 Back Extension, 2 Hip Thrust (Barbell), 1 Squat (Barbell), 1 Bent
Over Row (Barbell) and 1 Treadmill sets with no logged weight will each contribute
bodyweight × reps to volume totals. Because D-7 confines bodyweight substitution to
*volume only*, this cannot distort any PR or record.

## D-8 · One cross-category monthly report ✅
**Decision:** a single report at `#/reports/:yyyy-MM` combining workouts and runs,
built as §7 specifies, linked from both category sections. §7 beats §4's one-line
index. Reads the category registry, so future categories contribute without a rewrite.

## D-9 · No reps badge ✅
**Decision:** `computePRAchievements` keeps exactly three record types — `weight`,
`volume`, `oneRM`. No fourth type.
**Consequence, flagged and accepted:** combined with D-7, bodyweight exercises can
never earn a per-set PR badge. Pull-up progress appears on the Records page via
`maxReps`, but never as a badge on a set or in the monthly "records broken" card.

## D-10 · Runs get a lightweight Records page ✅
**Decision:** one personal best per metric over full run history — fastest pace
(derived, not stored), longest distance, longest duration, most elevation gain, most
steps — each `{ value, date, runId }`. No session grouping, no badge engine.

## D-11 · Plain hooks + context ✅
**Decision:** no React Query, no state library. ~93 records loaded once, RTDB already
pushes realtime updates over its own socket, no cache-invalidation problem to solve.

## D-12 · Calculator outputs one total weight ✅
**Decision:** one total number per set, no plate breakdown and no per-side math.
Rounded to the nearest **2.5 kg** in kg mode and **5 lb** in lb mode, with the
increment overridable in settings.

## D-13 · `RTDB.json` is not committed ✅
**Decision:** stays gitignored. Real workout titles, partner names and places do not
enter public git history.
**Open consequence — see NQ-3:** the §3.6 round-trip test was specified to run over
every timestamp in `RTDB.json`. With the file absent from CI, that test needs a
committed fixture.

## D-14 · Type pairing — IBM Plex Sans + IBM Plex Mono ✅
**Decision:** delegated to me; taking recommendation A. One superfamily designed
together, genuine tabular lining figures, full weight range for label hierarchy,
open-licensed and self-hostable (no CDN request, helps the Lighthouse target), and an
established data-journalism association that lands on the reference set.

## D-15 · Weekly streaks, weeks start Sunday ✅
**Decision:** a streak is **consecutive weeks containing at least one activity of any
category**, weeks running Sunday→Saturday (`weekStartsOn: 0`, set explicitly, never
left to locale). Both current and longest streak are shown, the longest with its date
range. Computed on wall-clock dates per §3.6 — never UTC.

## D-16 · Runs — no splits; add `shoes` and `watch` ✅
**Decision:** splits are **not derivable** from this schema (totals only, no GPS or
per-km data) and are omitted rather than faked from average pace.

The run logging workflow is: Strava on the watch records it, then the values are
transcribed into the app. Two **new optional fields** are added to `runs/{id}`:

| Field | Default |
|---|---|
| `shoes` | `"Adidas Ultraboost 21"` |
| `watch` | `"Apple Watch Series 8"` |

Both verified absent from all 12 existing records — so they are purely additive and
require no migration, per the data-is-sacred rule. Each is a **denormalized name
string**, consistent with every other join in this database, resolving against
catalogs the owner can edit. Defaults are per-account (Settings page), the catalogs
are global (admin panel) — see D-17b.

## D-17 · Categories and run types seed from code ✅
**Decision:** code-level defaults for the five known values (Push / Pull / Legs,
Other / Light). The app reads stored values if present and falls back to defaults if
not, so nothing is written to the database until first edit. Color is stored as a
**palette token id** (`"cat-3"`), never a hex — that is what keeps "no raw hex in
components" true once colors are user-editable. Unknown or deleted categories render
`--cat-none`.

## D-17b · Global vs per-account settings — split by panel ✅
**Decision, in the owner's words:** *settings in the admin panel are global; settings
in the settings page are account-only.*

| Admin panel — **global**, admin-only | Settings page — **per-account** |
|---|---|
| workout categories (name + token) | weight units (kg / lb) |
| run types (name + token) | featured exercises |
| rep-based exercise list (D-6) | bodyweight value (D-7) |
| muscle-group list (incl. `Core`) | calculator percentages + rounding increment |
| shoes catalog · watches catalog | default shoes · default watch |

Global config lives in a new top-level node, separate from `/users/{uid}/settings`.
This is a **second settings location**, which the brief warned against — accepted
because the brief predates the multi-account model, and app vocabulary shared by all
accounts genuinely cannot live inside one user's subtree.

**Not moved:** `exercises`, `gyms` and `people` stay per-user at their existing paths
— see NQ-1.

## D-18 · Units are per-account ✅
**Decision:** `units` lives in each account's own settings (Settings page, per D-17b).
Because every viewer is now signed in, this is naturally per-viewer with no
`localStorage` override needed. Display-layer only — storage stays `weight_kg`, always.

## D-19 · Duration guard ✅
**Decision:** delegated to me. The parse layer computes `durationMinutes` and returns
`null` for any non-positive or implausible (> 8h) value, which renders as an em dash
and drops out of averages. Never throws, never shows a negative.
**Verified:** all 81 current workouts are sane, so this is purely defensive.

---

# 2026-08-14 — Email/password only

## D-27 · Email/password is the only provider — **supersedes part of D-3**
**Decision:** drop the Google provider entirely. **Every role — admin, user and
guest — signs in with email and password.**

D-3 specified "Google *and* email/password", with Google as the normal path and
email/password existing only so a shared guest credential was possible. That split
is now gone. What D-3 got right is unchanged: four roles, invite-only, a login wall,
and guest as a read-only role.

**Why this is simpler, not just different:**
- One code path, one form, one set of error messages. The login page was a Google
  button with a demoted secondary form; it is now a single form.
- Invite-only is more honest. With Google, anyone on earth could complete a sign-in
  and only *then* be told they aren't provisioned. Now an account has to be created
  by the owner in the Firebase console before sign-in can succeed at all — the
  `/roles` check becomes a second gate rather than the only one.
- No popup flow, so no popup-blocked / popup-closed failure modes to handle.

**Consequences:**
- `signInWithGoogle` and `signInAsGuest` are replaced by a single `signIn(email,
  password)`. `GoogleAuthProvider` and `signInWithPopup` are gone.
- The Google provider can be disabled in the Firebase console.
- Sign-in errors deliberately collapse `invalid-credential`, `wrong-password`,
  `user-not-found` and `invalid-email` into **one** message. Distinguishing "no such
  account" from "wrong password" would tell an attacker which emails are registered.
- **This is very likely why the owner UID changed** from `3WonULS2gRZwtJ6OAh7YpM1Sn9v1`
  to `oaM2fM7K52ak6EzqDNzDzXSRWXr1`: the former was the Google identity, the latter is
  the email/password account. The data migration in NQ/D-20 notes is what reconciles
  them.

---

# 2026-08-14 — Phase 1 tooling deviations

Three places where what shipped differs from what `PLAN.md` said. Each is logged
per `CLAUDE.md` §0 rule 5 rather than changed silently.

## D-24 · oxlint instead of ESLint
**Spec said:** "ESLint + Prettier."
**Shipped:** **oxlint + Prettier.**

The Vite React-TS template no longer scaffolds ESLint — it ships `oxlint` with an
`.oxlintrc.json` already wired. Adopting it costs zero dependencies; switching to
ESLint would mean adding the parser, the React and hooks plugins and a flat config
to replace something already working. oxlint covers the same ground here and is
substantially faster in CI. It already earned its place: it caught a `setState` in
`componentDidUpdate` in the error boundary, which was fixed properly by keying the
boundary on the route rather than suppressed.

Prettier is unchanged. Revisit only if a needed rule turns out to be ESLint-only.

## D-25 · Tailwind v4, configured in CSS rather than `tailwind.config.js`
**Spec said:** "Tailwind config extends from those tokens."
**Shipped:** Tailwind **v4**, which has no JS config file by default. The token layer
is `src/styles/tokens.css`, and `@theme inline` in `src/index.css` re-exports those
custom properties so utilities (`bg-ground`, `text-ink-2`, `text-fig`, …) generate
straight from them.

This satisfies the intent **more strictly** than a JS config would: the tokens are
the literal source of the utilities, so a colour can't exist as a utility without
existing as a token first. "No raw hex in components" is now enforced by
construction, not convention.

## D-26 · No manual chunking yet
`vite.config.ts` deliberately has no `manualChunks`. Firebase and Recharts aren't
imported anywhere until Phases 2 and 4, so configuring splits now would define empty
chunks — and the object form of that option has moved in the current bundler.
Code splitting is a **Phase 15** task, where it can be measured against the
Lighthouse target instead of guessed at.

---

# 2026-08-14 (later) — NQ-1 … NQ-4 resolved

## D-20 · Exercise catalog is two-tier: global base + per-user additions ✅
**Decision:** *base exercises are global; exercises a user creates are theirs.*

```
/config/exercises/{pushId}      → { name, muscleGroup }   admin-editable, shared
/users/{uid}/exercises/{pushId} → { name, muscleGroup }   user-editable, private
```

The **effective catalog** for any profile is the global base **merged with that
user's own additions**, resolved at the parse layer. Everything downstream — muscle
group lookup, Records grouping, the radar chart — consumes the merged view and never
knows which tier an exercise came from.

Rules:
- **On a name collision, the user's entry wins.** That lets someone re-file a base
  exercise into a different muscle group without an admin, and without mutating shared
  data. Merging is by `name`, because name is the actual join key (§3.7).
- **Only admin writes `/config/exercises`.** A user creating an exercise always writes
  to their own tier, never the global one.
- **The rename cascade (D-5) spans both tiers.** Renaming a base exercise rewrites the
  history of *every* profile that references it — an admin-only action, behind a
  confirm that states how many records across how many profiles are affected.
- **Deleting a base exercise is blocked while any profile references it** (D-5).

**Seeding:** the existing 74 exercises are seeded into `/config/exercises` as the base
catalog, and the owner's per-user tier starts empty. This is safe precisely because
**joins are by name string** — every historical `exercise_title` keeps resolving
against the merged catalog, so no workout record changes and no migration occurs. It
is still a deliberate write to the live database: it runs as a reviewed one-off
script in Phase 13, not silently at startup.

**`gyms` and `people` stay per-user**, unchanged at their existing paths. Your 5 places
and 7 training partners are personal data, not shared vocabulary. Only the exercise
catalog is two-tier.

## D-21 · Tests run against a committed anonymised fixture ✅
**Decision:** a scrubbed fixture is generated from the real export and **committed**.
`RTDB.json` itself stays gitignored (D-13).

The fixture must preserve every edge case the real data contains, because these are
exactly what the engines get wrong:
- both key styles — numeric-string and push ID
- `weight_kg` in all three states: `> 0`, exactly `0`, and **absent**
- the set with no `reps`
- `avg_heart_rate: 0` on a workout **and** on a run; `calories: 0`
- the run whose stored `pace` disagrees with the derived value
- a workout with no `category`, and one with no `people`
- single-digit and double-digit days in `start_time`

Titles, descriptions, notes, place names and people names are replaced with neutral
strings. A generation script runs locally against the real export. The full
174-timestamp round-trip stays a local check; CI runs the fixture.

## D-22 · `.gitignore` corrected ✅
**Decision:** ignoring `CLAUDE.md` and `PLAN.md` was an accident. Both are now tracked,
along with `DECISIONS.md`. `.env.local` and `RTDB.json` remain ignored.

## D-23 · Guest access via a `/roles` node ✅
**Decision:** delegated to me. Roles live in a top-level `/roles/{uid}` node rather
than in custom claims or a UID allowlist inside the rules.

```
/roles/{uid} → { role: "admin" | "user" | "guest", readsProfile?: "<uid>" }
```

- `readsProfile` grants read access to one other profile. The guest account carries
  `{ role: "guest", readsProfile: "<owner uid>" }`.
- **`/roles` is world-readable to signed-in users and writable by nobody** — not even
  admin, from the client. It is maintained from the Firebase console or a server-side
  script. That makes privilege escalation impossible from the app: a compromised
  client cannot promote itself.
- Chosen over **custom claims** because those need a Cloud Function or admin-SDK
  deployment, which this project otherwise doesn't have, and they only refresh when
  the ID token does. Chosen over a **UID allowlist in the rules** because adding a
  second guest would then mean editing and redeploying security rules.

Trade-off accepted: role lookup costs one extra read, and rules reference
`root.child('roles')`, which is slightly slower to evaluate. Both are negligible at
this data size.

---

# 2026-08-15 — Phase 12, per-account settings

## D-28 · A base exercise can be re-filed from Settings, but not renamed or deleted ✅
**Question:** D-20 makes the exercise catalog two-tier and says a user may "re-file a
base exercise into a different muscle group without an admin". What, concretely, does
the Settings page let a user do to a *base* entry?

**Decision:** changing its muscle group is allowed and writes a **user-tier entry with
the same name**, which shadows the shared one because the merge is by name and the
user's entry wins. Renaming and deleting a base entry are **not** offered — D-20 makes
both admin-only, because a base rename cascades across *every* profile. Those rows
render with a `shared` badge and no Rename/Delete action.

**Why not disable the buttons instead:** every mutating control the viewer cannot use
is absent, not disabled (§2). A greyed-out Rename would advertise an action that will
never become available on this page.

## D-29 · The featured shortlist is curation, not history ✅
**Question:** `settings/featuredExercises` references exercises by name, like the set
log does. Does a featured entry count as a reference for the D-5 rules?

**Decision:** **no.** It is rewritten by a rename and cleaned up by a delete, but it
never blocks a delete and it is **not counted in the affected-record number** the
confirm dialog states.

Both halves matter. Blocking a delete on a shortlist entry would be absurd — nothing
is lost by dropping a name from a curated list. And counting it would overstate the
blast radius: "12 records" when eleven are workouts and the twelfth is a shortlist row
is the kind of number that stops being trusted.

## D-30 · The cascade reads RAW nodes, not the loaded profile ✅
**Question:** the rename plan addresses paths like
`workouts/{id}/exercises/2/exercise_title`. Where do those indices come from?

**Decision:** the cascade re-reads `workouts`, `runs` and `settings` from the database
at the moment of the write, and addresses paths using the **database's own keys**.

It cannot use the normalized profile already in memory: §3.8 lets RTDB return a list
as an object with numeric-string keys, and the parse layer deliberately produces a
dense, re-sorted, null-filtered array. Its indices are therefore not always the stored
ones, and writing against them would rename **the wrong exercise**. The cascade is the
one operation in the app that legitimately needs the wire shape.

The same traversal produces both the count shown in the confirm and the update that is
applied, so a delete can never disagree with a rename about what counts as a reference.

---

# 2026-08-15 — Phase 13, the admin panel

## D-31 · Base exercises are add-and-re-file only — no rename, no delete ✅
**The contradiction:** `PLAN.md` Phase 13 and D-20 both call for renaming a base
exercise to "cascade across *every* profile, behind a confirm stating records **and
profiles** affected". `database.rules.json` makes that impossible:

```
"users": { "$uid": { ".write": "auth != null && auth.uid === $uid && …" } }
```

An account — **admin included** — can write only its own subtree. There is no client
that can perform that cascade, and the rules are the actual security boundary (§2).

**Options put to the owner:** (a) don't offer it in the app; (b) relax the rules so
admin can read and write every profile; (c) cascade only the admin's own profile and
let other profiles silently orphan. A fourth idea came back from the owner — **key the
joins by id instead of by name**, which would remove the need for any cascade at all.

**Decision: (a), and the id idea becomes its own phase.** The admin panel offers
**add** and **re-file into a different muscle group** — neither touches a name any
record joins on, so neither needs a cascade. Rename and delete are documented console
operations, and the panel says so in place of a control that would half-work.

**On the id proposal:** it is correct that ids would dissolve this problem rather than
work around it — the name would live only in `/config`, so a rename is one row. It is
also precisely what §0.3 forbids: a migration of every existing record (385 exercise
entries across 81 real workouts), plus §3.7, D-20's merge-by-name rule, and the
`#/workouts/records/:exercise` URL scheme, which is an encoded name by design. **19
source files** key on the name today. Agreed to revisit **after Phase 15 as a
dedicated phase** — backup, migration script, re-derived §3 — rather than folded into
a phase about the admin panel.

**`CLAUDE.md` §3.3 was corrected in the same commit**, per the rule that this file
loses to `DECISIONS.md`.

## D-32 · Renaming a category cascades the admin's own records; deleting one does not ✅
**Question:** workout `category` and run `type` are denormalized name strings too, so
renaming "Push" in the admin panel orphans every workout carrying it. §4 only says a
*deleted* category must degrade to `--cat-none`.

**Decision:**
- **Rename cascades**, within the admin's own profile, in one atomic update with the
  `/config` row. The confirm states the count **and states plainly that other profiles
  are not rewritten** — they keep the old name and render neutral. Partial, and
  honest about being partial, beats silently degrading the admin's own history.
- **Delete does not cascade and is not blocked.** This is the deliberate asymmetry
  with D-5: a workout whose category no longer exists is still a complete workout, and
  §4 already requires it to render neutral rather than break. Nothing is lost, so
  nothing needs preventing — the confirm just says how many records will go neutral.

## D-33 · Category colours are picked from swatches, never a colour input ✅
**Decision:** the six categorical tokens are offered as swatches; there is no hex
field. The palette passed the colourblind-separation validator **as a set** (§5), and
a free colour input would let a well-meaning owner break that in one click. Storage is
the token id, so "no raw hex in components" stays true even for owner-chosen colours.

---

# 2026-08-15 — Phase 14, analytics

## D-34 · Charts are hand-drawn. Recharts is unused and stays a dependency for now ✅
**Observed:** §2 names Recharts as the charting library, and §5 then demands
"Charts are made of discrete marks… prefer squares, dots, stipple and thin bars",
"no Recharts defaults", axes receding to near-invisible, and a text alternative on
every chart. Meeting §5 through Recharts would have meant replacing its axes, ticks,
tooltips, legend and mark rendering — i.e. keeping the library for its layout maths
and overriding everything that makes it recognisable.

**Decision, taken by default across Phases 7–14 and recorded here:** every chart is
**hand-drawn SVG or plain HTML/CSS** — the progression line, the monthly trend bars,
the sets-per-group stipple, the radar, the session calendar, and now the day × hour
heatmap. `grep -rl recharts src/` returns nothing.

Each carries its text alternative as a visually-hidden `<table>` of the same numbers,
which is §9's requirement and which Recharts would not have provided either.

**Recharts stays in `package.json` for now.** It is never imported, so it costs the
bundle nothing, and removing it is a §2 change rather than a code change. Folded into
the Phase 15 quality pass, where the dependency list gets looked at as a whole.

## D-35 · A visually-hidden `<table>` must be wrapped in a hidden `<div>` ✅
**Found by measuring, not by a test:** the analytics page scrolled sideways at 375px —
`document.documentElement.scrollWidth` was **1042** against a 375px viewport.

The cause is a CSS subtlety worth writing down: on a `<table>`, `width: 1px` is a
**minimum, not a maximum**. Tailwind's `sr-only` sets `width: 1px; overflow: hidden`,
which visually hides a block element but does **not** stop a table from laying out at
its natural width — the heatmap's alternative table wanted 1023px and dragged the
page with it.

**Fix:** the hidden table is wrapped in `<div className="sr-only">`, giving the
clipping a block box that actually contains it. Applied to all six sr-only tables in
the codebase, not just the heatmap's — the other five were latent instances of the
same bug that happened to hold fewer columns.
