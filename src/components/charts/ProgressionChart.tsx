import { useId, useState } from 'react'

export type ProgressionPoint = {
  date: Date
  value: number
  /** Marks a session that broke a record — drawn in the accent. */
  isPR: boolean
  label: string
}

/**
 * A hairline, unfilled progression line with discrete point marks.
 *
 * Hand-drawn SVG rather than Recharts: the design calls for a hairline
 * unfilled line with discrete marks and near-invisible axes (§5 Charts), which
 * is less code drawn directly than it is Recharts overrides — and it keeps the
 * bundle out of the entry chunk until a chart genuinely needs it.
 *
 * Every chart carries a text alternative (§5) — here a visually-hidden table.
 */
export function ProgressionChart({
  points,
  caption,
  formatValue,
}: {
  points: ProgressionPoint[]
  caption: string
  formatValue: (v: number) => string
}) {
  const titleId = useId()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) return null

  const W = 320
  const H = 120
  const PAD_L = 4
  const PAD_R = 4
  const PAD_T = 10
  const PAD_B = 18

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series would divide by zero; give it a band so the line sits mid-height.
  const span = max - min || Math.max(max, 1)

  const x = (i: number) =>
    points.length === 1
      ? (W - PAD_L - PAD_R) / 2 + PAD_L
      : PAD_L + (i / (points.length - 1)) * (W - PAD_L - PAD_R)
  const y = (v: number) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B)

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`)
    .join(' ')
  const active = hover === null ? null : points[hover]

  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        className="w-full"
        onMouseLeave={() => setHover(null)}
      >
        <title id={titleId}>{caption}</title>

        {/* Gridlines recede to near-invisible; data advances. */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + t * (H - PAD_T - PAD_B)}
            y2={PAD_T + t * (H - PAD_T - PAD_B)}
            stroke="var(--color-rule)"
            strokeWidth={1}
          />
        ))}

        <path d={path} fill="none" stroke="var(--color-ink-1)" strokeWidth={1} />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={p.isPR ? 3.5 : 2.5}
            fill={p.isPR ? 'var(--color-accent)' : 'var(--color-ink-1)'}
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {active ? (
          <text
            x={Math.min(Math.max(x(hover!), 30), W - 30)}
            y={8}
            textAnchor="middle"
            fill="var(--color-ink-0)"
            className="font-mono"
            fontSize={9}
          >
            {active.label}
          </text>
        ) : null}
      </svg>

      <figcaption className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
        {caption}
      </figcaption>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Value</th>
            <th scope="col">Record broken</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{p.label}</td>
              <td>{formatValue(p.value)}</td>
              <td>{p.isPR ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
