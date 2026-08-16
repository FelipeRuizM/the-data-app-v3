import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Label } from '../../components/ui'
import { StateBlock } from '../../components/StateBlock'
import { SetBySetChart } from '../../components/charts/SetBySetChart'
import { useProfile } from '../../data/useProfile'
import { formatDay } from '../../lib/dates'
import { formatVolume, formatWeight } from '../../lib/units'
import { calculatePRs, computePRAchievements, metricLabel } from '../../utils/prEngine'
import { setSeriesFor } from '../../utils/setSeries'

/**
 * One exercise over time (§6.3), as **one interactive plot of every set** —
 * reps, weight and volume together, each toggleable (D-63).
 *
 * This replaces four separate per-session charts. Those showed each session's
 * best set and nothing else, so a 5×5 and one heavy single looked identical and
 * every back-off set was invisible. The set log is what actually happened, and
 * it is also where the PR marks belong (§6.2) — a record is broken by a set,
 * not by a session.
 */
export function RecordDetail() {
  const { exercise } = useParams<{ exercise: string }>()
  const title = exercise ? decodeURIComponent(exercise) : ''
  const state = useProfile()

  const data = useMemo(() => {
    if (state.status !== 'ready' || !title) return null
    const { profile, config } = state.data

    const prs = calculatePRs(profile.workouts, config.repBasedExercises)
    const pr = prs.get(title)
    if (!pr) return { pr: null } as const

    const achievements = computePRAchievements(profile.workouts).filter(
      (a) => a.exerciseTitle === title,
    )

    return {
      pr,
      achievements,
      points: setSeriesFor(
        profile.workouts,
        title,
        achievements,
        profile.settings.bodyweightKg,
      ),
      units: profile.settings.units,
    } as const
  }, [state, title])

  if (state.status === 'loading') {
    return (
      <Wrap title={title}>
        <div className="h-24 w-full rounded-sm bg-rule" aria-busy="true" />
      </Wrap>
    )
  }

  if (state.status === 'denied' || state.status === 'error') {
    return (
      <Wrap title={title}>
        <StateBlock
          label={state.status === 'denied' ? 'No access' : 'Couldn’t load'}
          title={
            state.status === 'denied' ? 'This isn’t readable.' : 'Something went wrong.'
          }
          body={
            state.status === 'error'
              ? state.message
              : 'The database rules rejected the read.'
          }
        />
      </Wrap>
    )
  }

  if (!data || !data.pr) {
    return (
      <Wrap title={title}>
        <StateBlock
          label="Not found"
          title="No records for that exercise."
          body="Either it has never been logged, or every set was excluded."
        />
      </Wrap>
    )
  }

  const { pr, points, units, achievements } = data

  return (
    <Wrap title={title}>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-6 sm:grid-cols-4">
        <Stat
          label="Max weight"
          value={
            pr.maxWeight === null
              ? '—'
              : formatWeight(pr.maxWeight.value, units, { withUnit: false })
          }
          unit={pr.maxWeight === null ? undefined : units}
          sub={pr.maxWeight ? formatDay(pr.maxWeight.date) : undefined}
        />
        <Stat
          label="Max reps"
          value={pr.maxReps === null ? '—' : String(pr.maxReps.value)}
          sub={pr.maxReps ? formatDay(pr.maxReps.date) : undefined}
        />
        <Stat
          label="Max set volume"
          value={pr.maxVolume === null ? '—' : formatVolume(pr.maxVolume.value, units)}
          unit={pr.maxVolume === null ? undefined : units}
          sub={pr.maxVolume ? formatDay(pr.maxVolume.date) : undefined}
        />
        <Stat
          label="Sessions"
          value={String(pr.sessionCount)}
          sub={`${pr.setCount} sets`}
        />
      </dl>

      {pr.maxWeight === null ? (
        <p className="m-0 border-l-2 border-accent py-1 pl-3 text-sm text-ink-1">
          Every logged set for this exercise is bodyweight, so weight and volume records
          are undefined rather than zero. Reps are the meaningful measure here.
        </p>
      ) : null}

      <SetBySetChart points={points} units={units} />

      <section className="flex flex-col gap-3">
        <Label as="h2">Records broken</Label>
        {achievements.length === 0 ? (
          <p className="m-0 text-sm text-ink-2">
            None yet. The first session sets the baseline silently — a record has to be
            broken, not established.
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-0 p-0">
            {[...achievements]
              .sort((a, b) => b.date.getTime() - a.date.getTime())
              .map((a, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule py-3"
                >
                  <Badge pr>{metricLabel(a.metric)}</Badge>
                  <Link
                    to={`/workouts/${a.workoutId}`}
                    className="font-mono text-xs text-ink-2 no-underline hover:text-ink-0"
                  >
                    {formatDay(a.date)}
                  </Link>
                  <span className="font-mono text-xs text-ink-1">
                    {a.metric === 'volume' || a.metric === 'oneRM'
                      ? formatVolume(a.value, units)
                      : formatWeight(a.value, units, { withUnit: false })}
                    <span className="text-ink-2">
                      {' '}
                      from {Math.round(a.previous * 10) / 10}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </Wrap>
  )
}

function Wrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-8 py-10">
      <Link
        to="/workouts/records"
        className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-1"
      >
        ← Records
      </Link>
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink-0">{title}</h1>
      {children}
    </article>
  )
}

function Stat({
  label,
  value,
  unit,
  sub,
}: {
  label: string
  value: string
  unit?: string | undefined
  sub?: string | undefined
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
      {sub ? <span className="font-mono text-xs text-ink-2">{sub}</span> : null}
    </div>
  )
}
