import { Chip, Label } from '../../components/ui'
import {
  EMPTY_FILTERS,
  UNCATEGORIZED,
  hasActiveFilters,
  type WorkoutFilters,
} from '../../lib/filters'
import { categoryVar } from '../../components/ui/tokens'

/**
 * Filters as a row of inline chips, sitting directly above the list — the same
 * grammar as a chart legend, not a settings panel (§5).
 *
 * Category is always visible because it is the filter actually reached for;
 * place, person and dates live behind a disclosure so the bar stays usable at
 * 375px.
 */
export function FilterBar({
  filters,
  onChange,
  options,
  colorFor,
  resultCount,
  totalCount,
}: {
  filters: WorkoutFilters
  onChange: (next: WorkoutFilters) => void
  options: {
    categories: string[]
    hasUncategorized: boolean
    places: string[]
    people: string[]
  }
  colorFor: (category: string | null) => string
  resultCount: number
  totalCount: number
}) {
  const set = <K extends keyof WorkoutFilters>(key: K, value: WorkoutFilters[K]) =>
    onChange({ ...filters, [key]: value })

  /** Selecting the active value again clears it — no separate "all" chip needed. */
  const toggle = (key: 'category' | 'place' | 'person', value: string) =>
    set(key, filters[key] === value ? null : value)

  const active = hasActiveFilters(filters)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {options.categories.map((c) => (
          <Chip
            key={c}
            pressed={filters.category === c}
            onClick={() => toggle('category', c)}
          >
            <span className="inline-flex items-center gap-1.5">
              <i
                aria-hidden="true"
                className="block size-1.5 rounded-[1px]"
                style={{ background: categoryVar(colorFor(c)) }}
              />
              {c}
            </span>
          </Chip>
        ))}
        {options.hasUncategorized ? (
          <Chip
            pressed={filters.category === UNCATEGORIZED}
            onClick={() => toggle('category', UNCATEGORIZED)}
          >
            <span className="inline-flex items-center gap-1.5">
              <i
                aria-hidden="true"
                className="block size-1.5 rounded-[1px]"
                style={{ background: categoryVar(null) }}
              />
              Uncategorized
            </span>
          </Chip>
        ) : null}
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none font-mono text-label tracking-[0.12em] text-ink-3 uppercase hover:text-ink-2">
          More filters
        </summary>

        <div className="flex flex-col gap-4 pt-4">
          {options.places.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>Place</Label>
              <div className="flex flex-wrap gap-1.5">
                {options.places.map((p) => (
                  <Chip
                    key={p}
                    pressed={filters.place === p}
                    onClick={() => toggle('place', p)}
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {options.people.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>With</Label>
              <div className="flex flex-wrap gap-1.5">
                {options.people.map((p) => (
                  <Chip
                    key={p}
                    pressed={filters.person === p}
                    onClick={() => toggle('person', p)}
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
              <DateInput
                label="From"
                value={filters.from}
                onChange={(d) => set('from', d)}
              />
              <DateInput label="To" value={filters.to} onChange={(d) => set('to', d)} />
            </div>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-rule pt-2">
        <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
          {resultCount === totalCount
            ? `${totalCount} workout${totalCount === 1 ? '' : 's'}`
            : `${resultCount} of ${totalCount}`}
        </span>
        {active ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * A native date input, styled down to the token layer.
 *
 * The value is round-tripped through `dates.ts` rather than `toISOString()` —
 * the latter shifts by the timezone offset and would silently move a picked
 * date by a day for anyone west of UTC (§3.6).
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
      <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
        {label}
      </span>
      <input
        type="date"
        value={asInputValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === '') return onChange(null)
          const [y, m, d] = v.split('-').map(Number)
          // Constructed in local time on purpose — never `new Date(v)`, which
          // parses a bare YYYY-MM-DD as UTC midnight.
          onChange(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1))
        }}
        className="rounded-sm border border-rule bg-transparent px-2 py-1 font-mono text-xs text-ink-0"
      />
    </label>
  )
}
