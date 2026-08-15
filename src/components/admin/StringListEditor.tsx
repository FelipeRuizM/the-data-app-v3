import { useEffect, useState } from 'react'
import { Button } from '../ui'
import { ComboInput } from '../ComboInput'
import { Section, SaveNote } from '../settings/Section'
import { useSave } from '../settings/useSave'

/**
 * An ordered list of plain names, edited locally and saved in one write.
 *
 * Four of the six `/config` keys are exactly this shape — muscle groups,
 * rep-based exercises, shoes, watches — so they share one editor rather than
 * four near-identical ones. Categories are NOT this shape: they carry a colour
 * and an id that has to survive a rename.
 *
 * `blockRemove` lets a caller refuse a deletion that would strand data — used
 * for a muscle group that exercises still sit in.
 */
export function StringListEditor({
  title,
  description,
  values,
  onSave,
  suggestions = [],
  addLabel,
  ordered = false,
  blockRemove,
}: {
  title: string
  description?: string | undefined
  values: string[]
  onSave: (next: string[]) => Promise<unknown>
  /** Offered in the add field. Typing something new is still allowed. */
  suggestions?: string[]
  addLabel: string
  /** Show reorder controls. Only worth it where order is visible to a user. */
  ordered?: boolean
  blockRemove?: (name: string) => string | null
}) {
  const stored = JSON.stringify(values)
  const [list, setList] = useState<string[]>(values)
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const { status, save } = useSave()

  useEffect(() => {
    setList(JSON.parse(stored) as string[])
  }, [stored])

  const dirty = JSON.stringify(list) !== stored

  const add = () => {
    const name = typed.trim()
    if (name === '') return
    if (list.includes(name)) {
      setProblem('That one is already on the list.')
      return
    }
    setProblem(null)
    setList([...list, name])
    setTyped('')
  }

  const remove = (name: string) => {
    const blocked = blockRemove?.(name)
    if (blocked) {
      setProblem(blocked)
      return
    }
    setProblem(null)
    setList(list.filter((n) => n !== name))
  }

  const move = (index: number, by: -1 | 1) => {
    const next = [...list]
    const target = index + by
    if (target < 0 || target >= next.length) return
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    setList(next)
  }

  return (
    <Section title={title} description={description}>
      {list.length === 0 ? (
        <p className="m-0 text-sm text-ink-2">
          Empty — the built-in defaults apply until you add something.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0 p-0">
          {list.map((name, i) => (
            <li
              key={name}
              className="flex items-center gap-3 border-b border-rule py-2"
            >
              <span className="min-w-0 flex-1 text-sm break-words text-ink-0">
                {name}
              </span>
              {ordered ? (
                <>
                  <SmallButton
                    label={`Move ${name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </SmallButton>
                  <SmallButton
                    label={`Move ${name} down`}
                    disabled={i === list.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </SmallButton>
                </>
              ) : null}
              <SmallButton label={`Remove ${name}`} onClick={() => remove(name)}>
                ×
              </SmallButton>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <ComboInput
            label={addLabel}
            value={typed}
            onChange={(v) => {
              setTyped(v)
              setProblem(null)
            }}
            options={suggestions}
            placeholder="Name"
          />
        </div>
        <Button onClick={add}>{addLabel}</Button>
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
          onClick={() => void save(() => onSave(list))}
        >
          Save
        </Button>
        <SaveNote status={status} dirty={dirty} />
      </div>
    </Section>
  )
}

function SmallButton({
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
      className="size-8 shrink-0 cursor-pointer rounded-sm border border-rule bg-transparent font-mono text-sm text-ink-1 transition-colors duration-[120ms] hover:border-ink-3 hover:text-ink-0 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}
