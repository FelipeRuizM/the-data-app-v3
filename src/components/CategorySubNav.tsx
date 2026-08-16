import { format } from 'date-fns'
import { SubNav } from './SubNav'

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
  extra = [],
}: {
  recordsPath: string
  /** Category-specific extras, e.g. the workouts-only calculator (§8). */
  extra?: Array<{ to: string; label: string }>
}) {
  const thisMonth = format(new Date(), 'yyyy-MM')

  return (
    <SubNav
      links={[
        { to: recordsPath, label: 'Records' },
        { to: `/reports/${thisMonth}`, label: 'Monthly report' },
        ...extra,
      ]}
    />
  )
}
