import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Label } from '../../components/ui'
import { StateBlock } from '../../components/StateBlock'
import { useProfile } from '../../data/useProfile'
import { formatDay, formatDuration, formatPace } from '../../lib/dates'
import { formatDistance } from '../../lib/units'
import { calculateRunRecords, type RunRecord } from '../../utils/runRecords'

/**
 * Run personal bests (D-10) — one per metric, no badge engine. §6 is entirely
 * set-shaped and has no run analogue, so this is deliberately much thinner
 * than the workout Records page.
 */
export function RunRecords() {
  const state = useProfile()

  const records = useMemo(
    () =>
      state.status === 'ready' ? calculateRunRecords(state.data.profile.runs) : [],
    [state],
  )

  if (state.status === 'loading') {
    return (
      <Page>
        <div className="h-24 w-full rounded-sm bg-rule" aria-busy="true" />
      </Page>
    )
  }

  if (state.status === 'denied' || state.status === 'error') {
    return (
      <Page>
        <StateBlock
          label={state.status === 'denied' ? 'No access' : 'Couldn’t load'}
          title={
            state.status === 'denied'
              ? 'These records aren’t readable.'
              : 'Something went wrong.'
          }
          body={
            state.status === 'error'
              ? state.message
              : 'The database rules rejected the read.'
          }
        />
      </Page>
    )
  }

  if (records.length === 0) {
    return (
      <Page>
        <StateBlock
          label="Nothing here yet"
          title="No run records yet."
          body="Personal bests are computed from your run history — log a run and they appear here automatically."
        />
      </Page>
    )
  }

  return (
    <Page>
      <ul className="flex list-none flex-col gap-0 p-0">
        {records.map((r) => (
          <li key={r.key} className="border-b border-rule">
            <Link
              to={`/runs/${r.runId}`}
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-5 no-underline"
            >
              <Label>{r.label}</Label>
              <span className="font-mono text-2xl tracking-tight whitespace-nowrap text-ink-0">
                {formatRecord(r)}
              </span>
              <span className="col-span-2 font-mono text-xs text-ink-2">
                {formatDay(r.date)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}

function formatRecord(r: RunRecord): string {
  switch (r.key) {
    case 'fastestPace':
      return `${formatPace(r.value)} /km`
    case 'longestDistance':
      return formatDistance(r.value)
    case 'longestDuration':
      return formatDuration(r.value / 60)
    case 'mostElevation':
      return `${Math.round(r.value)} m`
    case 'mostSteps':
      return r.value.toLocaleString('en-US')
  }
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <Label as="h1">Run records</Label>
        <p className="m-0 max-w-prose text-sm text-ink-2">
          One personal best per metric, computed from your full run history.
        </p>
      </div>
      {children}
    </div>
  )
}
