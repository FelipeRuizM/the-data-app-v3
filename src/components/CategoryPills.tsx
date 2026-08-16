import { Label } from './ui'
import { categoryVar } from './ui/tokens'
import type { ConfigCategory } from '../lib/config'

/**
 * The workout category, as a row of pills (D-59).
 *
 * There are three splits. A combobox made you type four letters and read a
 * dropdown to answer a three-way question — the whole set is smaller than the
 * control that selected from it.
 *
 * Each pill carries its own category colour, so the thing you tap is the thing
 * you will see on the list row, the calendar cell and the chart (§4 "used
 * consistently everywhere"). Tapping the selected pill clears it: 14 of the 81
 * real workouts have no category, and uncategorized is a legal answer, not a
 * mistake (§3.1).
 *
 * A stored category that `/config` no longer defines is appended rather than
 * dropped, for the same reason the combobox kept one — a retired split still
 * sits on old records, and silently deselecting it would rewrite the record on
 * the next save (§3.7).
 */
export function CategoryPills({
  value,
  onChange,
  categories,
}: {
  value: string
  onChange: (next: string) => void
  categories: readonly ConfigCategory[]
}) {
  const known = categories.map((c) => c.name)
  const rows: Array<{ name: string; colorToken: string }> = [
    ...categories.map((c) => ({ name: c.name, colorToken: c.colorToken })),
    ...(value !== '' && !known.includes(value)
      ? [{ name: value, colorToken: 'cat-none' }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-2">
      <Label>Category</Label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
        {rows.map((row) => {
          const on = row.name === value
          return (
            <button
              key={row.name}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? '' : row.name)}
              className={
                'flex cursor-pointer items-center gap-1.5 rounded-sm border bg-transparent px-2.5 py-1.5 font-mono text-label tracking-[0.12em] uppercase transition-colors duration-[120ms] ' +
                (on
                  ? 'border-ink-3 text-ink-0'
                  : 'border-rule text-ink-2 hover:text-ink-1')
              }
            >
              {/* A hairline dot, never a filled pill — a block of colour beside
                  a label competes with the data (§5). */}
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: categoryVar(row.colorToken) }}
              />
              {row.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
