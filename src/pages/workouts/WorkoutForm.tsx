import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Label } from '../../components/ui'
import { ComboInput, PeoplePicker } from '../../components/ComboInput'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { StateBlock } from '../../components/StateBlock'
import { useAuth } from '../../auth/hooks'
import { useProfile } from '../../data/useProfile'
import { deleteWorkout, namesNotIn, saveWorkout } from '../../lib/writes'
import {
  buildRawWorkout,
  exerciseIdsByName,
  draftFromWorkout,
  emptyExerciseGroup,
  emptySet,
  emptyWorkoutDraft,
  type DraftValidationError,
  type ExerciseGroupDraft,
  type SetDraft,
  type WorkoutDraft,
} from '../../lib/workoutDraft'
import { SET_TYPES, type SetType } from '../../types'

/**
 * Create and edit a workout. Same component for both — the only difference is
 * whether a draft is seeded from an existing record (§4).
 *
 * Nothing here decides *what* gets written: `buildRawWorkout` owns every
 * presence/absence rule, and it's tested against the real fixture. This file
 * is the editor around it.
 */
export function WorkoutForm({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profileUid, canWrite } = useAuth()
  const state = useProfile()

  const [draft, setDraft] = useState<WorkoutDraft | null>(null)
  const [errors, setErrors] = useState<DraftValidationError[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ready = state.status === 'ready' ? state.data : null
  const existing =
    ready && id ? ready.profile.workouts.find((w) => w.id === id) : undefined

  // Seed once, when data lands. Deliberately not a useEffect: deriving the
  // initial draft during render avoids a frame where the form shows empty
  // fields over an existing record.
  if (draft === null && ready) {
    if (mode === 'edit') {
      if (existing) setDraft(draftFromWorkout(existing))
    } else {
      setDraft(emptyWorkoutDraft())
    }
  }

  const catalog = useMemo(
    () => (ready ? ready.profile.exercises.map((e) => e.name) : []),
    [ready],
  )
  /** Name → catalog id, so a saved record carries exercise_id (D-40). */
  const exerciseIds = useMemo(
    () => exerciseIdsByName(ready ? ready.profile.exercises : []),
    [ready],
  )
  const placeNames = useMemo(
    () => (ready ? ready.profile.places.map((p) => p.name) : []),
    [ready],
  )
  const peopleNames = useMemo(
    () => (ready ? ready.profile.people.map((p) => p.name) : []),
    [ready],
  )
  const categoryNames = useMemo(
    () => (ready ? ready.config.workoutCategories.map((c) => c.name) : []),
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
          title="No workout with that id."
          body="It may have been deleted, or the link may be from a different profile."
        />
      </div>
    )
  }

  if (!draft || !ready) return null

  const set = (patch: Partial<WorkoutDraft>) => setDraft({ ...draft, ...patch })

  const patchGroup = (index: number, patch: Partial<ExerciseGroupDraft>) =>
    set({
      exercises: draft.exercises.map((g, i) => (i === index ? { ...g, ...patch } : g)),
    })

  const patchSet = (groupIndex: number, setIndex: number, patch: Partial<SetDraft>) =>
    patchGroup(groupIndex, {
      sets: draft.exercises[groupIndex]!.sets.map((s, i) =>
        i === setIndex ? { ...s, ...patch } : s,
      ),
    })

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileUid || !canWrite) return

    // Pass the catalog so new and edited records carry exercise_id (D-40). An
    // exercise typed in that isn't in the catalog yet gets no id and falls back
    // to the name join, exactly as before.
    const built = buildRawWorkout(draft, exerciseIds)
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setErrors([])
    setSaving(true)
    setSaveError(null)

    try {
      const { id: savedId } = await saveWorkout({
        uid: profileUid,
        id: mode === 'edit' ? (id ?? null) : null,
        raw: built.raw,
        newPlaces: namesNotIn([draft.place], placeNames),
        newPeople: namesNotIn(draft.people, peopleNames),
      })
      navigate(`/workouts/${savedId}`, { replace: true })
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
      await deleteWorkout(profileUid, id)
      navigate('/workouts', { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-8 py-10" onSubmit={(e) => void onSubmit(e)}>
      <header className="flex flex-col gap-2">
        <Label as="h1">{mode === 'edit' ? 'Edit workout' : 'Log a workout'}</Label>
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
          <Field label="End">
            <input
              type="datetime-local"
              value={draft.endLocal}
              onChange={(e) => set({ endLocal: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ComboInput
            label="Place"
            value={draft.place}
            onChange={(v) => set({ place: v })}
            options={placeNames}
            placeholder="Where?"
          />
          <ComboInput
            label="Category"
            value={draft.category}
            onChange={(v) => set({ category: v })}
            options={categoryNames}
            placeholder="Push, Pull, Legs…"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Avg heart rate">
            <input
              inputMode="numeric"
              value={draft.avgHeartRate}
              placeholder="Leave blank if not recorded"
              onChange={(e) => set({ avgHeartRate: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        <PeoplePicker
          selected={draft.people}
          onChange={(people) => set({ people })}
          options={peopleNames}
        />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <Label as="h2">Exercises</Label>
          <button
            type="button"
            onClick={() =>
              set({ exercises: [...draft.exercises, emptyExerciseGroup()] })
            }
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase"
          >
            + Exercise
          </button>
        </div>

        {draft.exercises.map((group, gi) => (
          <fieldset key={gi} className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="sr-only">Exercise {gi + 1}</legend>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <ComboInput
                  label={`Exercise ${gi + 1}`}
                  value={group.exercise.exerciseTitle}
                  onChange={(v) =>
                    patchGroup(gi, {
                      exercise: { ...group.exercise, exerciseTitle: v },
                    })
                  }
                  options={catalog}
                  placeholder="Start typing…"
                />
              </div>
              {draft.exercises.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    set({ exercises: draft.exercises.filter((_, i) => i !== gi) })
                  }
                  aria-label={`Remove exercise ${gi + 1}`}
                  className="cursor-pointer rounded-sm border border-rule bg-transparent px-3 py-2 font-mono text-xs text-ink-2 hover:text-ink-0"
                >
                  Remove
                </button>
              ) : null}
            </div>

            <Field label="Notes">
              <input
                value={group.exercise.notes}
                onChange={(e) =>
                  patchGroup(gi, {
                    exercise: { ...group.exercise, notes: e.target.value },
                  })
                }
                className={inputClass}
              />
            </Field>

            <div className="flex flex-col gap-2">
              {group.sets.map((s, si) => (
                <SetRow
                  key={si}
                  index={si}
                  set={s}
                  canRemove={group.sets.length > 1}
                  onChange={(patch) => patchSet(gi, si, patch)}
                  onRemove={() =>
                    patchGroup(gi, { sets: group.sets.filter((_, i) => i !== si) })
                  }
                />
              ))}
              <div>
                <button
                  type="button"
                  onClick={() => patchGroup(gi, { sets: [...group.sets, emptySet()] })}
                  className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase"
                >
                  + Set
                </button>
              </div>
            </div>
          </fieldset>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Log workout'}
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
        title="Delete this workout?"
        body="This permanently removes the workout and every set in it. This cannot be undone."
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

/**
 * One set. The weight field carries all three `WeightState` kinds through a
 * single string, exactly as the raw schema does (D-7b) — blank is bodyweight,
 * "0" is a genuine zero. The placeholder says so, because that distinction is
 * invisible otherwise and getting it wrong corrupts volume and records.
 */
function SetRow({
  index,
  set,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number
  set: SetDraft
  canRemove: boolean
  onChange: (patch: Partial<SetDraft>) => void
  onRemove: () => void
}) {
  return (
    // Two rows on a phone, one on desktop. This is the app's primary
    // data-entry surface — at three rows per set a 25-set session became 75
    // rows of inputs, which is unusable on the device it's logged from.
    <div className="grid grid-cols-[1.25rem_1fr_1fr_auto] items-center gap-2 sm:grid-cols-[1.5rem_1fr_1fr_1fr_auto_auto]">
      <span className="font-mono text-xs text-ink-2">{index + 1}</span>

      <input
        inputMode="decimal"
        value={set.weight}
        placeholder="BW"
        aria-label={`Set ${index + 1} weight in kilograms, blank for bodyweight`}
        onChange={(e) => onChange({ weight: e.target.value })}
        className={smallInput}
      />
      <input
        inputMode="numeric"
        value={set.reps}
        placeholder="reps"
        aria-label={`Set ${index + 1} reps`}
        onChange={(e) => onChange({ reps: e.target.value })}
        className={smallInput}
      />
      <input
        inputMode="numeric"
        value={set.durationSeconds}
        placeholder="secs"
        aria-label={`Set ${index + 1} duration in seconds`}
        onChange={(e) => onChange({ durationSeconds: e.target.value })}
        className={`${smallInput} col-start-2 col-end-3 sm:col-auto`}
      />

      <select
        value={set.setType}
        aria-label={`Set ${index + 1} type`}
        onChange={(e) => onChange({ setType: e.target.value as SetType })}
        className={`${smallInput} col-start-3 col-end-5 sm:col-auto`}
      >
        {SET_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove set ${index + 1}`}
          className="col-start-4 row-start-1 cursor-pointer border-0 bg-transparent px-1 font-mono text-xs text-ink-2 hover:text-accent sm:col-auto sm:row-auto"
        >
          ×
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  )
}

const smallInput =
  'w-full rounded-sm border border-rule bg-transparent px-2 py-1.5 font-mono text-sm text-ink-0 placeholder:text-ink-3'
