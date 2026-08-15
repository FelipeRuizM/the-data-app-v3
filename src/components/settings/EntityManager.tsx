import { useId, useState } from 'react'
import { Badge, Button } from '../ui'
import { ConfirmDialog } from '../ConfirmDialog'
import { Section, SaveNote } from './Section'
import { useSave } from './useSave'
import { describeImpact, type EntityKind } from '../../lib/cascade'
import {
  countEntityReferences,
  createEntity,
  deleteEntity,
  mergeEntity,
  renameEntity,
  setExerciseMuscleGroup,
} from '../../lib/settingsWrites'

/**
 * CRUD for one of the name-keyed vocabularies: exercises, places, people.
 *
 * All three behave identically because they have the same problem — joins are
 * by name string (§3.7), so editing a name is editing history. The whole point
 * of this component is D-5:
 *
 *   · renaming cascades to every referencing record, atomically, behind a
 *     confirm that states the count
 *   · deleting something still referenced is BLOCKED, with "rename and merge"
 *     offered in its place
 *
 * Exercises carry a muscle group and a tier; places and people carry neither.
 * That is the only branch in here.
 */

export type ManagedEntity = {
  id: string
  name: string
  muscleGroup?: string
  /** Exercises only — `base` entries are shared and admin-owned (D-20). */
  tier?: 'base' | 'user'
}

/** How much history a name carries — the number D-5 requires the confirm to state. */
type Refs = { records: number; workouts: number; runs: number }

/** How many rows show before a search is needed. Keeps the page a page. */
const LIST_CAP = 12

type Dialog =
  | { mode: 'rename'; entity: ManagedEntity; newName: string; refs: Refs }
  | { mode: 'delete'; entity: ManagedEntity }
  | { mode: 'merge'; entity: ManagedEntity; refs: Refs; target: string }

