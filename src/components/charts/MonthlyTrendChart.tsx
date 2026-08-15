import { useId, useState } from 'react'
import { Chip, Label } from '../ui'
import { formatMonthLong } from '../../lib/dates'
import type { MonthlySeriesPoint } from '../../utils/workoutUtils'

type TrendMetric = 'activities' | 'volumeKg' | 'sets' | 'distanceKm' | 'totalMinutes'

const METRICS: Array<{
  key: TrendMetric
  label: string
  format: (v: number) => string
}> = [
  { key: 'activities', label: 'activities', format: (v) => String(Math.round(v)) },
  {
    key: 'volumeKg',
    label: 'volume',
    format: (v) => Math.round(v).toLocaleString('en-US'),
  },
  { key: 'sets', label: 'sets', format: (v) => String(Math.round(v)) },
  { key: 'distanceKm', label: 'distance', format: (v) => `${v.toFixed(1)} km` },
  { key: 'totalMinutes', label: 'time', format: (v) => `${(v / 60).toFixed(1)}h` },
]

/**
 * One point per calendar month across ALL history, with the selected month
 * highlighted (§7 Trend charts).
 *
 * Deliberately separate from the single-month comparison cards: those answer
 * "versus last month", this answers "over time". Discrete bars rather than a
 * line, because monthly totals are counted things, not a continuous signal.
 */
export function MonthlyTrendChart({
  series,
  selectedMonth,
}: {
  series: MonthlySeriesPoint[]
  /** Omitted on Analytics, where there is no month in focus to highlight. */
  selectedMonth?: Date
}) {
  const [metric, setMetric] = useState<TrendMetric>('activities')
  const titleId = useId()

  // A single point is a number, not a trend.
  if (series.length < 2) return null

  const spec = METRICS.find((m) => m.key === metric)!
  const values = series.map((p) => p[metric])
  const max = Math.max(...values, 1)

  const W = 320
  const H = 90
  const gap = 2
  const barW = Math.max(2, (W - gap * (series.length - 1)) / series.length)

  const isSelected = (p: MonthlySeriesPoint) =>
    selectedMonth !== undefined &&
    p.month.getFullYear() === selectedMonth.getFullYear() &&
    p.month.getMonth() === selectedMonth.getMonth()

  const caption = `Monthly ${spec.label} across all history`

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <Label as="h3">Over time</Label>
        <span className="flex flex-wrap gap-1.5">
          {METRICS.map((m) => (
            <Chip
              key={m.key}
              pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </Chip>
          ))}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        className="w-full"
        preserveAspectRatio="none"
      >
        <title id={titleId}>{caption}</title>

        {series.map((p, i) => {
          const v = p[metric]
          const h = max === 0 ? 0 : (v / max) * H
          const selected = isSelected(p)
          return (
            <rect
              key={i}
              x={i * (barW + gap)}
              // A zero month still gets a hairline so the gap is visible as a
              // month that happened, not a month that's missing.
              y={H - Math.max(h, v === 0 ? 1 : 2)}
              width={barW}
              height={Math.max(h, v === 0 ? 1 : 2)}
              fill={selected ? 'var(--color-accent)' : 'var(--color-ink-3)'}
              rx={1}
            >
              <title>{`${formatMonthLong(p.month)}: ${spec.format(v)}`}</title>
            </rect>
          )
        })}
      </svg>

      <div className="flex justify-between font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
        <span>{formatMonthLong(series[0]!.month)}</span>
        <span>{formatMonthLong(series[series.length - 1]!.month)}</span>
      </div>

      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">{spec.label}</th>
              <th scope="col">Selected</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p, i) => (
              <tr key={i}>
                <td>{formatMonthLong(p.month)}</td>
                <td>{spec.format(p[metric])}</td>
                <td>{isSelected(p) ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
