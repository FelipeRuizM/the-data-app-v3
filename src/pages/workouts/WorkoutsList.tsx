import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CategoryTag, Label } from '../../components/ui'
import { formatDayShort, formatDuration } from '../../lib/dates'
import { colorTokenFor } from '../../lib/config'
import {
  EMPTY_FILTERS,
  filterWorkouts,
  hasActiveFilters,
  workoutFilterOptions,
  type WorkoutFilters,
} from '../../lib/filters'
import { workoutSetCount, workoutVolumeKg } from '../../lib/normalize'
import { formatVolume } from '../../lib/units'
import { useProfile } from '../../data/useProfile'
import { FilterBar } from '../../components/FilterBar'
import { StateBlock } from '../../components/StateBlock'
import type { Units, Workout } from '../../types'
import { UNCATEGORIZED } from '../../lib/filters'

/** Stable empty reference so the useMemos below don't recompute every render. */
const NO_WORKOUTS: Workout[] = []

/**
 * Browse workouts. Each row is scannable WITHOUT opening it: date, title,
 * category, volume, duration, heart rate (§4).
 *
 * Designed at 375px first — the row is a two-line grid on a phone and simply
 * has more room on a desktop, rather than being a table that collapses.
 */
export function WorkoutsList() {
  const state = useProfile()
  const [filters, setFilters] = useState<WorkoutFilters>(EMPTY_FILTERS)

  const ready = state.status === 'ready' ? state.data : null
  const workouts = ready?.profile.workouts ?? NO_WORKOUTS
  const options = useMemo(() => workoutFilterOptions(workouts), [workouts])
  const visible = useMemo(() => filterWorkouts(workouts, filters), [workouts, filters])

  if (state.status === 'loading') {
    return (
      <Page>
        <ul className="flex list-none flex-col p-0" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="border-b border-rule py-5" aria-hidden="true">
              <span className="block h-3 w-2/3 rounded-sm bg-rule" />
            </li>
          ))}
          <li className="sr-only">Loading workouts…</li>
        </ul>
      </Page>
    )
  }

  if (state.status === 'denied') {
    return (
      <Page>
        <StateBlock
          label="No access"
          title="These workouts aren’t readable."
          body="The database rules rejected the read. If you were just given access, sign out and back in so the session picks it up."
        />
      </Page>
    )
  }

  if (state.status === 'error') {
    return (
      <Page>
        <StateBlock
          label="Couldn’t load"
          title="Something went wrong fetching these workouts."
          body={state.message}
        />
      </Page>
    )
  }

  const { profile, config } = state.data
  const colorFor = (category: string | null) =>
    colorTokenFor(config.workoutCategories, category)

  if (workouts.length === 0) {
    return (
      <Page>
        <StateBlock
          label="Nothing here yet"
          title="No workouts logged."
          body="Once a workout is logged it appears here, newest first, with filters for category, place, person and date."
        />
      </Page>
    )
  }

  return (
    <Page>
      <FilterBar
        tagLabel="Category"
        tagOptions={options.categories}
        activeTag={filters.category}
        onTagChange={(v) => setFilters({ ...filters, category: v })}
        colorForTag={colorFor}
        noneTag={
          options.hasUncategorized
            ? { sentinel: UNCATEGORIZED, label: 'Uncategorized' }
            : undefined
        }
        places={options.places}
        activePlace={filters.place}
        onPlaceChange={(v) => setFilters({ ...filters, place: v })}
        people={options.people}
        activePerson={filters.person}
        onPersonChange={(v) => setFilters({ ...filters, person: v })}
        from={filters.from}
        to={filters.to}
        onFromChange={(d) => setFilters({ ...filters, from: d })}
        onToChange={(d) => setFilters({ ...filters, to: d })}
        resultCount={visible.length}
        totalCount={workouts.length}
        countNoun="workout"
        active={hasActiveFilters(filters)}
        onClear={() => setFilters(EMPTY_FILTERS)}
      />

      {visible.length === 0 ? (
        <StateBlock
          label="No matches"
          title="No workout matches these filters."
          body="Every workout is still there — the current combination just doesn’t select any of them."
          action={
            hasActiveFilters(filters) ? (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase"
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <ul className="flex list-none flex-col p-0">
          {visible.map((w) => (
            <WorkoutRow
              key={w.id}
              workout={w}
              colorToken={colorFor(w.category)}
              bodyweightKg={profile.settings.bodyweightKg}
              units={profile.settings.units}
            />
          ))}
        </ul>
      )}
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 py-10">
      <Label as="h1">Workouts</Label>
      {children}
    </div>
  )
}

function WorkoutRow({
  workout,
  colorToken,
  bodyweightKg,
  units,
}: {
  workout: Workout
  colorToken: string
  bodyweightKg: number | null
  units: Units
}) {
  const volume = workoutVolumeKg(workout, bodyweightKg)
  const sets = workoutSetCount(workout)

  return (
    <li className="border-b border-rule">
      <Link
        to={`/workouts/${workout.id}`}
        className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1.5 py-4 no-underline"
      >
        <span className="min-w-0 truncate text-ink-0">{workout.title}</span>
        <span className="font-mono text-xs whitespace-nowrap text-ink-3">
          {formatDayShort(workout.startTime)}
        </span>

        <span className="col-span-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <CategoryTag token={colorToken}>
            {workout.category ?? 'Uncategorized'}
          </CategoryTag>
          <Metric value={volume > 0 ? formatVolume(volume, units) : '—'} unit={units} />
          <Metric value={String(sets)} unit="sets" />
          <Metric value={formatDuration(workout.durationMinutes)} />
          <Metric
            value={workout.avgHeartRate === null ? '—' : String(workout.avgHeartRate)}
            unit="bpm"
          />
        </span>
      </Link>
    </li>
  )
}

function Metric({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="font-mono text-xs text-ink-1">
      {value}
      {unit ? <span className="ml-1 text-ink-3">{unit}</span> : null}
    </span>
  )
}
