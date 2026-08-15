import type { Run } from '../types'

/**
 * Run personal bests (D-10).
 *
 * Deliberately much simpler than the workout records engine: one best per
 * metric over full run history, each `{ value, date, runId }`. No exercise
 * dimension means no session grouping, no first-session-silent rule and no
 * badge engine — §6 is entirely set-shaped and has no run analogue.
 */

export type RunRecordKey = 'fastestPace' | 'longestDistance' | 'longestDuration'

export type RunRecord = {
  key: RunRecordKey
  label: string
  /** Raw value; formatting is the page's job. */
  value: number
  date: Date
  runId: string
}

type Spec = {
  key: RunRecordKey
  label: string
  pick: (r: Run) => number | null
  /** Pace is the one metric where lower is better. */
  lowerIsBetter?: boolean
}

const SPECS: Spec[] = [
  {
    key: 'fastestPace',
    label: 'Fastest pace',
    pick: (r) => r.paceSecPerKm,
    lowerIsBetter: true,
  },
  { key: 'longestDistance', label: 'Longest distance', pick: (r) => r.distanceKm },
  { key: 'longestDuration', label: 'Longest duration', pick: (r) => r.durationSeconds },
  // Elevation and steps were retired here with the rest of the app (D-46).
]

export function calculateRunRecords(runs: readonly Run[]): RunRecord[] {
  const out: RunRecord[] = []

  for (const spec of SPECS) {
    let best: RunRecord | null = null

    for (const run of runs) {
      const value = spec.pick(run)
      // Null means not recorded (§3.2 sentinels are already null by here). A
      // zero elevation gain is a real value and stays eligible; a zero pace
      // would be nonsense and is excluded by the null check upstream.
      if (value === null) continue
      if (spec.lowerIsBetter && value <= 0) continue

      if (!best || (spec.lowerIsBetter ? value < best.value : value > best.value)) {
        best = {
          key: spec.key,
          label: spec.label,
          value,
          date: run.startTime,
          runId: run.id,
        }
      }
    }

    if (best) out.push(best)
  }

  return out
}
