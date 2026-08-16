import { useId } from 'react'
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
