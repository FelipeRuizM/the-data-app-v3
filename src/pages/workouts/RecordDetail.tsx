import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Label } from '../../components/ui'
import { StateBlock } from '../../components/StateBlock'
import {
  ProgressionChart,
  type ProgressionPoint,
} from '../../components/charts/ProgressionChart'
import { useProfile } from '../../data/useProfile'
import { formatDay, formatDayShort } from '../../lib/dates'
import { formatVolume, formatWeight } from '../../lib/units'
import {
  calculatePRs,
  computePRAchievements,
  epley1RM,
  isExcludedSet,
  metricLabel,
} from '../../utils/prEngine'
import type { Workout } from '../../types'

/**
 * One exercise over time (§6.3): weight progression, estimated 1RM curve,
 * volume per session, and every PR event marked.
 *
 * Note the two different volumes on this page, deliberately named apart:
 * "Max set volume" is the best SINGLE set (§6.1's maxVolume), while the chart
 * plots the session TOTAL. A session can top the chart without any one set
 * beating the record — calling both "volume" would make that look like a bug.
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
    const prWorkoutIds = new Set(achievements.map((a) => a.workoutId))

    // One point per session, using that session's best set per metric.
    const sessions = [...profile.workouts]
      .filter((w) => w.exercises.some((e) => e.exerciseTitle === title))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

    const bestPerSession = sessions.map((w) => ({
      workout: w,
      ...sessionBest(w, title),
      isPR: prWorkoutIds.has(w.id),
    }))

    return {
      pr,
      achievements,
      sessions: bestPerSession,
      units: profile.settings.units,
      repBased: config.repBasedExercises.includes(title),
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

  const { pr, sessions, units, repBased, achievements } = data

  const weightPoints: ProgressionPoint[] = sessions
    .filter((s) => s.topWeight !== null)
    .map((s) => ({
      date: s.workout.startTime,
      value: s.topWeight!,
      isPR: s.isPR,
      label: formatDayShort(s.workout.startTime),
    }))

  const oneRMPoints: ProgressionPoint[] = sessions
    .filter((s) => s.best1RM !== null)
    .map((s) => ({
      date: s.workout.startTime,
      value: s.best1RM!,
      isPR: s.isPR,
      label: formatDayShort(s.workout.startTime),
    }))

  const volumePoints: ProgressionPoint[] = sessions
    .filter((s) => s.volume > 0)
    .map((s) => ({
      date: s.workout.startTime,
      value: s.volume,
      isPR: s.isPR,
      label: formatDayShort(s.workout.startTime),
    }))

  const repsPoints: ProgressionPoint[] = sessions
    .filter((s) => s.topReps !== null)
    .map((s) => ({
      date: s.workout.startTime,
      value: s.topReps!,
      isPR: s.isPR,
      label: formatDayShort(s.workout.startTime),
    }))

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

      <div className="flex flex-col gap-10">
        {repBased && repsPoints.length > 1 ? (
          <ProgressionChart
            points={repsPoints}
            caption="Top reps per session"
            formatValue={(v) => `${v} reps`}
          />
        ) : null}

        {weightPoints.length > 1 ? (
          <ProgressionChart
            points={weightPoints}
            caption="Heaviest set per session"
            formatValue={(v) => formatWeight(v, units)}
          />
        ) : null}

        {oneRMPoints.length > 1 ? (
          <ProgressionChart
            points={oneRMPoints}
            caption="Estimated 1RM per session (Epley)"
            formatValue={(v) => formatWeight(v, units)}
          />
        ) : null}

        {volumePoints.length > 1 ? (
          <ProgressionChart
            points={volumePoints}
            caption="Total volume per session"
            formatValue={(v) => `${formatVolume(v, units)} ${units}`}
          />
        ) : null}
      </div>

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
                    <span className="text-ink-3">
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

/** Best values for one exercise within one session. */
function sessionBest(workout: Workout, title: string) {
  let topWeight: number | null = null
  let topReps: number | null = null
  let best1RM: number | null = null
  let volume = 0

  for (const entry of workout.exercises) {
    if (entry.exerciseTitle !== title) continue
    for (const set of entry.sets) {
      if (isExcludedSet(set)) continue

      const kg =
        set.weight.kind === 'loaded'
          ? set.weight.kg
          : set.weight.kind === 'zero'
            ? 0
            : null

      if (kg !== null && (topWeight === null || kg > topWeight)) topWeight = kg
      if (set.reps !== null && (topReps === null || set.reps > topReps))
        topReps = set.reps
      if (kg !== null && set.reps !== null) {
        volume += kg * set.reps
        const est = epley1RM(kg, set.reps)
        if (best1RM === null || est > best1RM) best1RM = est
      }
    }
  }

  return { topWeight, topReps, best1RM, volume }
}

function Wrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-8 py-10">
      <Link
        to="/workouts/records"
        className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase no-underline hover:text-ink-1"
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
      {sub ? <span className="font-mono text-xs text-ink-3">{sub}</span> : null}
    </div>
  )
}
