import { useState } from 'react'
import { Label } from './ui'

/**
 * The start timestamp, collapsed behind a link (D-47).
 *
 * Both log forms default it to now, which is right for the session you have
 * just finished — the overwhelming majority of logs. It stays reachable rather
 * than being removed outright, because a workout you forgot to log yesterday
 * has to remain loggable and a mistyped date has to remain fixable; without a
 * control there is no way back from either.
 *
 * `datetime-local` is the one input here that isn't a pick from a known set,
 * and can't be: a date genuinely is an open value.
 */
export function StartTimeDisclosure({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-ink-2 uppercase hover:text-ink-0"
        >
          Change date &amp; time
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <Label>Started</Label>
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3"
        />
      </label>
    </div>
  )
}
