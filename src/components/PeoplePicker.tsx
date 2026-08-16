import { useState } from 'react'
import { Label } from './ui'
import { ComboBox } from './ComboBox'

/**
 * Who you trained with — typed in, not picked off a wall of chips (D-58).
 *
 * The previous version rendered every known person as a toggle chip, so seven
 * training partners meant seven tap targets permanently occupying the form for
 * a field most sessions leave empty. Now it is one `ComboBox`: type a name, see
 * the matches, and a name that matches nothing is added just the same — the
 * caller creates it (§4 create-on-the-fly, §3.7 joins by name).
 *
 * The people you HAVE added stay visible as removable rows, because a name you
 * can't see is a name you can't take off again.
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

  const add = () => {
    const name = typed.trim()
    if (name === '' || selected.includes(name)) {
      setTyped('')
      return
    }
    onChange([...selected, name])
    setTyped('')
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>With</Label>

      {selected.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-0 p-0">
          {selected.map((name) => (
            <li
              key={name}
              className="flex items-center gap-3 border-b border-rule py-2"
            >
              <span className="min-w-0 flex-1 text-sm break-words text-ink-0">
                {name}
              </span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((n) => n !== name))}
                aria-label={`Remove ${name}`}
                className="size-8 shrink-0 cursor-pointer rounded-sm border border-rule bg-transparent font-mono text-sm text-ink-1 transition-colors duration-[120ms] hover:border-ink-3 hover:text-ink-0"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <ComboBox
            label="Add a person"
            value={typed}
            onChange={setTyped}
            options={options.filter((o) => !selected.includes(o))}
            placeholder="Start typing…"
          />
        </div>
        <button
          type="button"
          onClick={add}
          className="cursor-pointer rounded-sm border border-rule bg-transparent px-3 py-2 font-mono text-xs tracking-[0.1em] text-ink-1 uppercase hover:text-ink-0"
        >
          Add
        </button>
      </div>
    </div>
  )
}
