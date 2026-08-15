import { useId, useState } from 'react'
import { Chip, Label } from '../ui'
import { categoryVar } from '../ui/tokens'
import type { MuscleGroupTotals } from '../../utils/workoutUtils'

export type RadarMetric = 'sets' | 'reps' | 'volume'

const METRIC_LABEL: Record<RadarMetric, string> = {
  sets: 'sets',
  reps: 'reps',
  volume: 'volume',
}

function metricValue(t: MuscleGroupTotals, metric: RadarMetric): number {
  return metric === 'sets' ? t.sets : metric === 'reps' ? t.reps : t.volumeKg
}

/**
 * Sets per muscle group, as stippled bars — one square is one logged set.
 * A stippled bar reads as "counted things", which is what a set count is (§5).
 */
export function SetsPerGroupChart({ totals }: { totals: MuscleGroupTotals[] }) {
  if (totals.length === 0) return null
  const max = Math.max(...totals.map((t) => t.sets))

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption>
        <Label as="h3">Sets per muscle group</Label>
      </figcaption>

      <div className="flex flex-col gap-2">
        {totals.map((t, i) => (
          <div
            key={t.group}
            className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-3"
          >
            <span className="text-right font-mono text-label tracking-[0.1em] text-ink-2 uppercase">
              {t.group}
            </span>
            <span className="flex flex-wrap gap-[2px]" aria-hidden="true">
              {Array.from({ length: t.sets }, (_, j) => (
                <i
                  key={j}
                  className="block size-[7px] rounded-[1px]"
                  style={{ background: categoryVar(`cat-${(i % 6) + 1}`) }}
                />
              ))}
            </span>
            <span className="text-right font-mono text-sm text-ink-0">{t.sets}</span>
          </div>
        ))}
      </div>

      <div className="sr-only">
        <table>
          <caption>Sets per muscle group</caption>
          <thead>
            <tr>
              <th scope="col">Muscle group</th>
              <th scope="col">Sets</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.group}>
                <td>{t.group}</td>
                <td>{t.sets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">Highest is {max} sets.</span>
    </figure>
  )
}

/**
 * Radar of training balance, toggleable between sets / reps / volume.
 *
 * `Core` and `Other` are already excluded upstream by `radarGroups` — they
 * distort the shape (§7). Toggles are inline mono chips sitting directly above
 * the chart, per the design grammar, not a settings panel.
 */
export function MuscleGroupRadar({ totals }: { totals: MuscleGroupTotals[] }) {
  const [metric, setMetric] = useState<RadarMetric>('sets')
  const titleId = useId()

  // A radar needs at least three axes to read as a shape rather than a line.
  if (totals.length < 3) return null

  const values = totals.map((t) => metricValue(t, metric))
  const max = Math.max(...values, 1)

  const SIZE = 220
  const CENTER = SIZE / 2
  const RADIUS = SIZE / 2 - 34

  const point = (i: number, ratio: number) => {
    // Start at 12 o'clock and go clockwise.
    const angle = (i / totals.length) * Math.PI * 2 - Math.PI / 2
    return [
      CENTER + Math.cos(angle) * RADIUS * ratio,
      CENTER + Math.sin(angle) * RADIUS * ratio,
    ] as const
  }

  const polygon = totals
    .map((t, i) => point(i, metricValue(t, metric) / max).join(','))
    .join(' ')

  const caption = `Training balance by ${METRIC_LABEL[metric]}`

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <Label as="h3">Training balance</Label>
        <span className="flex gap-1.5">
          {(['sets', 'reps', 'volume'] as const).map((m) => (
            <Chip key={m} pressed={metric === m} onClick={() => setMetric(m)}>
              {m}
            </Chip>
          ))}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-labelledby={titleId}
        className="mx-auto w-full max-w-[280px]"
      >
        <title id={titleId}>{caption}</title>

        {/* Rings recede to near-invisible. */}
        {[0.33, 0.66, 1].map((r) => (
          <polygon
            key={r}
            points={totals.map((_, i) => point(i, r).join(',')).join(' ')}
            fill="none"
            stroke="var(--color-rule)"
            strokeWidth={1}
          />
        ))}

        {/* Spokes. */}
        {totals.map((_, i) => {
          const [x, y] = point(i, 1)
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="var(--color-rule)"
              strokeWidth={1}
            />
          )
        })}

        {/* The data: hairline outline, no fill beyond a faint wash. */}
        <polygon
          points={polygon}
          fill="var(--color-accent)"
          fillOpacity={0.12}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
        />
        {totals.map((t, i) => {
          const [x, y] = point(i, metricValue(t, metric) / max)
          return (
            <circle key={t.group} cx={x} cy={y} r={2.5} fill="var(--color-accent)" />
          )
        })}

        {/* Axis labels sit outside the outer ring. */}
        {totals.map((t, i) => {
          const [x, y] = point(i, 1.22)
          return (
            <text
              key={t.group}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="font-mono"
              fontSize={8}
              fill="var(--color-ink-2)"
            >
              {t.group.toUpperCase()}
            </text>
          )
        })}
      </svg>

      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Muscle group</th>
              <th scope="col">{METRIC_LABEL[metric]}</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.group}>
                <td>{t.group}</td>
                <td>{Math.round(metricValue(t, metric))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
