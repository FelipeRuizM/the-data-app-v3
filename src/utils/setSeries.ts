import { isExcludedSet } from './prEngine'
import type { PRAchievement, PRMetric } from './prEngine'
import type { SetType, Workout } from '../types'

/**
 * One exercise's **working** set history, in the order it was performed (D-63).
 *
 * The per-session charts this replaced showed only each session's *best* set,
 * which is the interesting number but throws away everything around it — you
 * could not see that a session was 5×5 rather than one heavy single, and the
 * back-off sets were invisible. Set by set is the log as it actually happened.
 *
 * **Warm-ups and feeders are excluded (D-64).** They are scaffolding, not the
 * work: a warm-up is 20–30% of the working load and a feeder 40–75% (§8), so
 * plotting them turns every session into a sawtooth that says nothing about
 * progression. The workout detail page already dims them for the same reason.
 * `dropset` and `failure` stay — those are the work, done hard.
 */

/** Scaffolding set types, never plotted. */
const SCAFFOLDING: ReadonlySet<SetType> = new Set<SetType>(['warmup', 'feeder'])

export type SetPoint = {
  /** Position across the whole history, 0-based — the chart's x. */
  index: number
  date: Date
  workoutId: string
  /**
   * 1-based position among the WORKING sets of its session — "my second work
   * set", which is how a lifter counts them. Not the raw `set_index`, which
   * would leave gaps wherever a warm-up was skipped over.
   */
  setInSession: number
  /** Session ordinal, so the chart can rule off where one workout ends. */
  session: number
  setType: SetType | null
  reps: number | null
  /** Null for a bodyweight set — the load was never recorded (D-7b). */
  weightKg: number | null
  /** Null when either factor is missing. Bodyweight substitutes (D-7). */
  volumeKg: number | null
  /** Which records this set broke, if any (§6.2). */
  prMetrics: PRMetric[]
}

/**
 * Build the series.
 *
 * Ordered by `start_time` and never by key — 37 real workouts carry numeric
 * string keys from an import and 44 carry push ids, so key order says nothing
 * about when anything happened (§3.1).
 *
 * `bodyweightKg` feeds volume only, never weight. D-7 is explicit that the
 * substitution applies to volume totals and must never appear as a load: a
 * pull-up session should not read as zero work, and equally must not claim you
 * lifted 78 kg.
 */
export function setSeriesFor(
  workouts: readonly Workout[],
  exerciseTitle: string,
  achievements: readonly PRAchievement[],
  bodyweightKg: number | null,
): SetPoint[] {
  const prBySet = new Map<string, PRMetric[]>()
  for (const a of achievements) {
    if (a.exerciseTitle !== exerciseTitle) continue
    const key = `${a.workoutId}::${a.setIndex}`
    const list = prBySet.get(key)
    if (list) list.push(a.metric)
    else prBySet.set(key, [a.metric])
  }

  const sessions = [...workouts]
    .filter((w) => w.exercises.some((e) => e.exerciseTitle === exerciseTitle))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

  const points: SetPoint[] = []

  sessions.forEach((workout, session) => {
    let setInSession = 0
    for (const entry of workout.exercises) {
      if (entry.exerciseTitle !== exerciseTitle) continue
      for (const set of entry.sets) {
        // The lift wasn't completed, so it is neither a data point nor a record
        // (§6.1) — the same exclusion the engine applies.
        if (isExcludedSet(set)) continue
        // Scaffolding, not the work (D-64).
        if (set.setType !== null && SCAFFOLDING.has(set.setType)) continue

        setInSession += 1
        const weightKg =
          set.weight.kind === 'loaded'
            ? set.weight.kg
            : set.weight.kind === 'zero'
              ? 0
              : null

        const volumeBase = set.weight.kind === 'bodyweight' ? bodyweightKg : weightKg

        points.push({
          index: points.length,
          date: workout.startTime,
          workoutId: workout.id,
          setInSession,
          session,
          setType: set.setType,
          reps: set.reps,
          weightKg,
          volumeKg:
            volumeBase !== null && set.reps !== null ? volumeBase * set.reps : null,
          prMetrics: prBySet.get(`${workout.id}::${set.setIndex}`) ?? [],
        })
      }
    }
  })

  return points
}
