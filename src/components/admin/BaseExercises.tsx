import { useState } from 'react'
import { Button } from '../ui'
import { Section, SaveNote } from '../settings/Section'
import { useSave } from '../settings/useSave'
import { saveBaseExercise } from '../../lib/configWrites'
import type { CatalogExercise } from '../../types'

/**
 * The global base exercise catalog, `/config/exercises` (D-20).
 *
 * **Add and re-file only. No rename, no delete** (D-31). Both would have to
 * rewrite `exercise_title` in every profile that ever logged the exercise, and
 * the database rules let an account write nothing but its own subtree — so an
 * admin renaming a base exercise here could only ever fix their own history and
 * would silently orphan everyone else's. They are console operations, and this
 * panel says so rather than offering a button that half-works.
 *
 * Adding and re-filing are safe precisely because neither touches a name any
 * record joins on.
 */
export function BaseExercises({
  exercises,
  muscleGroups,
}: {
  /** Base-tier entries only — the caller filters the merged catalog. */
  exercises: CatalogExercise[]
  muscleGroups: string[]
}) {
  const { status, save } = useSave()
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState({
    name: '',
    muscleGroup: muscleGroups[0] ?? 'Other',
  })
  const [problem, setProblem] = useState<string | null>(null)

  const query = filter.trim().toLowerCase()
  const matching =
    query === ''
      ? exercises
      : exercises.filter((e) => e.name.toLowerCase().includes(query))
  const capped = query === '' && matching.length > LIST_CAP
  const visible = capped ? matching.slice(0, LIST_CAP) : matching

  const add = async () => {
    const name = adding.name.trim()
    if (name === '') return
    if (exercises.some((e) => e.name === name)) {
      setProblem('That exercise is already in the catalog.')
      return
    }
    setProblem(null)
    const ok = await save(() => saveBaseExercise(null, name, adding.muscleGroup))
    if (ok) setAdding({ name: '', muscleGroup: muscleGroups[0] ?? 'Other' })
  }

  return (
    <Section
      title="Base exercise catalog"
      description="Shared by every account. Renaming or removing one has to rewrite history in profiles this app cannot write to, so both are done from the console — here you can add and re-file."
    >
      {exercises.length === 0 ? (
        <p className="m-0 max-w-prose text-sm text-ink-3">
          The shared catalog is empty. Until it is seeded, every account works from its
          own exercise list, which is exactly what happens today.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
              Find
            </span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${exercises.length}…`}
              className="rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3"
            />
          </label>

          <ul className="m-0 flex list-none flex-col gap-0 p-0">
            {visible.map((exercise) => (
              <li
                key={exercise.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule py-3"
              >
                <span className="min-w-0 flex-1 text-sm break-words text-ink-0">
                  {exercise.name}
                </span>
                <select
                  value={exercise.muscleGroup}
                  aria-label={`Muscle group for ${exercise.name}`}
                  onChange={(e) =>
                    void save(() =>
                      saveBaseExercise(exercise.id, exercise.name, e.target.value),
                    )
                  }
                  className="rounded-sm border border-rule bg-ground px-2 py-1 font-mono text-xs text-ink-1"
                >
                  {[
                    ...muscleGroups,
                    ...(muscleGroups.includes(exercise.muscleGroup)
                      ? []
                      : [exercise.muscleGroup]),
                  ].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          {capped ? (
            <p className="m-0 font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
              Showing {LIST_CAP} of {matching.length} — search to find the rest
            </p>
          ) : null}
        </>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
            Add base exercise
          </span>
          <input
            value={adding.name}
            onChange={(e) => {
              setAdding({ ...adding, name: e.target.value })
              setProblem(null)
            }}
            placeholder="Name"
            className="rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
            Muscle group
          </span>
          <select
            value={adding.muscleGroup}
            onChange={(e) => setAdding({ ...adding, muscleGroup: e.target.value })}
            className="rounded-sm border border-rule bg-ground px-3 py-2 font-mono text-xs text-ink-1"
          >
            {muscleGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void add()} disabled={status.state === 'saving'}>
          Add base exercise
        </Button>
      </div>

      {problem ? (
        <span role="alert" className="font-mono text-xs text-accent">
          {problem}
        </span>
      ) : null}
      <SaveNote status={status} />
    </Section>
  )
}

const LIST_CAP = 12
