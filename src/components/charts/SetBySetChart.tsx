import { useId, useMemo, useState } from 'react'
import { Label } from '../ui'
import { categoryVar } from '../ui/tokens'
import { formatDay, formatDayShort } from '../../lib/dates'
import { formatVolume, formatWeight } from '../../lib/units'
import type { SetPoint } from '../../utils/setSeries'
import type { Units } from '../../types'

/**
 * Every set of one exercise, in the order it was performed — reps, weight and
 * volume on one plot, each toggleable (D-63).
 *
 * **The scale problem, and why it is solved this way.** Reps run 1–30, weight
 * 0–200, volume 0–3,000. A second y-axis is the single worst thing you can do
 * to a chart — it lets an author manufacture any correlation they like by
 * choosing where the axes cross — so with two or more series on, each is drawn
 * against **its own maximum**: 100% is that metric's best ever. The shapes
 * become comparable, which is the actual question ("did reps go up as weight
 * came down?"), and the real numbers stay one hover away.
 *
 * With a single series on, there is nothing to reconcile, so the axis switches
 * back to real units. That is the case where "how much" matters more than "what
 * shape", and it costs nothing to be exact there.
 */

const SERIES_KEYS = ['reps', 'weight', 'volume'] as const
type SeriesKey = (typeof SERIES_KEYS)[number]

/** Fixed order, never cycled — §5's categorical palette, assigned once. */
const TOKEN: Record<SeriesKey, string> = {
  reps: 'cat-1',
  weight: 'cat-2',
  volume: 'cat-3',
}

const HEIGHT = 200
const PAD_T = 12
const PAD_B = 26
const PAD_L = 40
const PAD_R = 12
const PLOT_H = HEIGHT - PAD_T - PAD_B
/** Per point. Keeps marks apart, and makes the plot scroll rather than crush. */
const STEP = 11
const MIN_W = 320

