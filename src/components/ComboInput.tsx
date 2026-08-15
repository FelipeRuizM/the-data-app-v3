import { useId, useState } from 'react'
import { Label } from './ui'

/**
 * A text input with suggestions that also accepts anything typed — the
 * "typeahead with create-on-the-fly" from §4.
 *
 * Built on a native `<datalist>` rather than a custom listbox: it's free
 * keyboard and screen-reader support, and it can't trap the user into only
 * picking existing values, which is exactly the create-on-the-fly requirement.
 * Joins are by name string (§3.7), so a typed name IS the value — there is no
 * hidden id to reconcile.
 */
export function ComboInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  id: idProp,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  options: readonly string[]
  placeholder?: string | undefined
  id?: string | undefined
}) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const listId = `${id}-options`

  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <Label>{label}</Label>
      <input
        id={id}
        list={listId}
        value={value}
        placeholder={placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  )
}

/**
 * Multi-select for people. Existing names are chips you toggle; anything typed
 * that isn't in the list gets added on submit — again create-on-the-fly.
 */
export function PeoplePicker({
  selected,
  onChange,
  options,
}: {
  selected: string[]
  onChange: (next: string[]) => void
  options: readonly string[]
}) {
  const [typed, setTyped] = useState('')
  const inputId = useId()

  const toggle = (name: string) =>
    onChange(
      selected.includes(name)
        ? selected.filter((n) => n !== name)
        : [...selected, name],
    )

  const addTyped = () => {
    const name = typed.trim()
    if (name === '' || selected.includes(name)) {
      setTyped('')
      return
    }
    onChange([...selected, name])
    setTyped('')
  }

  // Names on the workout that aren't in the profile's list yet — shown so a
  // just-added person is visible as a chip immediately.
  const extras = selected.filter((n) => !options.includes(n))

  return (
    <div className="flex flex-col gap-2">
      <Label>With</Label>
      <div className="flex flex-wrap gap-1.5">
        {[...options, ...extras].map((name) => {
          const on = selected.includes(name)
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(name)}
              className={
                'font-mono text-label uppercase tracking-[0.12em] px-2 py-1 rounded-sm border bg-transparent transition-colors duration-[120ms] ' +
                (on
                  ? 'text-ink-0 border-ink-3'
                  : 'text-ink-2 border-rule hover:text-ink-1')
              }
            >
              {name}
            </button>
          )
        })}
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1" htmlFor={inputId}>
          <span className="sr-only">Add a person</span>
          <input
            id={inputId}
            value={typed}
            placeholder="Add someone new…"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              // Enter must not submit the whole workout form from here.
              if (e.key === 'Enter') {
                e.preventDefault()
                addTyped()
              }
            }}
            className="w-full rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3"
          />
        </label>
        <button
          type="button"
          onClick={addTyped}
          className="cursor-pointer rounded-sm border border-rule bg-transparent px-3 py-2 font-mono text-xs tracking-[0.1em] text-ink-1 uppercase hover:text-ink-0"
        >
          Add
        </button>
      </div>
    </div>
  )
}
