import { Link } from 'react-router-dom'
import { Badge, Label } from './ui'
import { formatDay } from '../lib/dates'
import { formatVolume, formatWeight } from '../lib/units'
import { metricLabel } from '../utils/prEngine'
import { countByMetric, type MonthlyRecord } from '../utils/workoutUtils'
import type { Units } from '../types'

/**
 * Records broken this month (§7 Layer 3), as a collapsible card.
 *
 * Closed shows a count; expanded shows type totals as chips plus a
 * per-exercise line-item breakdown. Uses a native <details> so the toggle is
 * keyboard-accessible and works without JS.
 */
export function RecordsBrokenCard({
  records,
  units,
}: {
  records: MonthlyRecord[]
  units: Units
}) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col gap-2 border-l-2 border-rule py-1 pl-4">
        <Label>Records</Label>
        <p className="m-0 text-ink-0">No records broken this month.</p>
        <p className="m-0 max-w-prose text-sm text-ink-2">
          A record has to be beaten, not matched — and an exercise&rsquo;s first ever
          session sets its baseline silently.
        </p>
      </div>
    )
  }

  const counts = countByMetric(records)

  return (
    <details className="group flex flex-col gap-3 border-l-2 border-accent pl-4">
      <summary className="cursor-pointer list-none">
        <span className="flex flex-col gap-1">
          <Label>Records</Label>
          <span className="text-ink-0">
            {records.length} personal record{records.length === 1 ? '' : 's'} broken
            this month
          </span>
          <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
            <span className="group-open:hidden">Show ▾</span>
            <span className="hidden group-open:inline">Hide ▴</span>
          </span>
        </span>
      </summary>

      <div className="flex flex-col gap-4 pt-4">
        <div className="flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <Badge key={c.metric} pr>
              {c.count} {metricLabel(c.metric)}
            </Badge>
          ))}
        </div>

        <ul className="flex list-none flex-col gap-0 p-0">
          {records.map((r) => (
            // Two lines, not one: on a single flex row at 375px the exercise
            // name truncated to "Bice…" / "Bi…", which makes Bicep Curl
            // (Cable) indistinguishable from Bicep Curl (Barbell).
            <li
              key={`${r.exerciseTitle}::${r.metric}`}
              className="flex flex-col gap-1 border-b border-rule py-3"
            >
              <Link
                to={`/workouts/records/${encodeURIComponent(r.exerciseTitle)}`}
                className="text-ink-0 no-underline hover:text-accent"
              >
                {r.exerciseTitle}
              </Link>
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Badge pr>{metricLabel(r.metric)}</Badge>
                <span className="font-mono text-xs text-ink-1">
                  {formatRecordValue(r, units)}
                  <span className="text-ink-3">
                    {' '}
                    from {formatRecordValue({ ...r, value: r.previous }, units)}
                  </span>
                </span>
                <Link
                  to={`/workouts/${r.workoutId}`}
                  className="font-mono text-xs text-ink-3 no-underline hover:text-ink-1"
                >
                  {formatDay(r.date)}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function formatRecordValue(r: MonthlyRecord, units: Units): string {
  // Volume and 1RM are large aggregates; weight is a single load.
  return r.metric === 'weight'
    ? formatWeight(r.value, units, { withUnit: false })
    : formatVolume(r.value, units)
}
