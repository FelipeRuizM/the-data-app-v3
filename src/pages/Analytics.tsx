import { useMemo } from 'react'
import { Label, StatFigure } from '../components/ui'
import { StateBlock } from '../components/StateBlock'
import { ActivityHeatmap } from '../components/charts/ActivityHeatmap'
import { TallyBars } from '../components/charts/TallyBars'
import { MonthlyTrendChart } from '../components/charts/MonthlyTrendChart'
import {
  MuscleGroupRadar,
  SetsPerGroupChart,
} from '../components/charts/MuscleGroupCharts'
import { CATEGORIES, recentActivity, totalRecords } from '../categories/registry'
import { useProfile } from '../data/useProfile'
import { formatDay, formatDuration } from '../lib/dates'
import {
  activityHeatmap,
  crossTotals,
  partnerBreakdown,
  placeBreakdown,
  weeklyStreaks,
} from '../utils/analytics'
import {
  getMonthlySeries,
  getVolumeByMuscleGroup,
  radarGroups,
} from '../utils/workoutUtils'

/**
 * Cross-category analytics (§4).
 *
 * **The aggregation iterates the category registry.** Totals, time, heart rate,
 * streaks, the heatmap and the place and partner breakdowns all run over
 * `recentActivity()`, which is every category flattened into one shape — so a
 * future Flights entry contributes to all of them without this page changing.
 *
 * Muscle-group balance and volume-over-time are the honest exception: they are
 * workout concepts, not cross-category ones, and §1 warns against
 * over-abstracting. They live in a clearly workout-scoped section that hides
 * itself when there are no workouts, the same way §7 hides sections rather than
 * zeroing them.
 */
export function Analytics() {
  const state = useProfile()

  const ready = state.status === 'ready' ? state.data : null

  const view = useMemo(() => {
    if (!ready) return null
    const { profile, config } = ready
    const items = recentActivity(profile, config)
    return {
      profile,
      items,
      totals: crossTotals(items),
      streaks: weeklyStreaks(items),
      heatmap: activityHeatmap(items),
      places: placeBreakdown(items),
      partners: partnerBreakdown(items),
      series: getMonthlySeries(profile),
      muscleGroups: getVolumeByMuscleGroup(
        profile.workouts,
        profile.exercises,
        profile.settings.bodyweightKg,
      ),
    }
  }, [ready])

  if (state.status === 'loading') {
    return (
      <Page>
        <div className="h-32 w-full rounded-sm bg-rule" aria-busy="true" />
      </Page>
    )
  }

  if (!view) {
    return (
      <Page>
        <StateBlock
          label={state.status === 'error' ? 'Couldn’t load' : 'No access'}
          title={
            state.status === 'error'
              ? 'Something went wrong.'
              : 'This profile isn’t readable.'
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

  if (totalRecords(view.profile) === 0) {
    return (
      <Page>
        <StateBlock
          label="Nothing yet"
          title="No activity to analyse."
          body="Log a session or two and this page fills in — totals, streaks, the hours you actually train, and who you train with."
        />
      </Page>
    )
  }

  const { profile, totals, streaks, heatmap, places, partners, series } = view
  const hasWorkouts = profile.workouts.length > 0

  return (
    <Page>
      <Section title="Everything, all together">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          <StatFigure value={String(totals.activities)} label="Activities" />
          <StatFigure
            value={
              totals.totalMinutes === null ? '—' : (totals.totalMinutes / 60).toFixed(0)
            }
            label="Hours"
          />
          <StatFigure value={formatDuration(totals.avgMinutes)} label="Avg session" />
          {/* No unit prop at all when there is no value — "— bpm" reads as a
              measurement that failed rather than one never taken. */}
          {totals.avgHeartRate === null ? (
            <StatFigure value="—" label="Avg heart rate" />
          ) : (
            <StatFigure
              value={String(Math.round(totals.avgHeartRate))}
              label="Avg heart rate"
              unit="bpm"
            />
          )}
        </div>

        {/* One headline per registry entry. This page never names volume or
            distance itself — those are facts a category owns (§1). */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {CATEGORIES.map((category) => {
            const headline = category.headline(profile)
            return (
              <div key={category.id} className="contents">
                <StatFigure
                  value={String(category.count(profile))}
                  label={category.label}
                />
                <StatFigure
                  value={headline.value}
                  label={headline.label}
                  unit={headline.unit}
                />
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        title="Streaks"
        note="Consecutive weeks with at least one activity of any kind. Weeks run Sunday to Saturday, so a rest day never breaks one."
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-8">
          <StatFigure
            value={String(streaks.current)}
            label={streaks.current === 1 ? 'Week, current' : 'Weeks, current'}
          />
          <StatFigure
            value={String(streaks.longest?.weeks ?? 0)}
            label="Weeks, longest"
          />
        </div>
        {streaks.longest ? (
          <p className="m-0 font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
            Longest ran {formatDay(streaks.longest.from)} —{' '}
            {formatDay(streaks.longest.to)}
          </p>
        ) : null}
      </Section>

      <Section title="Rhythm">
        <ActivityHeatmap heatmap={heatmap} />
      </Section>

      <Section title="Month by month">
        <MonthlyTrendChart series={series} />
      </Section>

      {hasWorkouts ? (
        <Section
          title="Muscle-group balance"
          note="Workouts only. Core and Other sit outside the radar — they distort the balance shape rather than describing it."
        >
          <SetsPerGroupChart totals={view.muscleGroups} />
          <MuscleGroupRadar totals={radarGroups(view.muscleGroups)} />
        </Section>
      ) : null}

      <Section title="Places and people">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
          <TallyBars
            title="Places"
            items={places}
            emptyNote="Nothing has a place recorded yet."
          />
          <TallyBars
            title="Training partners"
            items={partners}
            emptyNote="Every session so far has been logged alone."
          />
        </div>
      </Section>
    </Page>
  )
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-rule pt-10 first:border-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <Label as="h2">{title}</Label>
        {note ? <p className="m-0 max-w-prose text-sm text-ink-2">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-10 py-10">
      <div className="flex flex-col gap-2">
        <Label as="h1">Analytics</Label>
      </div>
      {children}
    </div>
  )
}
