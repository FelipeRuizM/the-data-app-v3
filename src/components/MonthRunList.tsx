import { Link } from 'react-router-dom'
import { CategoryTag, Label } from './ui'
import { formatDayShort, formatDuration, formatPace } from '../lib/dates'
import { formatDistance } from '../lib/units'
import { colorTokenFor, type ConfigCategory } from '../lib/config'
import type { Run } from '../types'

/**
 * That month's runs, newest first (§7 Layer 4).
 *
 * NO aggregation — this layer is deliberately just a list. The totals already
 * live in the Runs stat cards above; repeating them here would invite the two
 * to drift.
 */
export function MonthRunList({
  runs,
  runTypes,
}: {
  runs: Run[]
  runTypes: ConfigCategory[]
}) {
  if (runs.length === 0) return null

  const newestFirst = [...runs].sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  )

  return (
    <div className="flex flex-col gap-3">
      <Label as="h3">Runs this month</Label>
      <ul className="flex list-none flex-col gap-0 p-0">
        {newestFirst.map((r) => (
          <li key={r.id} className="border-b border-rule">
            <Link
              to={`/runs/${r.id}`}
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1.5 py-4 no-underline"
            >
              <span className="min-w-0 truncate text-ink-0">{r.title}</span>
              <span className="font-mono text-xs whitespace-nowrap text-ink-2">
                {formatDayShort(r.startTime)}
              </span>
              <span className="col-span-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <CategoryTag token={colorTokenFor(runTypes, r.type)}>
                  {r.type ?? 'Untyped'}
                </CategoryTag>
                <Metric value={formatDistance(r.distanceKm)} />
                <Metric value={formatPace(r.paceSecPerKm)} unit="/km" />
                <Metric value={formatDuration(r.durationMinutes)} />
                <Metric
                  value={
                    r.elevationGainM === null
                      ? '—'
                      : String(Math.round(r.elevationGainM))
                  }
                  unit="m"
                />
                <Metric
                  value={r.avgHeartRate === null ? '—' : String(r.avgHeartRate)}
                  unit="bpm"
                />
                <Metric
                  value={r.calories === null ? '—' : String(Math.round(r.calories))}
                  unit="kcal"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Metric({ value, unit }: { value: string; unit?: string | undefined }) {
  return (
    <span className="font-mono text-xs text-ink-1">
      {value}
      {unit ? <span className="ml-1 text-ink-2">{unit}</span> : null}
    </span>
  )
}
