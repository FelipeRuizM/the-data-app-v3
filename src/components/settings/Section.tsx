import type { ReactNode } from 'react'
import { Label } from '../ui'
import type { SaveStatus } from './useSave'

/**
 * One Settings section: a mono label, an explanatory line, the controls.
 *
 * Sections are separated by whitespace and a hairline rule — no card layer, no
 * borders as decoration (§5). The rule sits above the heading so the last
 * section doesn't end on a dangling line.
 */
export function Section({
  title,
  description,
  children,
  first = false,
}: {
  title: string
  description?: string | undefined
  children: ReactNode
  first?: boolean
}) {
  return (
    <section
      className={`flex flex-col gap-4 ${first ? '' : 'border-t border-rule pt-10'}`}
    >
      <div className="flex flex-col gap-1">
        <Label as="h2">{title}</Label>
        {description ? (
          <p className="m-0 max-w-prose text-sm text-ink-2">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Save feedback, in the same small mono voice as every other label.
 *
 * "Saved" is transient; an error is not — see `useSave`.
 */
export function SaveNote({ status, dirty }: { status: SaveStatus; dirty?: boolean }) {
  if (status.state === 'error') {
    return (
      <span role="alert" className="font-mono text-xs text-accent">
        {status.message}
      </span>
    )
  }
  if (status.state === 'saving') {
    return (
      <span className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
        Saving…
      </span>
    )
  }
  if (status.state === 'saved') {
    return (
      <span
        role="status"
        className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase"
      >
        Saved
      </span>
    )
  }
  if (dirty) {
    return (
      <span className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
        Unsaved changes
      </span>
    )
  }
  return null
}
