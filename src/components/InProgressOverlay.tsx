import { useState } from 'react'
import { addMonths, startOfMonth } from 'date-fns'
import { Button, Label } from './ui'
import { formatDay } from '../lib/dates'
import { isInProgress, rememberUnlocked, wasUnlocked } from '../lib/monthGuard'

/**
 * The in-progress-month guard (§7 Access rule).
 *
 * The current month sits behind a "still in progress" overlay by default,
 * dismissible per-visit. Past months always open.
 *
 * The aggregation runs REGARDLESS — this only gates the display, so unlocking
 * is instant and nothing is recomputed on dismissal.
 */
export function InProgressGuard({
  month,
  children,
}: {
  month: Date
  children: React.ReactNode
}) {
  const locked = isInProgress(month)
  const [unlocked, setUnlocked] = useState(() => (locked ? wasUnlocked(month) : true))

  if (!locked || unlocked) return <>{children}</>

  const unlocksOn = startOfMonth(addMonths(month, 1))

  return (
    <div className="flex flex-col gap-4 border-l-2 border-accent py-1 pl-4">
      <Label>Still in progress</Label>
      <p className="m-0 text-ink-0">This month isn&rsquo;t finished yet.</p>
      <p className="m-0 max-w-prose text-sm text-ink-2">
        The numbers will keep moving until it ends, and the comparison against last
        month isn&rsquo;t like-for-like yet. It unlocks on {formatDay(unlocksOn)}.
      </p>
      <div>
        <Button
          onClick={() => {
            rememberUnlocked(month)
            setUnlocked(true)
          }}
        >
          Unlock anyway
        </Button>
      </div>
    </div>
  )
}
