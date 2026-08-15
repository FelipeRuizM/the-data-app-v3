import { Link, useParams } from 'react-router-dom'
import { CategoryTag, Label } from '../../components/ui'
import { StateBlock } from '../../components/StateBlock'
import { formatDay, formatDuration, formatPace, formatTime } from '../../lib/dates'
import { colorTokenFor } from '../../lib/config'
import { parseStoredPace } from '../../lib/normalize'
import { formatDistance } from '../../lib/units'
import { useProfile } from '../../data/useProfile'
import { useCanWrite } from '../../auth/hooks'
import type { Run } from '../../types'

/**
 * One run in full: derived pace, elevation, difficulty, steps, calories,
 * shoes, watch (§4, D-16).
 *
 * No splits. The schema has totals only — no per-kilometre or GPS data — and
 * faking them from average pace would be one number repeated (D-16). PR
 * badges are absent for the same reason as workouts: the records engine is
 * Phase 8.
 */
export function RunDetail() {
  const { id } = useParams<{ id: string }>()
  const state = useProfile()
  const canWrite = useCanWrite()

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4 py-10" aria-busy="true">
        <span className="h-3 w-32 rounded-sm bg-rule" />
        <span className="h-6 w-2/3 rounded-sm bg-rule" />
        <span className="sr-only">Loading run…</span>
      </div>
    )
  }

  if (state.status === 'denied') {
    return (
      <Wrap>
        <StateBlock
          label="No access"
          title="This run isn’t readable."
          body="The database rules rejected the read."
        />
      </Wrap>
    )
  }

  if (state.status === 'error') {
    return (
      <Wrap>
        <StateBlock
          label="Couldn’t load"
          title="Something went wrong."
          body={state.message}
        />
      </Wrap>
    )
  }

  const { profile, config } = state.data
  const run = profile.runs.find((r) => r.id === id)

  if (!run) {
    return (
      <Wrap>
        <StateBlock
          label="Not found"
          title="No run with that id."
          body="It may have been deleted, or the link may be from a different profile."
        />
      </Wrap>
    )
  }

  return (
    <Wrap>
      <Header run={run} colorToken={colorTokenFor(config.runTypes, run.type)} />

      {/* Hidden entirely without write access — never rendered-then-rejected
          (CLAUDE.md §2). */}
      {canWrite ? (
        <div>
          <Link
            to={`/runs/${run.id}/edit`}
            className="font-mono text-label tracking-[0.12em] text-accent uppercase no-underline"
          >
            Edit run
          </Link>
        </div>
      ) : null}

      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-6 sm:grid-cols-4">
        <Stat label="Distance" value={formatDistance(run.distanceKm)} />
        <Stat label="Pace" value={formatPace(run.paceSecPerKm)} unit="/km" />
        <Stat label="Duration" value={formatDuration(run.durationMinutes)} />
        <Stat
          label="Avg heart rate"
          value={run.avgHeartRate === null ? '—' : String(run.avgHeartRate)}
          unit={run.avgHeartRate === null ? undefined : 'bpm'}
        />
        <Stat
          label="Difficulty"
          value={run.difficulty === null ? '—' : String(run.difficulty)}
          unit={run.difficulty === null ? undefined : '/10'}
        />
        <Stat
          label="Calories"
          value={run.calories === null ? '—' : String(run.calories)}
          unit={run.calories === null ? undefined : 'kcal'}
        />
        <Stat label="Shoes" value={run.shoes ?? '—'} />
        <Stat label="Watch" value={run.watch ?? '—'} />
      </dl>

      <PaceDisagreementNote run={run} />

      {run.description ? (
        <p className="m-0 max-w-prose text-ink-1">{run.description}</p>
      ) : null}
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-6 py-10">
      <Link
        to="/runs"
        className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-1"
      >
        ← Runs
      </Link>
      {children}
    </article>
  )
}

function Header({ run, colorToken }: { run: Run; colorToken: string }) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink-0">
        {run.title}
      </h1>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <CategoryTag token={colorToken}>{run.type ?? 'Untyped'}</CategoryTag>
        <span className="font-mono text-xs text-ink-2">
          {formatDay(run.startTime)} · {formatTime(run.startTime)}
        </span>
        {run.place ? (
          <span className="font-mono text-xs text-ink-2">{run.place}</span>
        ) : null}
        {run.people.length > 0 ? (
          <span className="font-mono text-xs text-ink-2">
            with {run.people.join(', ')}
          </span>
        ) : null}
      </div>
    </header>
  )
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit?: string | undefined
}) {
  return (
    <div className="flex flex-col gap-1">
      <dd className="m-0 font-mono text-xl leading-none tracking-tight text-ink-0">
        {value}
        {unit ? <span className="ml-1 text-xs text-ink-2">{unit}</span> : null}
      </dd>
      <dt>
        <Label>{label}</Label>
      </dt>
    </div>
  )
}

/**
 * The one run in twelve whose stored pace disagrees with the derived value is
 * concrete proof that the derived value has to be the truth (§3.2). Surfacing
 * the disagreement — rather than silently discarding the stored string — is
 * what makes that trust legible instead of just asserted.
 */
function PaceDisagreementNote({ run }: { run: Run }) {
  const stored = parseStoredPace(run.storedPace)
  if (stored === null || run.paceSecPerKm === null) return null
  if (Math.abs(stored - run.paceSecPerKm) <= 3) return null

  return (
    <p className="m-0 border-l-2 border-accent py-1 pl-3 text-sm text-ink-1">
      The pace shown above is calculated from distance and duration. The originally
      logged value (<span className="font-mono">{run.storedPace}</span>) disagreed, so
      it wasn&rsquo;t used.
    </p>
  )
}
