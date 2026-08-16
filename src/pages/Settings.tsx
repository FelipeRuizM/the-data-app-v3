import { useEffect, useState } from 'react'
import { Button, Chip, Label } from '../components/ui'
import { ComboBox } from '../components/ComboBox'
import { StateBlock } from '../components/StateBlock'
import { Section, SaveNote } from '../components/settings/Section'
import { useSave } from '../components/settings/useSave'
import { FeaturedExercises } from '../components/settings/FeaturedExercises'
import { CalculatorEditor } from '../components/settings/CalculatorEditor'
import { EntityManager } from '../components/settings/EntityManager'
import { useAuth } from '../auth/hooks'
import { useProfile } from '../data/useProfile'
import { saveSettings } from '../lib/settingsWrites'
import { lbToKg, toDisplayWeight } from '../lib/units'
import type { Units } from '../types'

/**
 * Per-account settings (§4, D-17b) — "what the Settings page edits is
 * per-account". Everything here writes inside `/users/{uid}`; shared vocabulary
 * lives in `/config` and belongs to the admin panel.
 *
 * The route is behind <RequireWrite>, so a guest never arrives: it has no
 * profile of its own to configure, and every control on this page is a mutating
 * one.
 */
export function Settings() {
  const state = useProfile()
  const { user, profileUid, signOut } = useAuth()

  if (state.status === 'loading') {
    return (
      <Page>
        <div className="h-24 w-full rounded-sm bg-rule" aria-busy="true" />
      </Page>
    )
  }

  if (state.status !== 'ready' || !profileUid) {
    return (
      <Page>
        <StateBlock
          label={state.status === 'error' ? 'Couldn’t load' : 'No access'}
          title={
            state.status === 'error'
              ? 'Something went wrong.'
              : 'This profile isn’t readable.'
          }
          body={
            state.status === 'error'
              ? state.message
              : 'The database rules rejected the read.'
          }
        />
      </Page>
    )
  }

  const { profile, config } = state.data
  const { settings } = profile

  return (
    <Page>
      <UnitsToggle uid={profileUid} units={settings.units} />

      <Bodyweight
        uid={profileUid}
        units={settings.units}
        bodyweightKg={settings.bodyweightKg}
      />

      <FeaturedExercises
        uid={profileUid}
        featured={settings.featuredExercises}
        catalog={profile.exercises.map((e) => e.name)}
      />

      <CalculatorEditor uid={profileUid} calculator={settings.calculator} />

      <DefaultGear
        uid={profileUid}
        defaultShoes={settings.defaultShoes}
        defaultWatch={settings.defaultWatch}
        shoes={config.shoes}
        watches={config.watches}
      />

      <EntityManager
        uid={profileUid}
        kind="exercise"
        title="Exercises"
        entries={profile.exercises.map((e) => ({
          id: e.id,
          name: e.name,
          muscleGroup: e.muscleGroup,
          tier: e.tier,
        }))}
        muscleGroups={config.muscleGroups}
      />

      <EntityManager
        uid={profileUid}
        kind="place"
        title="Places"
        entries={profile.places}
      />

      <EntityManager
        uid={profileUid}
        kind="person"
        title="People"
        entries={profile.people}
      />

      <Section title="Account">
        <p className="m-0 text-sm text-ink-2">
          Signed in as{' '}
          <span className="font-mono text-ink-1">{user?.email ?? 'unknown'}</span>.
        </p>
        <Button className="self-start" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Section>
    </Page>
  )
}

/* ── units ──────────────────────────────────────────────────────────────── */

/**
 * A DISPLAY-LAYER conversion only. Storage stays `weight_kg` always, and lb is
 * never written to the database (D-18) — this setting changes how numbers are
 * rendered and nothing else.
 *
 * Saved on click rather than behind a Save button: it is a two-state toggle
 * whose effect is visible immediately everywhere weights appear, so a pending
 * state would be noise.
 */
function UnitsToggle({ uid, units }: { uid: string; units: Units }) {
  const { status, save } = useSave()

  return (
    <Section first title="Weight units">
      <div className="flex items-center gap-2">
        {(['kg', 'lb'] as const).map((u) => (
          <Chip
            key={u}
            pressed={units === u}
            onClick={() => {
              if (u === units) return
              void save(() => saveSettings(uid, { units: u }))
            }}
          >
            {u}
          </Chip>
        ))}
        <SaveNote status={status} />
      </div>
    </Section>
  )
}

