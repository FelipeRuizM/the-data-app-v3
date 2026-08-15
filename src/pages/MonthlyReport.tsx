import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addMonths, format, parse, startOfMonth, subMonths } from 'date-fns'
import { Label } from '../components/ui'
import { StateBlock } from '../components/StateBlock'
import { StatCard } from '../components/StatCard'
import { SessionCalendar } from '../components/SessionCalendar'
import { RecordsBrokenCard } from '../components/RecordsBrokenCard'
import { MonthRunList } from '../components/MonthRunList'
import { InProgressGuard } from '../components/InProgressOverlay'
import { MonthlyTrendChart } from '../components/charts/MonthlyTrendChart'
import {
  MuscleGroupRadar,
  SetsPerGroupChart,
} from '../components/charts/MuscleGroupCharts'
import { useProfile } from '../data/useProfile'
import { formatDuration, formatMonthLong, formatPace } from '../lib/dates'
import { formatDistance, formatVolume } from '../lib/units'
import {
  computeDelta,
  getMainExercises,
  getMonthlySummary,
  getSessionCalendar,
  getMonthlySeries,
  getRecordsBrokenInMonth,
  getVolumeByMuscleGroup,
  monthsWithActivity,
  radarGroups,
} from '../utils/workoutUtils'
import type { Units } from '../types'

const MONTH_PARAM = 'yyyy-MM'

/**
 * ONE cross-category monthly report (D-8) at `#/reports/:month`.
 *
 * Layers 1–2 here: stat cards with last-month deltas, and the muscle-group
 * breakdown. Layers 3–4 (records broken, run list) and the trend charts are
 * Phase 10.
 *
 * Never stored — recomputed on every visit, including the previous month it
 * diffs against.
 */
