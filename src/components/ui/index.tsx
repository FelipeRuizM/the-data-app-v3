import type { ButtonHTMLAttributes, Ref, ReactNode } from 'react'
import { categoryVar } from './tokens'

/* ═══════════════════════════════════════════════════════════════════════════
   Primitives. Built, not borrowed — no component library ships this look.

   House rules enforced here so pages can't drift:
   · no card layer, no shadows, no borders as decoration
   · radius never exceeds --radius-md (4px)
   · labels are mono / uppercase / letter-spaced / dim
   · numbers are mono with tabular figures
   ═══════════════════════════════════════════════════════════════════════════ */

/** Small mono uppercase label — the "annotation on a plot" voice. */
export function Label({
  children,
  as: As = 'span',
}: {
  children: ReactNode
  as?: 'span' | 'div' | 'h1' | 'h2' | 'h3'
}) {
  return (
    <As className="font-mono text-label uppercase tracking-[0.14em] text-ink-2">
      {children}
    </As>
  )
}

/** Hairline rule. Separation comes from whitespace and these — nothing else. */
export function Rule() {
  return <hr className="border-0 border-t border-rule m-0" />
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet'
  /**
   * React 19 passes `ref` to function components as an ordinary prop, so no
   * forwardRef wrapper is needed — but `ButtonHTMLAttributes` doesn't declare
   * it, so it's declared here. Used by ConfirmDialog to focus Cancel.
   */
  ref?: Ref<HTMLButtonElement> | undefined
}

export function Button({ variant = 'quiet', className = '', ...rest }: ButtonProps) {
  const base =
    'font-mono text-xs uppercase tracking-[0.1em] px-3 py-2 rounded-sm ' +
    'transition-colors duration-[120ms] cursor-pointer disabled:cursor-not-allowed ' +
    'disabled:opacity-40'
  const look =
    variant === 'primary'
      ? 'bg-accent text-ground hover:bg-accent/90 border border-accent'
      : 'bg-transparent text-ink-1 border border-rule hover:text-ink-0 hover:border-ink-3'
  return <button className={`${base} ${look} ${className}`} {...rest} />
}

/**
 * Inline chip — the legend and toggle pattern. A row of these sits directly
 * above a chart, never in a settings panel (CLAUDE.md §5).
 */
export function Chip({
  children,
  pressed,
  onClick,
}: {
  children: ReactNode
  pressed?: boolean
  onClick?: () => void
}) {
  const interactive = typeof onClick === 'function'
  const look = pressed
    ? 'text-ink-0 border-ink-3'
    : 'text-ink-2 border-rule hover:text-ink-1'
  const cls =
    'font-mono text-label uppercase tracking-[0.12em] px-2 py-1 rounded-sm ' +
    `border bg-transparent transition-colors duration-[120ms] ${look}`

  if (!interactive) return <span className={cls}>{children}</span>
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={cls}>
      {children}
    </button>
  )
}

/**
 * The editorial stat block: one huge figure, dim label beneath. Used on Records
 * and the monthly report, where the grammar pushes furthest (CLAUDE.md §5).
 */
export function StatFigure({
  value,
  label,
  unit,
  delta,
}: {
  value: string
  label: string
  unit?: string
  delta?: { text: string; direction: 'up' | 'down' | 'flat' }
}) {
  const deltaColor =
    delta?.direction === 'up'
      ? 'text-cat-2'
      : delta?.direction === 'down'
        ? 'text-accent'
        : 'text-ink-2'
  return (
    // min-w-0: a grid item defaults to min-width:auto, so a long figure pushes
    // its own track wider instead of being allowed to shrink.
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-fig leading-none tracking-tight text-ink-0">
        {value}
        {unit ? (
          <span className="ml-1 align-baseline text-[0.35em] tracking-[0.1em] text-ink-2">
            {unit}
          </span>
        ) : null}
      </span>
      <Label>{label}</Label>
      {delta ? (
        <span className={`font-mono text-xs tracking-[0.04em] ${deltaColor}`}>
          {delta.text}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Category marker — a hairline dot plus a mono label, never a filled pill.
 * A pill would put a block of colour beside a number and compete with the data.
 */
export function CategoryTag({
  token,
  children,
}: {
  token: string | null | undefined
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-label uppercase tracking-[0.12em] whitespace-nowrap text-ink-2">
      <i
        aria-hidden="true"
        className="block size-1.5 shrink-0 rounded-[1px]"
        style={{ background: categoryVar(token) }}
      />
      {children}
    </span>
  )
}

/** Set-type and PR badges. Structural types stay neutral; only a record earns the accent. */
export function Badge({ children, pr = false }: { children: ReactNode; pr?: boolean }) {
  const look = pr ? 'border-accent text-accent' : 'border-rule text-ink-2'
  return (
    <span
      className={`font-mono text-label uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm border ${look}`}
    >
      {children}
    </span>
  )
}
