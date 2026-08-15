import { useEffect, useState } from 'react'
import { Button } from '../ui'
import { ComboInput } from '../ComboInput'
import { Section, SaveNote } from './Section'
import { useSave } from './useSave'
import { saveSettings } from '../../lib/settingsWrites'

/**
 * The curated shortlist that drives the Records page (§6.3).
 *
 * Order is the point — it is the order they appear — so reordering is a first
 * class control, not drag-and-drop. Buttons rather than DnD because this list
 * has to work on a 375px touch screen and with a keyboard, and a pair of arrows
 * is both by default; a drag implementation would be neither without real work.
 *
 * Edits are local until Save, so reordering four entries is one write.
 */
export function FeaturedExercises({
  uid,
  featured,
  catalog,
}: {
  uid: string
  featured: string[]
  catalog: string[]
}) {
  const [list, setList] = useState<string[]>(featured)
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const { status, save } = useSave()

  // Compared as JSON, not a joined string: exercise names contain spaces, so
  // "Bench Press (Barbell)" would not survive a split.
  const stored = JSON.stringify(featured)
  useEffect(() => {
    // Re-seed when the profile reloads (a save, or a cascade renaming an entry).
    setList(JSON.parse(stored) as string[])
  }, [stored])

  const dirty = JSON.stringify(list) !== stored

  const move = (index: number, by: -1 | 1) => {
    const next = [...list]
    const target = index + by
    if (target < 0 || target >= next.length) return
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    setList(next)
  }

  const add = () => {
    const name = typed.trim()
    if (name === '') return
    if (list.includes(name)) {
      setProblem('That exercise is already featured.')
      return
    }
    // Joins are by name (§3.7), so a name outside the catalog would silently
    // feature an exercise with no history behind it.
    if (!catalog.includes(name)) {
      setProblem('No exercise by that name. Add it below first.')
      return
    }
    setProblem(null)
    setList([...list, name])
    setTyped('')
  }

  return (
    <Section
      title="Featured exercises"
      description="Shown first on Records, in this order. Leave it empty to fall back to your three heaviest lifts."
    >
      {list.length === 0 ? (
        <p className="m-0 text-sm text-ink-2">
          Nothing featured — Records will show your top three by weight.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-0 p-0">
          {list.map((name, i) => (
            <li
              key={name}
              className="flex items-center gap-3 border-b border-rule py-2"
            >
              <span className="w-6 shrink-0 font-mono text-xs text-ink-2 tabular-nums">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm text-ink-0">{name}</span>
              <span className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={`Move ${name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${name} down`}
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </IconButton>
                <IconButton
                  label={`Remove ${name}`}
                  onClick={() => setList(list.filter((n) => n !== name))}
                >
                  ×
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <ComboInput
            label="Add an exercise"
            value={typed}
            onChange={(v) => {
              setTyped(v)
              setProblem(null)
            }}
            options={catalog}
            placeholder="Start typing…"
          />
        </div>
        <Button onClick={add}>Add to featured</Button>
      </div>

      {problem ? (
        <span role="alert" className="font-mono text-xs text-accent">
          {problem}
        </span>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={!dirty || status.state === 'saving'}
          onClick={() =>
            void save(() => saveSettings(uid, { featuredExercises: list }))
          }
        >
          Save order
        </Button>
        <SaveNote status={status} dirty={dirty} />
      </div>
    </Section>
  )
}

/** A square tap target for the reorder controls — its glyph is decorative. */
function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="size-8 cursor-pointer rounded-sm border border-rule bg-transparent font-mono text-sm text-ink-1 transition-colors duration-[120ms] hover:border-ink-3 hover:text-ink-0 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}
