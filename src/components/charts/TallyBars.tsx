import { Label } from '../ui'
import type { Tally } from '../../utils/analytics'

/**
 * A ranked breakdown — places, training partners (§4).
 *
 * Horizontal bars rather than a pie: these are counts to compare, the labels
 * are words of very different lengths, and a bar chart reads at 375px where a
 * pie with seven slices does not.
 *
 * The bar is a thin mark on the ground with the number in mono beside it — no
 * axis, no gridlines, because the label and the value already say everything an
 * axis would.
 */
export function TallyBars({
  title,
  items,
  emptyNote,
  limit = 8,
}: {
  title: string
  items: Tally[]
  emptyNote: string
  limit?: number
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Label as="h3">{title}</Label>
        <p className="m-0 text-sm text-ink-2">{emptyNote}</p>
      </div>
    )
  }

  const shown = items.slice(0, limit)
  const max = Math.max(...shown.map((i) => i.count), 1)

  return (
    <figure className="m-0 flex flex-col gap-3">
      <Label as="h3">{title}</Label>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.map((entry) => (
          <li key={entry.name} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-ink-1">{entry.name}</span>
              <span className="shrink-0 font-mono text-sm text-ink-0 tabular-nums">
                {entry.count}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="block h-1 rounded-[1px] bg-accent"
              style={{ width: `${(entry.count / max) * 100}%` }}
            />
          </li>
        ))}
      </ul>

      {items.length > limit ? (
        <figcaption className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
          Top {limit} of {items.length}
        </figcaption>
      ) : null}
    </figure>
  )
}
