import { Link, useParams } from 'react-router-dom'
import { Badge, CategoryTag, Label } from '../../components/ui'
import { StateBlock } from '../../components/StateBlock'
import { formatDay, formatDuration, formatTime } from '../../lib/dates'
import { colorTokenFor } from '../../lib/config'
import { workoutSetCount, workoutVolumeKg } from '../../lib/normalize'
import { formatSetWeight, formatVolume } from '../../lib/units'
import { useProfile } from '../../data/useProfile'
import { useCanWrite } from '../../auth/hooks'
import {
  achievementsBySet,
  computePRAchievements,
  metricLabel,
  type PRMetric,
} from '../../utils/prEngine'
import type { ExerciseEntry, Units, Workout, WorkoutSet } from '../../types'

/**
 * One workout in full: every exercise, every set with its type badge, notes,
 * heart rate, people, place (§4).
 *
 * PR badges come from the records engine (§6.2), computed on every render and
 * never stored. They were deferred in Phase 4 until the engine existed.
 */
export function WorkoutDetail() {
  const { id } = useParams<{ id: string }>()
  const state = useProfile()
  const canWrite = useCanWrite()

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4 py-10" aria-busy="true">
        <span className="h-3 w-32 rounded-sm bg-rule" />
        <span className="h-6 w-2/3 rounded-sm bg-rule" />
        <span className="sr-only">Loading workout…</span>
      </div>
    )
  }

  if (state.status === 'denied') {
    return (
      <Wrap>
        <StateBlock
          label="No access"
          title="This workout isn’t readable."
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
  const workout = profile.workouts.find((w) => w.id === id)

  if (!workout) {
    return (
      <Wrap>
        <StateBlock
          label="Not found"
          title="No workout with that id."
          body="It may have been deleted, or the link may be from a different profile."
        />
      </Wrap>
    )
  }

  const { units, bodyweightKg } = profile.settings

  // Backfilled from Phase 4, where these were deliberately deferred until the
  // records engine existed rather than shown as placeholders.
  const badges = achievementsBySet(computePRAchievements(profile.workouts), workout.id)
  const volume = workoutVolumeKg(workout, bodyweightKg)
  const hasBodyweightSets = workout.exercises.some((e) =>
    e.sets.some((s) => s.weight.kind === 'bodyweight'),
  )

  return (
    <Wrap>
      <Header
        workout={workout}
        colorToken={colorTokenFor(config.workoutCategories, workout.category)}
      />

      {/* Hidden entirely without write access — never rendered-then-rejected
          (CLAUDE.md §2). A guest sees no Edit link at all. */}
      {canWrite ? (
        <div>
          <Link
            to={`/workouts/${workout.id}/edit`}
            className="font-mono text-label tracking-[0.12em] text-accent uppercase no-underline"
          >
            Edit workout
          </Link>
        </div>
      ) : null}

      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-6 sm:grid-cols-4">
        <Stat
          label="Volume"
          value={volume > 0 ? formatVolume(volume, units) : '—'}
          unit={units}
        />
        <Stat label="Sets" value={String(workoutSetCount(workout))} />
        <Stat label="Duration" value={formatDuration(workout.durationMinutes)} />
        <Stat
          label="Avg heart rate"
          value={workout.avgHeartRate === null ? '—' : String(workout.avgHeartRate)}
          unit={workout.avgHeartRate === null ? undefined : 'bpm'}
        />
      </dl>

      {hasBodyweightSets && bodyweightKg === null ? (
        // Honest rather than silently wrong: bodyweight sets are excluded from
        // volume until a bodyweight is configured (D-7).
        <p className="m-0 border-l-2 border-accent py-1 pl-3 text-sm text-ink-1">
          This session has bodyweight sets. They&rsquo;re excluded from the volume above
          until a bodyweight is set in Settings.
        </p>
      ) : null}

      {workout.description ? (
        <p className="m-0 max-w-prose text-ink-1">{workout.description}</p>
      ) : null}

      {workout.exercises.length === 0 ? (
        <StateBlock
          label="No exercises"
          title="Nothing was logged in this session."
          body="The workout exists but has no exercise entries."
        />
      ) : (
        <ol className="flex list-none flex-col gap-8 p-0">
          {workout.exercises.map((entry, i) => (
            <ExerciseBlock
              key={`${entry.exerciseTitle}-${i}`}
              entry={entry}
              units={units}
              badges={badges}
            />
          ))}
        </ol>
      )}
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-6 py-10">
      <Link
        to="/workouts"
        className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-1"
      >
        ← Workouts
      </Link>
      {children}
    </article>
  )
}

function Header({ workout, colorToken }: { workout: Workout; colorToken: string }) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink-0">
        {workout.title}
      </h1>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <CategoryTag token={colorToken}>
          {workout.category ?? 'Uncategorized'}
        </CategoryTag>
        <span className="font-mono text-xs text-ink-2">
          {formatDay(workout.startTime)} · {formatTime(workout.startTime)}
        </span>
        {workout.place ? (
          <span className="font-mono text-xs text-ink-2">{workout.place}</span>
        ) : null}
        {workout.people.length > 0 ? (
          <span className="font-mono text-xs text-ink-2">
            with {workout.people.join(', ')}
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
  // `| undefined` is required under exactOptionalPropertyTypes: callers pass
  // the prop explicitly as undefined when a value is missing.
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

function ExerciseBlock({
  entry,
  units,
  badges,
}: {
  entry: ExerciseEntry
  units: Units
  badges: Map<string, PRMetric[]>
}) {
  return (
    <li className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-semibold text-ink-0">{entry.exerciseTitle}</h2>
        {entry.notes ? (
          <p className="m-0 max-w-prose text-sm text-ink-2">{entry.notes}</p>
        ) : null}
      </div>

      {/* A real table: these are rows of numbers that must align on the decimal,
          and a screen reader should be able to read them as a table. */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th className="w-8">#</Th>
            <Th>Weight</Th>
            <Th>Reps</Th>
            <Th>Time</Th>
            <Th className="text-right">Type</Th>
          </tr>
        </thead>
        <tbody>
          {entry.sets.map((set, i) => (
            <SetRow
              key={i}
              set={set}
              units={units}
              prs={badges.get(`${entry.exerciseTitle}::${set.setIndex}`) ?? []}
            />
          ))}
        </tbody>
      </table>
    </li>
  )
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      scope="col"
      className={`border-b border-rule pb-1 text-left font-mono text-label font-normal tracking-[0.12em] text-ink-2 uppercase ${className}`}
    >
      {children}
    </th>
  )
}

function SetRow({
  set,
  units,
  prs,
}: {
  set: WorkoutSet
  units: Units
  prs: PRMetric[]
}) {
  // A warmup or feeder set is scaffolding, not the work — dim it so the working
  // sets carry the eye.
  const dim = set.setType === 'warmup' || set.setType === 'feeder'
  const tone = dim ? 'text-ink-2' : 'text-ink-0'

  return (
    <>
      <tr className={prs.length > 0 ? '' : 'border-b border-rule'}>
        <td className="py-2 font-mono text-xs text-ink-2">{set.setIndex + 1}</td>
        <td className={`py-2 font-mono text-sm ${tone}`}>
          {formatSetWeight(set.weight, units)}
        </td>
        <td className={`py-2 font-mono text-sm ${tone}`}>{set.reps ?? '—'}</td>
        <td className="py-2 font-mono text-sm text-ink-2">
          {set.durationSeconds === null ? '—' : `${set.durationSeconds}s`}
        </td>
        <td className="py-2 text-right">
          {set.setType && set.setType !== 'normal' ? (
            <Badge>{set.setType}</Badge>
          ) : (
            <span className="font-mono text-label text-ink-2">—</span>
          )}
        </td>
      </tr>

      {/* PR badges get their own full-width row rather than sharing the Type
          cell: three badges at 375px squeezed the numeric columns until the
          headers collided. */}
      {prs.length > 0 ? (
        <tr className="border-b border-rule">
          <td />
          <td colSpan={4} className="pb-2">
            <span className="flex flex-wrap gap-1">
              {prs.map((metric) => (
                <Badge key={metric} pr>
                  {metricLabel(metric)}
                </Badge>
              ))}
            </span>
          </td>
        </tr>
      ) : null}
    </>
  )
}
