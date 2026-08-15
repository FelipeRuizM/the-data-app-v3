import type { ReactNode } from 'react'
import { Label } from './ui'
import type { Delta } from '../utils/workoutUtils'

/**
 * One monthly stat: the current value large and bright, the delta versus last
 * month beneath (§7 Layer 1).
 *
 * The delta's `direction` already accounts for `invertTrend`, so this component
 * never needs to know that a rising pace is bad — that semantics lives in the
 * aggregation, tested there.
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  formatDelta,
  sub,
}: {
  label: string
  value: string
  unit?: string | undefined
  delta?: Delta | null | undefined
  /** Formats the absolute part; the percent is appended automatically. */
  formatDelta?: ((absolute: number) => string) | undefined
  sub?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-2xl leading-none tracking-tight text-ink-0">
        {value}
        {unit ? <span className="ml-1 text-xs text-ink-2">{unit}</span> : null}
      </span>
      <Label>{label}</Label>
      {delta ? <DeltaLine delta={delta} formatDelta={formatDelta} /> : null}
      {sub ? <span className="font-mono text-xs text-ink-3">{sub}</span> : null}
    </div>
  )
}

function DeltaLine({
  delta,
  formatDelta,
}: {
  delta: Delta
  formatDelta?: ((absolute: number) => string) | undefined
}) {
  const tone =
    delta.direction === 'up'
      ? 'text-cat-2'
      : delta.direction === 'down'
        ? 'text-accent'
        : 'text-ink-3'

  const arrow = delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '—'

  if (delta.direction === 'flat') {
    return <span className="font-mono text-xs text-ink-3">— no change</span>
  }

  const magnitude = Math.abs(delta.absolute)
  const absoluteText = formatDelta ? formatDelta(magnitude) : formatNumber(magnitude)
  const percentText =
    delta.percent === null
      ? ''
      : ` · ${delta.percent > 0 ? '+' : ''}${delta.percent.toFixed(1)}%`

  return (
    <span className={`font-mono text-xs tracking-[0.04em] ${tone}`}>
      {arrow} {absoluteText}
      {percentText}
    </span>
  )
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1)
}