export function EntityManager({
  uid,
  kind,
  title,
  description,
  entries,
  muscleGroups = [],
}: {
  uid: string
  kind: EntityKind
  title: string
  description: string
  entries: ManagedEntity[]
  muscleGroups?: string[]
}) {
  const { status, save } = useSave()
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [adding, setAdding] = useState({ name: '', muscleGroup: muscleGroups[0] ?? '' })
  const [problem, setProblem] = useState<string | null>(null)
  const filterId = useId()

  const isExercise = kind === 'exercise'
  const singular = title.toLowerCase().replace(/s$/, '')
  const names = entries.map((e) => e.name)
  const query = filter.trim().toLowerCase()
  const matching =
    query === '' ? entries : entries.filter((e) => e.name.toLowerCase().includes(query))
  // 74 exercises rendered in full made this page 6,000px tall on a phone, which
  // is not a list anyone scrolls — it is a wall. The cap lifts as soon as
  // there's a query, so searching still reaches everything.
  const capped = query === '' && matching.length > LIST_CAP
  const visible = capped ? matching.slice(0, LIST_CAP) : matching

  const close = () => {
    setDialog(null)
    setEditing(null)
  }

  /* ── add ──────────────────────────────────────────────────────────────── */

  const add = async () => {
    const name = adding.name.trim()
    if (name === '') return
    if (names.includes(name)) {
      setProblem('That name already exists.')
      return
    }
    setProblem(null)
    const ok = await save(() =>
      createEntity(uid, kind, {
        name,
        ...(isExercise ? { muscleGroup: adding.muscleGroup } : {}),
      }),
    )
    if (ok) setAdding({ name: '', muscleGroup: muscleGroups[0] ?? '' })
  }

  /* ── rename ───────────────────────────────────────────────────────────── */

  const beginRename = async (entity: ManagedEntity, newName: string) => {
    const next = newName.trim()
    if (next === '' || next === entity.name) {
      setEditing(null)
      return
    }
    // Renaming onto a name that already exists is not a rename — it is a merge,
    // and pretending otherwise would leave two catalog rows with one name.
    if (names.includes(next)) {
      const refs = await countEntityReferences(uid, kind, entity.name)
      setDialog({ mode: 'merge', entity, refs, target: next })
      return
    }
    const refs = await countEntityReferences(uid, kind, entity.name)
    setDialog({ mode: 'rename', entity, newName: next, refs })
  }

  /* ── delete ───────────────────────────────────────────────────────────── */

  const beginDelete = async (entity: ManagedEntity) => {
    const refs = await countEntityReferences(uid, kind, entity.name)
    // D-5: a referenced entity is never deleted. The dialog turns into the
    // merge picker rather than offering a destructive option at all.
    setDialog(
      refs.records > 0
        ? { mode: 'merge', entity, refs, target: '' }
        : { mode: 'delete', entity },
    )
  }

  const confirmDialog = () => {
    if (!dialog) return
    const run = async () => {
      if (dialog.mode === 'rename') {
        await renameEntity(
          uid,
          kind,
          {
            id: dialog.entity.id,
            ...(dialog.entity.muscleGroup !== undefined
              ? { muscleGroup: dialog.entity.muscleGroup }
              : {}),
          },
          dialog.entity.name,
          dialog.newName,
        )
      } else if (dialog.mode === 'delete') {
        await deleteEntity(uid, kind, dialog.entity)
      } else {
        await mergeEntity(uid, kind, dialog.entity, dialog.target)
      }
    }
    void save(run).then(() => close())
  }

  return (
    <Section title={title} description={description}>
      {entries.length > 8 ? (
        <label className="flex flex-col gap-1" htmlFor={filterId}>
          <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
            Find
          </span>
          <input
            id={filterId}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${entries.length}…`}
            className="rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3"
          />
        </label>
      ) : null}

      {visible.length === 0 ? (
        <p className="m-0 text-sm text-ink-3">
          {entries.length === 0 ? 'Nothing here yet.' : 'Nothing matches that.'}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0 p-0">
          {visible.map((entity) => {
            const shared = entity.tier === 'base'
            const isEditing = editing?.id === entity.id
            return (
              <li
                key={entity.id}
                className="flex flex-col gap-2 border-b border-rule py-3"
              >
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editing.value}
                      aria-label={`New name for ${entity.name}`}
                      onChange={(e) =>
                        setEditing({ ...editing, value: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void beginRename(entity, editing.value)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      className="min-w-0 flex-1 rounded-sm border border-rule bg-transparent px-2 py-1 text-sm text-ink-0"
                    />
                    <Button onClick={() => void beginRename(entity, editing.value)}>
                      Save
                    </Button>
                    <Button onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {/* Wraps rather than truncates: the name IS the identity
                        here, and "Bicep Curl (Cab…" is the same row as
                        "Bicep Curl (Bar…" to a reader. */}
                    <span className="min-w-0 flex-1 text-sm break-words text-ink-0">
                      {entity.name}
                    </span>
                    {shared ? <Badge>shared</Badge> : null}
                    {/* A base exercise belongs to every account — renaming or
                        deleting it is the admin panel's job (D-20, Phase 13). */}
                    {shared ? null : (
                      <>
                        <TextAction
                          onClick={() =>
                            setEditing({ id: entity.id, value: entity.name })
                          }
                        >
                          Rename
                        </TextAction>
                        <TextAction onClick={() => void beginDelete(entity)}>
                          Delete
                        </TextAction>
                      </>
                    )}
                  </div>
                )}

                {isExercise ? (
                  <label className="flex items-center gap-2">
                    <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
                      Muscle group
                    </span>
                    <select
                      value={entity.muscleGroup ?? ''}
                      aria-label={`Muscle group for ${entity.name}`}
                      onChange={(e) =>
                        void save(() =>
                          setExerciseMuscleGroup(
                            uid,
                            {
                              id: entity.id,
                              name: entity.name,
                              tier: entity.tier ?? 'user',
                            },
                            e.target.value,
                          ),
                        )
                      }
                      className="rounded-sm border border-rule bg-ground px-2 py-1 font-mono text-xs text-ink-1"
                    >
                      {[
                        ...muscleGroups,
                        ...(entity.muscleGroup &&
                        !muscleGroups.includes(entity.muscleGroup)
                          ? [entity.muscleGroup]
                          : []),
                      ].map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {capped ? (
        <p className="m-0 font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
          Showing {LIST_CAP} of {matching.length} — search to find the rest
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
            Add {singular}
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
        {isExercise ? (
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
        ) : null}
        {/* Named, not a bare "Add": three of these sit on one page, and a
            screen reader announcing "Add, Add, Add" names nothing. */}
        <Button onClick={() => void add()} disabled={status.state === 'saving'}>
          Add {singular}
        </Button>
      </div>

      {problem ? (
        <span role="alert" className="font-mono text-xs text-accent">
          {problem}
        </span>
      ) : null}
      <SaveNote status={status} />

      <ConfirmDialog
        open={dialog?.mode === 'rename'}
        title="Rename everywhere?"
        body={
          dialog?.mode === 'rename'
            ? `“${dialog.entity.name}” becomes “${dialog.newName}”. ${describeImpact(dialog.refs)}`
            : ''
        }
        confirmLabel="Rename"
        onConfirm={confirmDialog}
        onCancel={close}
      >
        {dialog?.mode === 'rename' && dialog.refs.records > 0 ? (
          <p className="m-0 text-xs text-ink-3">
            History joins by name, so every one of those records is rewritten in the
            same write. Nothing is lost.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.mode === 'delete'}
        title="Delete?"
        body={
          dialog?.mode === 'delete'
            ? `“${dialog.entity.name}” isn’t used by any record, so deleting it changes no history.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={confirmDialog}
        onCancel={close}
      />

      <ConfirmDialog
        open={dialog?.mode === 'merge'}
        title="Still in use — merge instead"
        body={
          dialog?.mode === 'merge'
            ? `“${dialog.entity.name}” is used by ${dialog.refs.records} record${
                dialog.refs.records === 1 ? '' : 's'
              }. Deleting it would orphan them, so it can be merged into another entry instead — those records move across, and only the duplicate name disappears.`
            : ''
        }
        confirmLabel="Merge"
        confirmDisabled={dialog?.mode === 'merge' ? dialog.target === '' : true}
        onConfirm={confirmDialog}
        onCancel={close}
      >
        {dialog?.mode === 'merge' ? (
          <label className="flex flex-col gap-1">
            <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
              Merge into
            </span>
            <select
              value={dialog.target}
              onChange={(e) => setDialog({ ...dialog, target: e.target.value })}
              className="rounded-sm border border-rule bg-ground px-3 py-2 text-sm text-ink-0"
            >
              <option value="">Choose…</option>
              {names
                .filter((n) => n !== dialog.entity.name)
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </ConfirmDialog>
    </Section>
  )
}

/** A quiet inline action — text, not a button-shaped block, so a row stays a row. */
function TextAction({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-ink-3 uppercase transition-colors duration-[120ms] hover:text-accent"
    >
      {children}
    </button>
  )
}
