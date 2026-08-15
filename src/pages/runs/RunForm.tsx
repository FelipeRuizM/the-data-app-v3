import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Label } from '../../components/ui'
import { ComboInput, PeoplePicker } from '../../components/ComboInput'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { StateBlock } from '../../components/StateBlock'
import { useAuth } from '../../auth/hooks'
import { useProfile } from '../../data/useProfile'
import { deleteRun, namesNotIn, saveRun } from '../../lib/writes'
import {
  buildRawRun,
  draftFromRun,
  emptyRunDraft,
  parseDurationInput,
  type DraftValidationError,
  type RunDraft,
} from '../../lib/runDraft'
import { derivePaceSecPerKm } from '../../lib/normalize'
import { formatPace } from '../../lib/dates'

/**
 * Create and edit a run. Mirrors WorkoutForm; simpler because runs have no
 * nested exercises or sets.
 *
 * `buildRawRun` owns every presence/absence rule and derives the stored pace —
 * this file is only the editor around it.
 */
export function RunForm({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profileUid, canWrite } = useAuth()
  const state = useProfile()

  const [draft, setDraft] = useState<RunDraft | null>(null)
  const [errors, setErrors] = useState<DraftValidationError[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ready = state.status === 'ready' ? state.data : null
  const existing = ready && id ? ready.profile.runs.find((r) => r.id === id) : undefined

  if (draft === null && ready) {
    if (mode === 'edit') {
      if (existing) setDraft(draftFromRun(existing, ready.profile.settings))
    } else {
      setDraft(emptyRunDraft(ready.profile.settings))
    }
  }

  const placeNames = useMemo(
    () => (ready ? ready.profile.places.map((p) => p.name) : []),
    [ready],
  )
  const peopleNames = useMemo(
    () => (ready ? ready.profile.people.map((p) => p.name) : []),
    [ready],
  )
  const typeNames = useMemo(
    () => (ready ? ready.config.runTypes.map((t) => t.name) : []),
    [ready],
  )

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4 py-10" aria-busy="true">
        <span className="h-3 w-32 rounded-sm bg-rule" />
        <span className="h-6 w-2/3 rounded-sm bg-rule" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (state.status === 'denied' || state.status === 'error') {
    return (
      <div className="py-10">
        <StateBlock
          label={state.status === 'denied' ? 'No access' : 'Couldn’t load'}
          title={
            state.status === 'denied'
              ? 'This profile isn’t readable.'
              : 'Something went wrong.'
          }
          body={
            state.status === 'error'
              ? state.message
              : 'The database rules rejected the read.'
          }
        />
      </div>
    )
  }

  if (mode === 'edit' && ready && !existing) {
    return (
      <div className="py-10">
        <StateBlock
          label="Not found"
          title="No run with that id."
          body="It may have been deleted, or the link may be from a different profile."
        />
      </div>
    )
  }

  if (!draft || !ready) return null

  const set = (patch: Partial<RunDraft>) => setDraft({ ...draft, ...patch })

  // Shown live so the derived value is visible while typing — this is the
  // number the app treats as truth, so it shouldn't be a surprise on save.
  const livePace = formatPace(
    derivePaceSecPerKm(
      parseDurationInput(draft.duration),
      Number(draft.distanceKm) || null,
    ),
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileUid || !canWrite) return

    const built = buildRawRun(draft)
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setErrors([])
    setSaving(true)
    setSaveError(null)

    try {
      const { id: savedId } = await saveRun({
        uid: profileUid,
        id: mode === 'edit' ? (id ?? null) : null,
        raw: built.raw,
        newPlaces: namesNotIn([draft.place], placeNames),
        newPeople: namesNotIn(draft.people, peopleNames),
      })
      navigate(`/runs/${savedId}`, { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!profileUid || !id) return
    setConfirmDelete(false)
    setSaving(true)
    try {
      await deleteRun(profileUid, id)
      navigate('/runs', { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-8 py-10" onSubmit={(e) => void onSubmit(e)}>
      <header>
        <Label as="h1">{mode === 'edit' ? 'Edit run' : 'Log a run'}</Label>
      </header>

      {errors.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-1 border-l-2 border-accent py-1 pl-3"
        >
          {errors.map((e, i) => (
            <p key={i} className="m-0 text-sm text-ink-1">
              {e.message}
            </p>
          ))}
        </div>
      ) : null}

      {saveError ? (
        <div role="alert" className="border-l-2 border-accent py-1 pl-3">
          <p className="m-0 text-sm text-ink-1">Couldn’t save: {saveError}</p>
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <Field label="Title">
          <input
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={draft.description}
            rows={2}
            onChange={(e) => set({ description: e.target.value })}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start">
            <input
              type="datetime-local"
              value={draft.startLocal}
              onChange={(e) => set({ startLocal: e.target.value })}
              className={inputClass}
            />
          </Field>
          <ComboInput
            label="Type"
            value={draft.type}
            onChange={(v) => set({ type: v })}
            options={typeNames}
            placeholder="Other, Light…"
          />
        </div>

        <ComboInput
          label="Place"
          value={draft.place}
          onChange={(v) => set({ place: v })}
          options={placeNames}
          placeholder="Where?"
        />
      </section>

      <section className="flex flex-col gap-4">
        <Label as="h2">From the watch</Label>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Distance (km)">
            <input
              inputMode="decimal"
              value={draft.distanceKm}
              onChange={(e) => set({ distanceKm: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Moving time">
            <input
              value={draft.duration}
              placeholder="24:35"
              onChange={(e) => set({ duration: e.target.value })}
              className={inputClass}
            />
          </Field>
          <div className="flex flex-col gap-1">
            <Label>Pace</Label>
            <p
              className="m-0 rounded-sm border border-rule border-dashed px-3 py-2 font-mono text-sm text-ink-2"
              aria-live="polite"
            >
              {livePace} <span className="text-ink-3">/km</span>
            </p>
          </div>
        </div>

        <p className="m-0 text-xs text-ink-3">
          Pace is calculated from distance and moving time — it isn&rsquo;t typed in, so
          a saved run can never disagree with its own numbers.
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Avg heart rate">
            <input
              inputMode="numeric"
              value={draft.avgHeartRate}
              placeholder="Blank if none"
              onChange={(e) => set({ avgHeartRate: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Calories">
            <input
              inputMode="numeric"
              value={draft.calories}
              placeholder="Blank if none"
              onChange={(e) => set({ calories: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Difficulty (1–10)">
            <input
              inputMode="numeric"
              value={draft.difficulty}
              onChange={(e) => set({ difficulty: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Elevation gain (m)">
            <input
              inputMode="numeric"
              value={draft.elevationGainM}
              onChange={(e) => set({ elevationGainM: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Max elevation (m)">
            <input
              inputMode="numeric"
              value={draft.maxElevationM}
              onChange={(e) => set({ maxElevationM: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Steps">
            <input
              inputMode="numeric"
              value={draft.steps}
              onChange={(e) => set({ steps: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Label as="h2">Gear</Label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ComboInput
            label="Shoes"
            value={draft.shoes}
            onChange={(v) => set({ shoes: v })}
            options={ready.config.shoes}
          />
          <ComboInput
            label="Watch"
            value={draft.watch}
            onChange={(v) => set({ watch: v })}
            options={ready.config.watches}
          />
        </div>

        <PeoplePicker
          selected={draft.people}
          onChange={(people) => set({ people })}
          options={peopleNames}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Log run'}
        </Button>
        <Button type="button" onClick={() => navigate(-1)} disabled={saving}>
          Cancel
        </Button>
        {mode === 'edit' ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={saving}
            className="ml-auto cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase disabled:opacity-40"
          >
            Delete
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this run?"
        body="This permanently removes the run. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </form>
  )
}

const inputClass =
  'w-full rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </label>
  )
}