export function SetBySetChart({ points, units }: { points: SetPoint[]; units: Units }) {
  const titleId = useId()
  const [active, setActive] = useState<Set<SeriesKey>>(new Set(SERIES_KEYS))
  const [hovered, setHovered] = useState<number | null>(null)

  const value = useMemo(
    () => ({
      reps: (p: SetPoint) => p.reps,
      weight: (p: SetPoint) => p.weightKg,
      volume: (p: SetPoint) => p.volumeKg,
    }),
    [],
  )

  const format = useMemo(
    () => ({
      reps: (v: number) => `${Math.round(v)}`,
      weight: (v: number) => formatWeight(v, units, { withUnit: false }),
      volume: (v: number) => formatVolume(v, units),
    }),
    [units],
  )

  const unitFor: Record<SeriesKey, string> = {
    reps: 'reps',
    weight: units,
    volume: units,
  }

  const maxima = useMemo(() => {
    const out = {} as Record<SeriesKey, number>
    for (const key of SERIES_KEYS) {
      const values = points
        .map((p) => value[key](p))
        .filter((v): v is number => v !== null)
      out[key] = values.length > 0 ? Math.max(...values) : 0
    }
    return out
  }, [points, value])

  // A single point is a number, not a series.
  if (points.length < 2) return null

  const on = SERIES_KEYS.filter((k) => active.has(k) && maxima[k] > 0)
  const single = on.length === 1 ? on[0]! : null

  const width = Math.max(MIN_W, PAD_L + points.length * STEP + PAD_R)
  const x = (i: number) => PAD_L + i * STEP + STEP / 2
  /** Normalised 0–1 → pixels, top-down. */
  const y = (ratio: number) => PAD_T + (1 - ratio) * PLOT_H

  const ratioOf = (key: SeriesKey, v: number) =>
    // In single-series mode the axis IS that series, so it scales to its own
    // max either way — the difference is only what the ticks say.
    maxima[key] === 0 ? 0 : v / maxima[key]

  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const tickLabel = (ratio: number) =>
    single ? format[single](maxima[single] * ratio) : `${Math.round(ratio * 100)}%`

  /** Where each session begins, for the hairlines that separate workouts. */
  const sessionStarts = points
    .map((p, i) => (i === 0 || points[i - 1]!.session !== p.session ? i : -1))
    .filter((i) => i > 0)

  const shown = hovered ?? points.length - 1
  const readout = points[shown]!

  const toggle = (key: SeriesKey) => {
    const next = new Set(active)
    if (next.has(key)) {
      // Never leave the plot empty — "show me nothing" is not a question
      // anyone is asking of this chart.
      if (next.size === 1) return
      next.delete(key)
    } else {
      next.add(key)
    }
    setActive(next)
  }

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <Label as="h2">Set by set</Label>
        <span className="flex flex-wrap gap-1.5">
          {SERIES_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={active.has(key)}
              onClick={() => toggle(key)}
              className={
                'flex cursor-pointer items-center gap-1.5 rounded-sm border bg-transparent px-2 py-1 font-mono text-label tracking-[0.12em] uppercase transition-colors duration-[120ms] ' +
                (active.has(key)
                  ? 'border-ink-3 text-ink-0'
                  : 'border-rule text-ink-2 hover:text-ink-1')
              }
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  background: active.has(key)
                    ? categoryVar(TOKEN[key])
                    : 'var(--color-ink-3)',
                }}
              />
              {key}
            </button>
          ))}
        </span>
      </figcaption>

      {/* The readout replaces a floating tooltip. At 375px a positioned box
          either clips or covers the plot, and on touch there is no hover to
          dismiss it — a fixed line that updates is legible in both cases. It
          shows the most recent set at rest, so it is never blank. */}
      <div
        // role="status" implies aria-live="polite", and gives the readout a name
        // a screen reader (and a test) can address it by.
        role="status"
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule pb-2 font-mono text-xs"
      >
        <span className="text-ink-0">{formatDay(readout.date)}</span>
        <span className="text-ink-2">set {readout.setInSession}</span>
        {readout.setType && readout.setType !== 'normal' ? (
          <span className="text-ink-2">{readout.setType}</span>
        ) : null}
        {SERIES_KEYS.map((key) => {
          const v = value[key](readout)
          return (
            <span key={key} className="flex items-baseline gap-1.5">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 self-center rounded-full"
                style={{ background: categoryVar(TOKEN[key]) }}
              />
              <span className="text-ink-0">{v === null ? '—' : format[key](v)}</span>
              <span className="text-ink-2">{unitFor[key]}</span>
            </span>
          )
        })}
        {readout.prMetrics.length > 0 ? (
          <span className="text-accent">
            {readout.prMetrics.length} PR{readout.prMetrics.length > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      {/* Scrolls rather than crushing: at 200 sets a fitted plot puts marks a
          pixel apart, which is a texture, not a chart. */}
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-labelledby={titleId}
          className="block"
          onPointerLeave={() => setHovered(null)}
        >
          <title id={titleId}>
            {`Every logged set, oldest first — ${on.join(', ')}`}
          </title>

          {/* Axis and gridlines recede to near-invisible; data advances (§5). */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                y1={y(t)}
                x2={width - PAD_R}
                y2={y(t)}
                stroke="var(--color-rule)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={y(t) + 3}
                textAnchor="end"
                className="font-mono"
                fontSize={8}
                fill="var(--color-ink-2)"
              >
                {tickLabel(t)}
              </text>
            </g>
          ))}

          {/* Where one workout ends and the next begins — the thing a
              per-session chart could show and a flat set list could not. */}
          {sessionStarts.map((i) => (
            <line
              key={`s${i}`}
              x1={x(i) - STEP / 2}
              y1={PAD_T}
              x2={x(i) - STEP / 2}
              y2={PAD_T + PLOT_H}
              stroke="var(--color-rule)"
              strokeWidth={1}
            />
          ))}

          {on.map((key) => (
            <g key={key}>
              {segmentsOf(points, (p) => value[key](p)).map((segment, si) => (
                <polyline
                  key={si}
                  points={segment
                    .map(([i, v]) => `${x(i)},${y(ratioOf(key, v))}`)
                    .join(' ')}
                  fill="none"
                  stroke={categoryVar(TOKEN[key])}
                  strokeWidth={1}
                  strokeOpacity={0.55}
                />
              ))}
              {points.map((p) => {
                const v = value[key](p)
                if (v === null) return null
                return (
                  <circle
                    key={p.index}
                    cx={x(p.index)}
                    cy={y(ratioOf(key, v))}
                    r={p.index === shown ? 3.5 : 2.25}
                    fill={categoryVar(TOKEN[key])}
                  />
                )
              })}
            </g>
          ))}

          {/* A set that broke a record gets a ring, not a colour change — the
              colour already means which series this is (§6.2, §5). */}
          {points.map((p) =>
            p.prMetrics.length === 0 ? null : (
              <circle
                key={`pr${p.index}`}
                cx={x(p.index)}
                cy={PAD_T + PLOT_H + 7}
                r={2.5}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
              />
            ),
          )}

          {/* Hit targets are the full column, far bigger than the marks. */}
          {points.map((p) => (
            <rect
              key={`hit${p.index}`}
              x={x(p.index) - STEP / 2}
              y={PAD_T}
              width={STEP}
              height={PLOT_H}
              fill="transparent"
              onPointerEnter={() => setHovered(p.index)}
              onClick={() => setHovered(p.index)}
            />
          ))}

          {hovered !== null ? (
            <line
              x1={x(hovered)}
              y1={PAD_T}
              x2={x(hovered)}
              y2={PAD_T + PLOT_H}
              stroke="var(--color-ink-3)"
              strokeWidth={1}
            />
          ) : null}

          <text
            x={PAD_L}
            y={HEIGHT - 6}
            className="font-mono"
            fontSize={8}
            fill="var(--color-ink-2)"
          >
            {formatDayShort(points[0]!.date)}
          </text>
          <text
            x={width - PAD_R}
            y={HEIGHT - 6}
            textAnchor="end"
            className="font-mono"
            fontSize={8}
            fill="var(--color-ink-2)"
          >
            {formatDayShort(points[points.length - 1]!.date)}
          </text>
        </svg>
      </div>

      <span className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
        {single
          ? `${unitFor[single]} — real values`
          : 'each series as % of its own best'}
      </span>

      {/* Every chart carries a text alternative (§9). */}
      <div className="sr-only">
        <table>
          <caption>Every logged set, oldest first</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Set</th>
              <th scope="col">Reps</th>
              <th scope="col">Weight ({units})</th>
              <th scope="col">Volume ({units})</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.index}>
                <td>{formatDay(p.date)}</td>
                <td>{p.setInSession}</td>
                <td>{p.reps ?? '—'}</td>
                <td>{p.weightKg === null ? '—' : format.weight(p.weightKg)}</td>
                <td>{p.volumeKg === null ? '—' : format.volume(p.volumeKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/**
 * Split into runs of consecutive non-null values.
 *
 * A polyline over the raw list would draw straight through a gap, inventing a
 * measurement between two sets that never had one — a bodyweight set has no
 * weight, and the line must break rather than guess.
 */
function segmentsOf(
  points: readonly SetPoint[],
  pick: (p: SetPoint) => number | null,
): Array<Array<[number, number]>> {
  const segments: Array<Array<[number, number]>> = []
  let current: Array<[number, number]> = []

  for (const p of points) {
    const v = pick(p)
    if (v === null) {
      if (current.length > 1) segments.push(current)
      current = []
      continue
    }
    current.push([p.index, v])
  }
  if (current.length > 1) segments.push(current)
  return segments
}