export function MonthlyReport() {
  const { month: monthParam } = useParams<{ month: string }>()
  const state = useProfile()

  const month = useMemo(() => {
    if (!monthParam) return null
    const parsed = parse(monthParam, MONTH_PARAM, new Date())
    return Number.isNaN(parsed.getTime()) ? null : startOfMonth(parsed)
  }, [monthParam])

  const data = useMemo(() => {
    if (state.status !== 'ready' || !month) return null
    const { profile, config } = state.data
    const report = getMonthlySummary(profile, month)
    const groups = getVolumeByMuscleGroup(
      report.current.monthWorkouts,
      profile.exercises,
      profile.settings.bodyweightKg,
    )
    return {
      report,
      groups,
      mainExercises: getMainExercises(
        report.current.monthWorkouts,
        profile.settings.bodyweightKg,
      ),
      calendar: getSessionCalendar(report.current),
      recordsBroken: getRecordsBrokenInMonth(profile.workouts, month),
      series: getMonthlySeries(profile),
      units: profile.settings.units,
      available: monthsWithActivity(profile),
      config,
    }
  }, [state, month])

  if (!month) {
    return (
      <Page month={null}>
        <StateBlock
          label="Bad link"
          title="That isn’t a month."
          body="The URL should look like #/reports/2026-03."
        />
      </Page>
    )
  }

  if (state.status === 'loading') {
    return (
      <Page month={month}>
        <div className="h-32 w-full rounded-sm bg-rule" aria-busy="true" />
      </Page>
    )
  }

  if (state.status === 'denied' || state.status === 'error') {
    return (
      <Page month={month}>
        <StateBlock
          label={state.status === 'denied' ? 'No access' : 'Couldn’t load'}
          title={
            state.status === 'denied'
              ? 'This report isn’t readable.'
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

  if (!data) return null

  const { report, groups, mainExercises, calendar, units, recordsBroken, series } = data
  const { current, previous, showWorkouts, showRuns } = report

  if (current.activities.count === 0) {
    return (
      <Page month={month}>
        <StateBlock
          label="Nothing logged"
          title={`No activity in ${formatMonthLong(month)}.`}
          body="Nothing was logged this month. Use the arrows above to look at another month."
        />
      </Page>
    )
  }

  return (
    <Page month={month}>
      {/* The current month is gated by default (§7 Access rule). The
          aggregation above already ran — this only gates display. */}
      <InProgressGuard month={month}>
        <section className="flex flex-col gap-6">
          <Label as="h2">Activity</Label>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            <StatCard
              label="Activities"
              value={String(current.activities.count)}
              delta={computeDelta(current.activities.count, previous.activities.count)}
            />
            <StatCard
              label="Total time"
              value={formatDuration(current.activities.totalMinutes)}
              delta={computeDelta(
                current.activities.totalMinutes,
                previous.activities.totalMinutes,
              )}
              formatDelta={(m) => formatDuration(m)}
              // Same principle as the hidden Runs section: don't state "0.0h
              // running" for someone who doesn't run. The split only appears
              // when running is actually part of the picture.
              sub={
                showRuns
                  ? `${hours(current.activities.liftingMinutes)}h lifting · ${hours(
                      current.activities.runningMinutes,
                    )}h running`
                  : showWorkouts
                    ? `${hours(current.activities.liftingMinutes)}h lifting`
                    : undefined
              }
            />
            <StatCard
              label="Avg session"
              value={formatDuration(current.activities.avgSessionMinutes)}
              delta={computeDelta(
                current.activities.avgSessionMinutes,
                previous.activities.avgSessionMinutes,
              )}
              formatDelta={(m) => formatDuration(m)}
            />
            <StatCard
              label="Avg heart rate"
              value={
                current.activities.avgHeartRate === null
                  ? '—'
                  : String(Math.round(current.activities.avgHeartRate))
              }
              unit={current.activities.avgHeartRate === null ? undefined : 'bpm'}
              delta={computeDelta(
                current.activities.avgHeartRate,
                previous.activities.avgHeartRate,
              )}
            />
          </div>
        </section>

        {showWorkouts ? (
          <section className="flex flex-col gap-6">
            <Label as="h2">Workouts</Label>
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
              <StatCard
                label="Volume"
                value={formatVolume(current.workouts.volumeKg, units)}
                unit={units}
                delta={computeDelta(
                  current.workouts.volumeKg,
                  previous.workouts.volumeKg,
                )}
              />
              <StatCard
                label="Total reps"
                value={current.workouts.reps.toLocaleString('en-US')}
                delta={computeDelta(current.workouts.reps, previous.workouts.reps)}
              />
              <StatCard
                label="Total sets"
                value={String(current.workouts.sets)}
                delta={computeDelta(current.workouts.sets, previous.workouts.sets)}
              />
              <StatCard
                label="Avg volume / session"
                value={formatVolume(current.workouts.avgVolumePerSession, units)}
                unit={units}
                delta={computeDelta(
                  current.workouts.avgVolumePerSession,
                  previous.workouts.avgVolumePerSession,
                )}
              />
            </div>
          </section>
        ) : null}

        {showRuns ? (
          <section className="flex flex-col gap-6">
            <Label as="h2">Runs</Label>
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
              <StatCard
                label="Distance"
                value={formatDistance(current.runs.distanceKm)}
                delta={computeDelta(current.runs.distanceKm, previous.runs.distanceKm)}
                formatDelta={(km) => `${km.toFixed(2)} km`}
              />
              <StatCard
                label="Avg pace"
                value={formatPace(current.runs.avgPaceSecPerKm)}
                unit={current.runs.avgPaceSecPerKm === null ? undefined : '/km'}
                // Lower is better — invertTrend flips the arrow semantics (§7).
                delta={computeDelta(
                  current.runs.avgPaceSecPerKm,
                  previous.runs.avgPaceSecPerKm,
                  true,
                )}
                formatDelta={(s) => `${Math.round(s)}s`}
              />
              <StatCard
                label="Elevation gain"
                value={Math.round(current.runs.elevationGainM).toLocaleString('en-US')}
                unit="m"
                delta={computeDelta(
                  current.runs.elevationGainM,
                  previous.runs.elevationGainM,
                )}
              />
              <StatCard
                label="Calories"
                value={Math.round(current.runs.calories).toLocaleString('en-US')}
                delta={computeDelta(current.runs.calories, previous.runs.calories)}
              />
            </div>
          </section>
        ) : null}

        {showWorkouts && groups.length > 0 ? (
          <section className="flex flex-col gap-10">
            <Label as="h2">Muscle groups</Label>
            <SetsPerGroupChart totals={groups} />
            <MuscleGroupRadar totals={radarGroups(groups)} />
            <MainExercises exercises={mainExercises} units={units} />
          </section>
        ) : null}

        {showWorkouts ? (
          <section className="flex flex-col gap-6">
            <Label as="h2">Records broken</Label>
            <RecordsBrokenCard records={recordsBroken} units={units} />
          </section>
        ) : null}

        {showRuns && current.monthRuns.length > 0 ? (
          <section className="flex flex-col gap-6">
            <Label as="h2">Run log</Label>
            <MonthRunList runs={current.monthRuns} runTypes={data.config.runTypes} />
          </section>
        ) : null}

        <section className="flex flex-col gap-6">
          <Label as="h2">Calendar</Label>
          <SessionCalendar weeks={calendar} />
        </section>

        <section className="flex flex-col gap-6">
          <Label as="h2">Trends</Label>
          <MonthlyTrendChart series={series} selectedMonth={month} />
        </section>

        <p className="m-0 border-t border-rule pt-4 text-xs text-ink-2">
          Recomputed from full history on every visit — including the previous month it
          compares against. Nothing on this page is stored.
        </p>
      </InProgressGuard>
    </Page>
  )
}

function hours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

function MainExercises({
  exercises,
  units,
}: {
  exercises: ReturnType<typeof getMainExercises>
  units: Units
}) {
  if (exercises.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      <Label as="h3">Main exercises</Label>
      <ul className="flex list-none flex-col gap-0 p-0">
        {exercises.map((e) => (
          <li
            key={e.exerciseTitle}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-rule py-3"
          >
            <span className="min-w-0 truncate text-ink-0">{e.exerciseTitle}</span>
            <span className="font-mono text-sm text-ink-0">
              {formatVolume(e.volumeKg, units)}
              <span className="ml-1 text-xs text-ink-2">{units}</span>
            </span>
            <span className="col-span-2 flex gap-4 font-mono text-xs text-ink-2">
              <span>{e.sets} sets</span>
              <span>{e.reps} reps</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Page({ month, children }: { month: Date | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-10 py-10">
      <header className="flex flex-col gap-3">
        <Label as="h1">Monthly report</Label>
        {month ? (
          <div className="flex items-baseline justify-between gap-4">
            <Link
              to={`/reports/${format(subMonths(month, 1), MONTH_PARAM)}`}
              className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-0"
            >
              ← Prev
            </Link>
            <h2 className="m-0 text-2xl font-semibold tracking-tight text-ink-0">
              {formatMonthLong(month)}
            </h2>
            <Link
              to={`/reports/${format(addMonths(month, 1), MONTH_PARAM)}`}
              className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-0"
            >
              Next →
            </Link>
          </div>
        ) : null}
      </header>
      {children}
    </div>
  )
}
