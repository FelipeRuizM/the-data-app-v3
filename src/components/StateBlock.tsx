import type { ReactNode } from 'react'
import { Label } from './ui'

/**
 * The one empty / denied / error block, shared by every data view.
 *
 * Empty is designed, never a bare "No data" (§9) — and because all three states
 * come from here, "nothing logged", "nothing matches" and "not allowed" are
 * forced to read differently rather than collapsing into one shrug.
 */
export function StateBlock({
  label,
  title,
  body,
  action,
}: {
  label: string
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-rule py-1 pl-4">
      <Label>{label}</Label>
      <p className="m-0 text-ink-0">{title}</p>
      <p className="m-0 max-w-prose text-sm text-ink-2">{body}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
