import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Label } from '../../components/ui'
import { StateBlock } from '../../components/StateBlock'
import { useProfile } from '../../data/useProfile'
import { muscleGroupFor } from '../../lib/normalize'
import { formatDay } from '../../lib/dates'
import { formatWeight } from '../../lib/units'
import { calculatePRs, exercisesWithRecords, type PRData } from '../../utils/prEngine'
import type { CatalogExercise, Units } from '../../types'

/**
 * Records (§6.3).
 *
 * Featured is the owner-curated shortlist, grouped by muscle group. Empty
 * falls back to top 3 by maxWeight — SKIPPING exercises that have none, rather
 * than ranking them as zero, since a bodyweight exercise's maxWeight is
 * undefined by design (D-7).
 */
export function Records() {
  const state = useProfile()

  const data = useMemo(() => {
    if (state.status !== 'ready') return null
    const { profile, config } = state.data
    const prs = calculatePRs(profile.workouts, config.repBasedExercises)
    return {
      all: exercisesWithRecords(prs),
      catalog: profile.exercises,
      featuredNames: profile.settings.featuredExercises,
      repBased: new Set(config.repBasedExercises),
      units: profile.settings.units,
    }
  }, [state])

  if (state.status === 'loading') {
    return (
      <Page>
        <div className="flex flex-col gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-10 w-2/3 rounded-sm bg-rule"
              aria-hidden="true"
            />
          ))}
          <span className="sr-only">Loading records…</span>
        </div>
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

  if (!data) return null

  if (data.all.length === 0) {
    return (
      <Page>
        <StateBlock
          label="Nothing here yet"
          title="No records yet."
          body="Records are computed from your set history — log a workout and they appear here automatically. Nothing is ever stored."
        />
      </Page>
    )
  }

  const featured =
    data.featuredNames.length > 0
      ? data.featuredNames
          .map((name) => data.all.find((p) => p.exerciseTitle === name))
          .filter((p): p is PRData => p !== undefined)
      : // Fallback: top 3 by maxWeight, skipping those without one (§6.3).
        [...data.all]
          .filter((p) => p.maxWeight !== null)
          .sort((a, b) => b.maxWeight!.value - a.maxWeight!.value)
          .slice(0, 3)

  const featuredTitles = new Set(featured.map((p) => p.exerciseTitle))
  const hallOfFame = data.all.filter((p) => !featuredTitles.has(p.exerciseTitle))

  return (
    <Page>
      {featured.length > 0 ? (
        <section className="flex flex-col gap-6">
          <Label as="h2">Featured</Label>
          <GroupedRecords
            records={featured}
            catalog={data.catalog}
            repBased={data.repBased}
            units={data.units}
            emphasis
          />
        </section>
      ) : null}

      {hallOfFame.length > 0 ? (
        <section className="flex flex-col gap-6">
          <Label as="h2">Hall of Fame</Label>
          <GroupedRecords
            records={hallOfFame}
            catalog={data.catalog}
            repBased={data.repBased}
            units={data.units}
          />
        </section>
      ) : null}
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-10 py-10">
      <div className="flex flex-col gap-2">
        <Label as="h1">Records</Label>
        <p className="m-0 max-w-prose text-sm text-ink-2">
          Computed from your full set history on every visit. Nothing here is stored.
        </p>
      </div>
      {children}
    </div>
  )
}

/** Grouped by muscle group, sorted by maxWeight descending within group (§6.3). */
function GroupedRecords({
  records,
  catalog,
  repBased,
  units,
  emphasis = false,
}: {
  records: PRData[]
  catalog: CatalogExercise[]
  repBased: Set<string>
  units: Units
  emphasis?: boolean
}) {
  const groups = new Map<string, PRData[]>()
  for (const r of records) {
    const group = muscleGroupFor(catalog, r.exerciseTitle)
    const list = groups.get(group)
    if (list) list.push(r)
    else groups.set(group, [r])
  }

  const ordered = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="flex flex-col gap-8">
      {ordered.map(([group, list]) => (
        <div key={group} className="flex flex-col gap-4">
          <div className="border-b border-rule pb-1">
            <Label>{group}</Label>
          </div>
          <ul className="flex list-none flex-col gap-0 p-0">
            {[...list]
              .sort((a, b) => (b.maxWeight?.value ?? -1) - (a.maxWeight?.value ?? -1))
              .map((r) => (
                <RecordRow
                  key={r.exerciseTitle}
                  pr={r}
                  repBased={repBased.has(r.exerciseTitle)}
                  units={units}
                  emphasis={emphasis}
                />
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function RecordRow({
  pr,
  repBased,
  units,
  emphasis,
}: {
  pr: PRData
  repBased: boolean
  units: Units
  emphasis: boolean
}) {
  // Rep-based exercises headline Max Reps instead of Max Weight (§6.3).
  const headline = repBased
    ? {
        value: pr.maxReps === null ? '—' : String(pr.maxReps.value),
        unit: 'reps',
        label: 'Max reps PR',
      }
    : {
        value:
          pr.maxWeight === null
            ? '—'
            : formatWeight(pr.maxWeight.value, units, { withUnit: false }),
        unit: pr.maxWeight === null ? '' : units,
        label: 'Max weight PR',
      }

  const headlineDate = repBased ? pr.maxReps?.date : pr.maxWeight?.date

  return (
    <li className="border-b border-rule">
      <Link
        to={`/workouts/records/${encodeURIComponent(pr.exerciseTitle)}`}
        className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-4 no-underline"
      >
        <span className="min-w-0 truncate text-ink-0">{pr.exerciseTitle}</span>
        <span
          className={`font-mono tracking-tight whitespace-nowrap text-ink-0 ${
            emphasis ? 'text-2xl' : 'text-lg'
          }`}
        >
          {headline.value}
          {headline.unit ? (
            <span className="ml-1 text-xs text-ink-2">{headline.unit}</span>
          ) : null}
        </span>

        <span className="col-span-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
            {headline.label}
          </span>
          {headlineDate ? (
            <span className="font-mono text-xs text-ink-3">
              {formatDay(headlineDate)}
            </span>
          ) : null}
          {pr.daysSinceLastPR !== null ? (
            <span className="font-mono text-xs text-ink-3">
              {pr.daysSinceLastPR}d since last PR
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}
