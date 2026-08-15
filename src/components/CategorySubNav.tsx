import { Link } from 'react-router-dom'
import { format } from 'date-fns'

/**
 * The Records and Monthly report sub-pages (§4), linked from the top of each
 * category's list page. Without this they were only reachable by typing the
 * URL — a real gap, since a route with nothing pointing at it is not a
 * shipped feature.
 *
 * Monthly report links at the CURRENT month; the page itself has ← / →
 * navigation from there.
 */
export function CategorySubNav({
  recordsPath,
  extra,
}: {
  recordsPath: string
  /** Category-specific extras, e.g. the workouts-only calculator (§8). */
  extra?: Array<{ to: string; label: string }>
}) {
  const thisMonth = format(new Date(), 'yyyy-MM')

  return (
    <nav aria-label="Section" className="flex gap-4">
      <Link
        to={recordsPath}
        className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-0"
      >
        Records
      </Link>
      <Link
        to={`/reports/${thisMonth}`}
        className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-0"
      >
        Monthly report
      </Link>
      {extra?.map((e) => (
        <Link
          key={e.to}
          to={e.to}
          className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-0"
        >
          {e.label}
        </Link>
      ))}
    </nav>
  )
}