/* ── bodyweight ─────────────────────────────────────────────────────────── */

/**
 * Bodyweight feeds VOLUME only, never a record (D-7).
 *
 * A set with no `weight_kg` is bodyweight work (D-7b); this number is what it
 * contributes to volume totals so a pull-up session isn't counted as zero work.
 * It must never reach `maxWeight`, `maxVolume`, a 1RM or a PR badge, and the
 * copy says so — it is the kind of setting a user would otherwise assume
 * inflates their records.
 */
function Bodyweight({
  uid,
  units,
  bodyweightKg,
}: {
  uid: string
  units: Units
  bodyweightKg: number | null
}) {
  const stored =
    bodyweightKg === null ? '' : String(round(toDisplayWeight(bodyweightKg, units)))
  const [text, setText] = useState(stored)
  const { status, save } = useSave()

  useEffect(() => setText(stored), [stored])

  const dirty = text.trim() !== stored
  const parsed = text.trim() === '' ? null : Number(text)
  const valid = parsed === null || (Number.isFinite(parsed) && parsed > 0)

  return (
    <Section title="Bodyweight">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <Label>Bodyweight ({units})</Label>
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Not set"
            className="w-32 rounded-sm border border-rule bg-transparent px-3 py-2 font-mono text-sm text-ink-0 tabular-nums placeholder:text-ink-3"
          />
        </label>
        <Button
          variant="primary"
          disabled={!dirty || !valid || status.state === 'saving'}
          onClick={() =>
            void save(() =>
              saveSettings(uid, {
                // Stored in kilograms whatever the display unit says (D-18).
                bodyweightKg:
                  parsed === null
                    ? null
                    : units === 'lb'
                      ? Number(lbToKg(parsed).toFixed(3))
                      : parsed,
              }),
            )
          }
        >
          Save
        </Button>
        <SaveNote status={status} dirty={dirty} />
      </div>
      {!valid ? (
        <span role="alert" className="font-mono text-xs text-accent">
          Bodyweight must be a positive number, or blank.
        </span>
      ) : null}
    </Section>
  )
}

function round(n: number): number {
  return Number(n.toFixed(1))
}

/* ── default gear ───────────────────────────────────────────────────────── */

/**
 * Prefills for a run's shoes and watch (§3.2). The catalogs are global and
 * admin-managed; which one is *your* default is per-account.
 */
function DefaultGear({
  uid,
  defaultShoes,
  defaultWatch,
  shoes,
  watches,
}: {
  uid: string
  defaultShoes: string
  defaultWatch: string
  shoes: string[]
  watches: string[]
}) {
  const [gear, setGear] = useState({ shoes: defaultShoes, watch: defaultWatch })
  const { status, save } = useSave()

  useEffect(() => {
    setGear({ shoes: defaultShoes, watch: defaultWatch })
  }, [defaultShoes, defaultWatch])

  const dirty = gear.shoes !== defaultShoes || gear.watch !== defaultWatch

  return (
    <Section title="Default gear">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ComboBox
          label="Default shoes"
          value={gear.shoes}
          onChange={(v) => setGear({ ...gear, shoes: v })}
          options={shoes}
        />
        <ComboBox
          label="Default watch"
          value={gear.watch}
          onChange={(v) => setGear({ ...gear, watch: v })}
          options={watches}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={!dirty || status.state === 'saving'}
          onClick={() =>
            void save(() =>
              saveSettings(uid, {
                defaultShoes: gear.shoes.trim(),
                defaultWatch: gear.watch.trim(),
              }),
            )
          }
        >
          Save gear
        </Button>
        <SaveNote status={status} dirty={dirty} />
      </div>
    </Section>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-10 py-10">
      <div className="flex flex-col gap-2">
        <Label as="h1">Settings</Label>
        <p className="m-0 max-w-prose text-sm text-ink-2">
          Yours alone. Nothing here changes another account.
        </p>
      </div>
      {children}
    </div>
  )
}
