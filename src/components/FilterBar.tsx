import type { ReactNode } from 'react'
import { Chip, Label } from './ui'
import { categoryVar } from './ui/tokens'

/**
 * Filters as a row of inline chips, sitting directly above a list — the same
 * grammar as a chart legend, not a settings panel (§5).
 *
 * Purely presentational and shared between Workouts and Runs: the visual
 * grammar is identical, even though the underlying filter *logic* is kept as
 * two parallel implementations in `lib/filters.ts` (CLAUDE.md §1 — two
 * concrete implementations, no forced abstraction). This component only knows
 * about strings, dates and callbacks, not about workouts or runs.
 *
 * The primary tag (category / run type) is always visible because it's the
 * filter actually reached for; place, person and dates live behind a
 * disclosure so the bar stays usable at 375px.
 */
export function FilterBar({
  tagLabel,
  tagOptions,
  activeTag,
  onTagChange,
  colorForTag,
  noneTag,
  places,
  activePlace,
  onPlaceChange,
  people,
  activePerson,
  onPersonChange,
  from,
  to,
  onFromChange,
  onToChange,
  resultCount,
  totalCount,
  countNoun,
  active,
  onClear,
}: {
  /** e.g. "Category" or "Type" — not rendered, kept for a11y/testing hooks. */
  tagLabel: string
  tagOptions: string[]
  activeTag: string | null
  onTagChange: (next: string | null) => void
  colorForTag: (tag: string) => string
  /** The "uncategorized" / "untyped" bucket, when the data has one. */
  noneTag?: { sentinel: string; label: string } | undefined
  places: string[]
  activePlace: string | null
  onPlaceChange: (next: string | null) => void
  people: string[]
  activePerson: string | null
  onPersonChange: (next: string | null) => void
  from: Date | null
  to: Date | null
  onFromChange: (d: Date | null) => void
  onToChange: (d: Date | null) => void
  resultCount: number
  totalCount: number
  /** "workout" / "run" — pluralized here. */
  countNoun: string
  active: boolean
  onClear: () => void
}) {
  /** Selecting the active value again clears it — no separate "all" chip needed. */
  const toggleTag = (value: string) => onTagChange(activeTag === value ? null : value)
  const togglePlace = (value: string) =>
    onPlaceChange(activePlace === value ? null : value)
  const togglePerson = (value: string) =>
    onPersonChange(activePerson === value ? null : value)

  return (
    <div className="flex flex-col gap-3" aria-label={`${tagLabel} filters`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {tagOptions.map((tag) => (
          <Chip key={tag} pressed={activeTag === tag} onClick={() => toggleTag(tag)}>
            <TagChipContent color={colorForTag(tag)}>{tag}</TagChipContent>
          </Chip>
        ))}
        {noneTag ? (
          <Chip
            pressed={activeTag === noneTag.sentinel}
            onClick={() => toggleTag(noneTag.sentinel)}
          >
            <TagChipContent color={categoryVar(null)} raw>
              {noneTag.label}
            </TagChipContent>
          </Chip>
        ) : null}
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none font-mono text-label tracking-[0.12em] text-ink-2 uppercase hover:text-ink-2">
          More filters
        </summary>

        <div className="flex flex-col gap-4 pt-4">
          {places.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>Place</Label>
              <div className="flex flex-wrap gap-1.5">
                {places.map((p) => (
                  <Chip
                    key={p}
                    pressed={activePlace === p}
                    onClick={() => togglePlace(p)}
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {people.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>With</Label>
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <Chip
                    key={p}
                    pressed={activePerson === p}
                    onClick={() => togglePerson(p)}
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label>Date range</Label>
            <div className="flex flex-wrap items-center gap-2">
              <DateInput label="From" value={from} onChange={onFromChange} />
              <DateInput label="To" value={to} onChange={onToChange} />
            </div>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-rule pt-2">
        <span className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
          {resultCount === totalCount
            ? `${totalCount} ${countNoun}${totalCount === 1 ? '' : 's'}`
            : `${resultCount} of ${totalCount}`}
        </span>
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  )
}

function TagChipContent({
  color,
  children,
  raw = false,
}: {
  /** Pass a raw CSS value (already resolved) when `raw`; otherwise a token id. */
  color: string
  children: ReactNode
  raw?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i
        aria-hidden="true"
        className="block size-1.5 rounded-[1px]"
        style={{ background: raw ? color : categoryVar(color) }}
      />
      {children}
    </span>
  )
}

/**
 * A native date input, styled down to the token layer.
 *
 * The value is round-tripped through local Date parts rather than
 * `toISOString()` — the latter shifts by the timezone offset and would
 * silently move a picked date by a day for anyone west of UTC (§3.6).
 */
function DateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: Date | null
  onChange: (d: Date | null) => void
}) {
  const asInputValue = value
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
        value.getDate(),
      ).padStart(2, '0')}`
    : ''

  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
        {label}
      </span>
      <input
        type="date"
        value={asInputValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === '') return onChange(null)
          const [y, m, d] = v.split('-').map(Number)
          onChange(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1))
        }}
        className="rounded-sm border border-rule bg-transparent px-2 py-1 font-mono text-xs text-ink-0"
      />
    </label>
  )
}
