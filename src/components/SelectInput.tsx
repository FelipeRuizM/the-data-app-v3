import { useId, useState } from 'react'
import { Label } from './ui'

/**
 * A native `<select>` for any value that comes from a known set.
 *
 * This replaces `ComboInput` everywhere the options are a catalog — places,
 * categories, run types, exercises, shoes, watches. On a phone a `<select>`
 * opens the OS picker instead of the keyboard, which is the whole point: these
 * are the fields logged most often, and typing a gym name from memory is both
 * slower and the only way to produce a dangling join.
 *
 * Two rules make it safe to use on records that already exist:
 *
 *  1. **A stored value that is no longer in the catalog stays selectable.** A
 *     retired category still sits on old records (§3.7 — every join must be
 *     total), so it is prepended rather than silently dropped, which would
 *     rewrite the record on the next save.
 *  2. **`allowCreate` keeps create-on-the-fly** for the per-user catalogs where
 *     §4 requires it. Picking "Add a new one" swaps in a text field; the caller
 *     still receives a plain name string, because joins are by name (§3.7) and
 *     there is no hidden id to reconcile.
 *
 * Vocabularies owned by the admin panel (categories, run types, shoes,
 * watches) pass `allowCreate={false}` — inventing one from a log form produces
 * a name with no `/config` row behind it, which then has no colour and no id.
 */

/** Not a legal name: nobody types colons around a word. */
const CREATE = '::create-new::'

export function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder = '—',
  allowCreate = false,
  createLabel = 'Add a new one…',
  id: idProp,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  options: readonly string[]
  /** The empty choice. Every one of these fields is genuinely optional. */
  placeholder?: string | undefined
  allowCreate?: boolean | undefined
  createLabel?: string | undefined
  id?: string | undefined
}) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const [creating, setCreating] = useState(false)

  if (creating) {
    return (
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1" htmlFor={id}>
          <Label>{label}</Label>
          <input
            id={id}
            autoFocus
            value={value}
            placeholder="Name"
            onChange={(e) => onChange(e.target.value)}
            className={fieldClass}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            onChange('')
            setCreating(false)
          }}
          className="cursor-pointer self-start border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-ink-2 uppercase hover:text-ink-0"
        >
          Back to the list
        </button>
      </div>
    )
  }

  const known = options.filter((o) => o !== CREATE)
  const all = value !== '' && !known.includes(value) ? [value, ...known] : known

  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <Label>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          if (e.target.value === CREATE) {
            onChange('')
            setCreating(true)
            return
          }
          onChange(e.target.value)
        }}
        className={fieldClass}
      >
        <option value="">{placeholder}</option>
        {all.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {allowCreate ? <option value={CREATE}>+ {createLabel}</option> : null}
      </select>
    </label>
  )
}

const fieldClass =
  'w-full rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3'
