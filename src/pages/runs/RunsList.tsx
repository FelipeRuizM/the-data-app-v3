import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CategoryTag, Label } from '../../components/ui'
import { FilterBar } from '../../components/FilterBar'
import { StateBlock } from '../../components/StateBlock'
import { formatDayShort, formatDuration, formatPace } from '../../lib/dates'
import { colorTokenFor } from '../../lib/config'
import {
  EMPTY_RUN_FILTERS,
  UNTYPED,
  filterRuns,
  hasActiveRunFilters,
  runFilterOptions,
  type RunFilters,
} from '../../lib/filters'
import { formatDistance } from '../../lib/units'
import { useProfile } from '../../data/useProfile'
import type { Run } from '../../types'

/** Stable empty reference so the useMemos below don't recompute every render. */
const NO_RUNS: Run[] = []

/**
 * Browse runs. Each row is scannable WITHOUT opening it: date, title, type,
 * distance, duration (§4). Same pattern as Workouts — see WorkoutsList — with
 * a simpler row, since runs have no nested exercises/sets.
 */
export function RunsList() {
  const state = useProfile()
  const [filters, setFilters] = useState<RunFilters>(EMPTY_RUN_FILTERS)

  const ready = state.status === 'ready' ? state.data : null
  const runs = ready?.profile.runs ?? NO_RUNS
  const options = useMemo(() => runFilterOptions(runs), [runs])
  const visible = useMemo(() => filterRuns(runs, filters), [runs, filters])

  if (state.status === 'loading') {
    return (
      <Page>
        <ul className="flex list-none flex-col p-0" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="border-b border-rule py-5" aria-hidden="true">
              <span className="block h-3 w-2/3 rounded-sm bg-rule" />
            </li>
          ))}
          <li className="sr-only">Loading runs…</li>
        </ul>
      </Page>
    )
  }

  if (state.status === 'denied') {
    return (
      <Page>
        <StateBlock
          label="No access"
          title="These runs aren’t readable."
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
          title="Something went wrong fetching these runs."
          body={state.message}
        />
      </Page>
    )
  }

  const { config } = state.data
  const colorFor = (type: string) => colorTokenFor(config.runTypes, type)

  if (runs.length === 0) {
    return (
      <Page>
        <StateBlock
          label="Nothing here yet"
          title="No runs logged."
          body="Once a run is logged it appears here, newest first, with filters for type, place, person and date."
        />
      </Page>
    )
  }

  return (
    <Page>
      <FilterBar
        tagLabel="Type"
        tagOptions={options.types}
        activeTag={filters.type}
        onTagChange={(v) => setFilters({ ...filters, type: v })}
        colorForTag={colorFor}
        noneTag={
          options.hasUntyped ? { sentinel: UNTYPED, label: 'Untyped' } : undefined
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
        totalCount={runs.length}
        countNoun="run"
        active={hasActiveRunFilters(filters)}
        onClear={() => setFilters(EMPTY_RUN_FILTERS)}
      />

      {visible.length === 0 ? (
        <StateBlock
          label="No matches"
          title="No run matches these filters."
          body="Every run is still there — the current combination just doesn’t select any of them."
          action={
            hasActiveRunFilters(filters) ? (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_RUN_FILTERS)}
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase"
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <ul className="flex list-none flex-col p-0">
          {visible.map((r) => (
            <RunRow key={r.id} run={r} colorToken={colorFor(r.type ?? '')} />
          ))}
        </ul>
      )}
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 py-10">
      <Label as="h1">Runs</Label>
      {children}
    </div>
  )
}

function RunRow({ run, colorToken }: { run: Run; colorToken: string }) {
  return (
    <li className="border-b border-rule">
      <Link
        to={`/runs/${run.id}`}
        className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1.5 py-4 no-underline"
      >
        <span className="min-w-0 truncate text-ink-0">{run.title}</span>
        <span className="font-mono text-xs whitespace-nowrap text-ink-3">
          {formatDayShort(run.startTime)}
        </span>

        <span className="col-span-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <CategoryTag token={colorToken}>{run.type ?? 'Untyped'}</CategoryTag>
          <Metric value={formatDistance(run.distanceKm)} />
          <Metric value={formatPace(run.paceSecPerKm)} unit="/km" />
          <Metric value={formatDuration(run.durationMinutes)} />
          <Metric
            value={run.avgHeartRate === null ? '—' : String(run.avgHeartRate)}
            unit="bpm"
          />
        </span>
      </Link>
    </li>
  )
}

function Metric({ value, unit }: { value: string; unit?: string | undefined }) {
  return (
    <span className="font-mono text-xs text-ink-1">
      {value}
      {unit ? <span className="ml-1 text-ink-3">{unit}</span> : null}
    </span>
  )
}
