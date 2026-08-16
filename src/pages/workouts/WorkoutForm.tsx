import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Label } from '../../components/ui'
import { PeoplePicker } from '../../components/ComboInput'
import { ComboBox } from '../../components/ComboBox'
import { StartTimeDisclosure } from '../../components/StartTimeDisclosure'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { StateBlock } from '../../components/StateBlock'
import { useAuth, useIsAdmin } from '../../auth/hooks'
import { useProfile } from '../../data/useProfile'
import { ensureCategory } from '../../lib/configWrites'
import { deleteWorkout, namesNotIn, newKey, saveWorkout } from '../../lib/writes'
import {
  buildRawWorkout,
  configIdsByName,
  exerciseIdsByName,
  draftFromWorkout,
  emptyExerciseGroup,
  isBlankSets,
  setLike,
  setsFromLastSession,
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
  const isAdmin = useIsAdmin()
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
  /** Name → id for each vocabulary a workout references (D-40, D-42). */
  const exerciseIds = useMemo(
    () => exerciseIdsByName(ready ? ready.profile.exercises : []),
    [ready],
  )
  const categoryIds = useMemo(
    // Empty unless /config actually holds the categories: the code-level
    // defaults have ids, but no rows behind them (D-42).
    () =>
      configIdsByName(
        ready?.config.fromDatabase.workoutCategories
          ? ready.config.workoutCategories
          : [],
      ),
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

  /**
   * Naming an exercise fills in what you did last time (D-53).
   *
   * **Only when nothing has been typed into this group's sets.** Prefilling
   * over real input would destroy it, and correcting a typo in an exercise name
   * fires this on every keystroke — so the guard is what makes the feature safe
   * rather than an optional nicety.
   */
  const pickExercise = (index: number, title: string) => {
    const group = draft.exercises[index]!
    const previous = isBlankSets(group.sets)
      ? setsFromLastSession(title, ready.profile.workouts, id ?? null)
      : null

    patchGroup(index, {
      exercise: { ...group.exercise, exerciseTitle: title },
      ...(previous ? { sets: previous } : {}),
    })
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileUid || !canWrite) return

    // An exercise typed into the form is created in the user's OWN tier (D-20,
    // D-52) — never in /config. Its key is generated here rather than inside
    // `saveWorkout` so the id map below already holds it and the very first
    // record carries `exercise_id` (D-40) instead of waiting for the next edit.
    const newExercises = namesNotIn(
      draft.exercises.map((g) => g.exercise.exerciseTitle),
      catalog,
    ).map((name) => ({
      id: newKey(`users/${profileUid}/exercises`),
      name,
      // Filed under Other until you re-file it in Settings — inventing a muscle
      // group from a name would be a guess, and a wrong one skews the radar.
      muscleGroup: 'Other',
    }))

    const exerciseIdMap = new Map(exerciseIds)
    for (const created of newExercises) exerciseIdMap.set(created.name, created.id)

    setErrors([])
    setSaving(true)
    setSaveError(null)

    try {
      // A category typed in is global vocabulary, so it goes to /config — which
      // only an admin may write. For anyone else the name is still stored on the
      // record and still joins by string, degrading to `--cat-none` exactly as a
      // deleted category does (§4). Done before the record so the id exists.
      const categoryIdMap = new Map(categoryIds)
      if (isAdmin && draft.category.trim() !== '') {
        const categoryId = await ensureCategory(
          'workoutCategories',
          draft.category,
          ready.config.workoutCategories,
        )
        if (categoryId) categoryIdMap.set(draft.category.trim(), categoryId)
      }

      const built = buildRawWorkout(draft, {
        exercises: exerciseIdMap,
        categories: categoryIdMap,
      })
      if (!built.ok) {
        setErrors(built.errors)
        setSaving(false)
        return
      }

      const { id: savedId } = await saveWorkout({
        uid: profileUid,
        id: mode === 'edit' ? (id ?? null) : null,
        raw: built.raw,
        newPlaces: namesNotIn([draft.place], placeNames),
        newPeople: namesNotIn(draft.people, peopleNames),
        newExercises,
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
          <Field label="Duration (minutes)">
            <input
              inputMode="numeric"
              value={draft.durationMinutes}
              onChange={(e) => set({ durationMinutes: e.target.value })}
              className={inputClass}
            />
          </Field>
          <ComboBox
            label="Category"
            value={draft.category}
            onChange={(v) => set({ category: v })}
            options={categoryNames}
            placeholder="Uncategorized"
          />
        </div>

        {/* The date is pre-answered, not removed: it defaults to now, which is
            right for a session you have just finished, and stays reachable for
            the one you're catching up on (D-47). */}
        <StartTimeDisclosure
          value={draft.startLocal}
          onChange={(v) => set({ startLocal: v })}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ComboBox
            label="Place"
            value={draft.place}
            onChange={(v) => set({ place: v })}
            options={placeNames}
            placeholder="Where?"
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
          <Field label="Calories">
            <input
              inputMode="numeric"
              value={draft.calories}
              placeholder="Leave blank if not recorded"
              onChange={(e) => set({ calories: e.target.value })}
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
        <Label as="h2">Exercises</Label>

        {draft.exercises.map((group, gi) => (
          <fieldset key={gi} className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="sr-only">Exercise {gi + 1}</legend>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <ComboBox
                  label={`Exercise ${gi + 1}`}
                  value={group.exercise.exerciseTitle}
                  onChange={(v) => pickExercise(gi, v)}
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
                  // Prefilled from the set above it — straight sets are the
                  // overwhelming majority of the real log.
                  onClick={() =>
                    patchGroup(gi, {
                      sets: [...group.sets, setLike(group.sets.at(-1))],
                    })
                  }
                  className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase"
                >
                  + Set
                </button>
              </div>
            </div>
          </fieldset>
        ))}

        {/* Below the list, not above it: you reach for this after logging what
            you just did, so it should be where your eye already is. */}
        <div>
          <button
            type="button"
            onClick={() =>
              set({ exercises: [...draft.exercises, emptyExerciseGroup()] })
            }
            className="cursor-pointer rounded-sm border border-rule bg-transparent px-3 py-2 font-mono text-label tracking-[0.12em] text-accent uppercase"
          >
            + Add exercise
          </button>
        </div>
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
  'w-full min-w-0 rounded-sm border border-rule bg-transparent px-3 py-2 text-ink-0 placeholder:text-ink-3'

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

// min-w-0: an input carries an intrinsic minimum width from its \n// attribute, which at 16px would push this four-column row past 375px.
const smallInput =
  'w-full min-w-0 rounded-sm border border-rule bg-transparent px-2 py-1.5 font-mono text-ink-0 placeholder:text-ink-3'
