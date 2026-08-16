import { useMemo, useState } from 'react'
import { Label } from '../../components/ui'
import { ComboBox } from '../../components/ComboBox'
import { StateBlock } from '../../components/StateBlock'
import { useProfile } from '../../data/useProfile'
import { formatWeight } from '../../lib/units'
import { buildRamp, incrementFor } from '../../utils/calculator'
import { calculatePRs } from '../../utils/prEngine'
import type { PrescribedSet } from '../../utils/calculator'

/**
 * Warm-up & feeder calculator (§8), at #/workouts/calculator.
 *
 * Everything works in the viewer's DISPLAY unit — you type the weight you'll
 * load, and the ramp comes back in the same unit, rounded to something you can
 * actually put on the bar (D-12). One total number per set; no plate maths.
 *
 * Percentages come from per-account settings, never hardcoded here; editing
 * them is the Settings page's job (Phase 12).
 */
export function Calculator() {
  const state = useProfile()
  const [target, setTarget] = useState('')
  const [exercise, setExercise] = useState('')

  const ready = state.status === 'ready' ? state.data : null

  const catalog = useMemo(
    () => (ready ? ready.profile.exercises.map((e) => e.name) : []),
    [ready],
  )

  /**
   * The optional exercise input exists to prefill from that lift's own record
   * (§8 "optionally the exercise"), which is more useful than remembering a
   * number the lifter would have to recall anyway.
   */
  const suggested = useMemo(() => {
    if (!ready || exercise.trim() === '') return null
    const prs = calculatePRs(ready.profile.workouts, ready.config.repBasedExercises)
    const pr = prs.get(exercise.trim())
    return pr?.maxWeight?.value ?? null
  }, [ready, exercise])

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
              ? 'This profile isn’t readable.'
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

  if (!ready) return null

  const { units, calculator } = ready.profile.settings
  const targetNumber = Number(target)
  const ramp = buildRamp(targetNumber, calculator, units)
  const increment = incrementFor(calculator, units)

  return (
    <Page>
      <section className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Label>Working weight ({units})</Label>
            <input
              inputMode="decimal"
              autoFocus
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={units === 'lb' ? '225' : '100'}
              className="w-full rounded-sm border border-rule bg-transparent px-3 py-2 font-mono text-ink-0 placeholder:text-ink-3"
            />
          </label>

          <ComboBox
            label="Exercise (optional)"
            value={exercise}
            onChange={setExercise}
            options={catalog}
            placeholder="To use your record"
          />
        </div>

        {suggested !== null ? (
          <button
            type="button"
            onClick={() => setTarget(String(suggested))}
            className="self-start cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-accent uppercase"
          >
            Use record: {formatWeight(suggested, units)}
          </button>
        ) : null}
      </section>

      {ramp.length === 0 ? (
        <StateBlock
          label="Waiting"
          title="Enter a working weight."
          body={`The ramp is calculated from it — warm-ups, then feeders, then the working set, each rounded to the nearest ${increment} ${units}.`}
        />
      ) : (
        <RampTable ramp={ramp} units={units} />
      )}
    </Page>
  )
}

function RampTable({ ramp, units }: { ramp: PrescribedSet[]; units: string }) {
  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">Warm-up and feeder ramp</caption>
      <thead>
        <tr>
          <Th>Set</Th>
          <Th className="text-right">%</Th>
          <Th className="text-right">Weight</Th>
          <Th className="text-right">Reps</Th>
        </tr>
      </thead>
      <tbody>
        {ramp.map((s, i) => {
          const working = s.kind === 'working'
          return (
            <tr key={i} className="border-b border-rule">
              <td
                className={`py-3 ${working ? 'text-ink-0' : 'font-mono text-sm text-ink-2'}`}
              >
                {s.label}
              </td>
              <td className="py-3 text-right font-mono text-sm text-ink-2">
                {s.percent}%
              </td>
              <td
                className={`py-3 text-right font-mono ${
                  working ? 'text-lg text-accent' : 'text-sm text-ink-0'
                }`}
              >
                {s.weight} <span className="text-xs text-ink-2">{units}</span>
              </td>
              <td className="py-3 text-right font-mono text-sm text-ink-1">
                {/* The working set's reps are the lifter's business, not the
                    calculator's — it only prescribes the ramp up to it. */}
                {working ? '—' : s.reps}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
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

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <Label as="h1">Warm-up &amp; feeder calculator</Label>
      </div>
      {children}
    </div>
  )
}
