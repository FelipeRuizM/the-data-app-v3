import { useId, useRef, useState } from 'react'
import { Label } from './ui'

/**
 * Type, see the matches, pick one — or keep what you typed and let the caller
 * create it (D-52).
 *
 * A plain `<select>` was wrong in both directions: it made you scroll a list of
 * 74 exercises to find one you could have typed four letters of, and it made a
 * name that isn't in the catalog yet impossible to enter at all. A `<datalist>`
 * was wrong too — Safari and Firefox each render it differently, several
 * platforms don't filter as you type, and none of them show whether what you
 * typed is new.
 *
 * So this is a real combobox: a text input that filters the catalog on every
 * keystroke, an explicit "Add …" row when nothing matches, and full keyboard
 * navigation. **What the caller receives is always a plain name string**, because
 * joins are by name (§3.7) — there is no hidden id to reconcile, and a name that
 * isn't in the catalog is a valid value that the form then creates.
 */
export function ComboBox({
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
  const listId = `${id}-listbox`

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const query = value.trim().toLowerCase()
  // Substring, not prefix: "row" should find "Bent Over Row (Barbell)", which
  // is how these names are actually remembered.
  const matches =
    query === '' ? [...options] : options.filter((o) => o.toLowerCase().includes(query))

  const exact = options.some((o) => o.toLowerCase() === query)
  const canAdd = query !== '' && !exact
  // The "Add …" row is one past the end of the matches.
  const rowCount = matches.length + (canAdd ? 1 : 0)

  const commit = (next: string) => {
    onChange(next)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(0)
        return
      }
      if (rowCount === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + rowCount) % rowCount)
      return
    }
    if (e.key === 'Enter') {
      // Never submit the whole form from inside the list.
      if (open && active >= 0 && active < matches.length) {
        e.preventDefault()
        commit(matches[active]!)
        return
      }
      if (open) {
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      }
      return
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className="relative flex flex-col gap-1">
      <label className="flex flex-col gap-1" htmlFor={id}>
        <Label>{label}</Label>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          placeholder={placeholder ?? ''}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Deferred so a click on a row lands before the list unmounts.
            blurTimer.current = setTimeout(() => setOpen(false), 120)
          }}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 rounded-sm border border-rule bg-transparent px-3 py-2 text-ink-0 placeholder:text-ink-3"
        />
      </label>

      {open && rowCount > 0 ? (
        <ul
          id={listId}
          role="listbox"
          // NOT `label` — that is the input's name, and two elements answering
          // to it makes the field ambiguous to a screen reader (and to any
          // query that looks a control up by its label).
          aria-label={`${label} suggestions`}
          // The list sits over the next field rather than pushing it down — a
          // form that reflows under your thumb mid-tap is how you log the
          // wrong exercise.
          className="absolute top-full right-0 left-0 z-20 m-0 max-h-56 list-none overflow-y-auto border border-rule bg-ground p-0"
          onMouseDown={(e) => {
            // Keep focus on the input so the blur timer never fires mid-click.
            e.preventDefault()
            if (blurTimer.current) clearTimeout(blurTimer.current)
          }}
        >
          {matches.map((option, i) => (
            <li
              key={option}
              role="option"
              aria-selected={i === active}
              onClick={() => commit(option)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === active ? 'bg-rule text-ink-0' : 'text-ink-1'
              }`}
            >
              {option}
            </li>
          ))}

          {canAdd ? (
            <li
              role="option"
              aria-selected={active === matches.length}
              onClick={() => commit(value.trim())}
              className={`cursor-pointer border-t border-rule px-3 py-2 font-mono text-label tracking-[0.12em] uppercase ${
                active === matches.length ? 'bg-rule text-accent' : 'text-accent'
              }`}
            >
              Add “{value.trim()}”
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
