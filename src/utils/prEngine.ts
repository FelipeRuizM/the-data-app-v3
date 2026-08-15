import type { Workout, WorkoutSet } from '../types'

/**
 * The records engine (CLAUDE.md §6).
 *
 * Both functions are PURE functions of the immutable set-log history, computed
 * client-side on every render and NEVER written back. There is no `records`
 * node and there never will be.
 */

/* ═══════════════════════════ shared set rules ═══════════════════════════ */

/**
 * A `failure` set with `reps === 0` is excluded entirely — the lift wasn't
 * completed, so it can neither set a record nor count toward one (§6.1).
 *
 * Note the conjunction: a `failure` set with reps > 0 DOES count, and a 0-rep
 * set of any other type is a data oddity rather than a failure.
 */
export function isExcludedSet(set: WorkoutSet): boolean {
  return set.setType === 'failure' && set.reps === 0
}

/**
 * The load a RECORD may use. Bodyweight substitution is confined to volume
 * (D-7) — it must never reach `maxWeight`, `maxVolume`, `oneRM` or a badge, so
 * this deliberately returns null for a bodyweight set even when a bodyweight
 * is configured.
 */
function recordWeight(set: WorkoutSet): number | null {
  switch (set.weight.kind) {
    case 'loaded':
      return set.weight.kg
    case 'zero':
      return 0
    case 'bodyweight':
      return null
  }
}

/** Epley. Only defined when both a real load and reps exist. */
export function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30)
}

/* ═══════════════════════════ 6.1 calculatePRs ═══════════════════════════ */

export type PRMax = { value: number; date: Date; workoutId: string }

/**
 * The record for an exercise is this three-field struct, not a scalar. Every
 * consumer takes the struct (§6.1).
 */
export type PRData = {
  exerciseTitle: string
  /** Undefined for purely bodyweight exercises — renders as "—", never 0. */
  maxWeight: PRMax | null
  /** Only meaningful for rep-based exercises, but computed for all. */
  maxReps: PRMax | null
  maxVolume: PRMax | null
  /** Days since the most recent RELEVANT PR date. Null when there are none. */
  daysSinceLastPR: number | null
  /** Total non-excluded sets logged, for the detail page. */
  setCount: number
  sessionCount: number
}

function better(current: PRMax | null, candidate: PRMax): PRMax {
  if (!current) return candidate
  if (candidate.value > current.value) return candidate
  // Ties keep the EARLIER date: the record was set then, not re-set later.
  return current
}

/**
 * Walk every logged set and track three independent maxima per exercise.
 *
 * `repBasedExercises` decides which exercises count `maxReps` toward
 * `daysSinceLastPR` — the list is configurable in settings (D-6), never
 * hardcoded here.
 */
export function calculatePRs(
  workouts: readonly Workout[],
  repBasedExercises: readonly string[] = [],
): Map<string, PRData> {
  const repBased = new Set(repBasedExercises)
  const byExercise = new Map<string, PRData>()
  const sessionsSeen = new Map<string, Set<string>>()

  // start_time is the only ordering authority (§3.1).
  const ordered = [...workouts].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  )

  for (const workout of ordered) {
    for (const entry of workout.exercises) {
      const title = entry.exerciseTitle

      let pr = byExercise.get(title)
      if (!pr) {
        pr = {
          exerciseTitle: title,
          maxWeight: null,
          maxReps: null,
          maxVolume: null,
          daysSinceLastPR: null,
          setCount: 0,
          sessionCount: 0,
        }
        byExercise.set(title, pr)
      }

      let sessions = sessionsSeen.get(title)
      if (!sessions) {
        sessions = new Set()
        sessionsSeen.set(title, sessions)
      }

      let countedAnySet = false

      for (const set of entry.sets) {
        if (isExcludedSet(set)) continue
        countedAnySet = true
        pr.setCount += 1

        const at = { date: workout.startTime, workoutId: workout.id }
        const weight = recordWeight(set)

        if (weight !== null) {
          pr.maxWeight = better(pr.maxWeight, { value: weight, ...at })
          if (set.reps !== null) {
            pr.maxVolume = better(pr.maxVolume, { value: weight * set.reps, ...at })
          }
        }

        if (set.reps !== null) {
          pr.maxReps = better(pr.maxReps, { value: set.reps, ...at })
        }
      }

      if (countedAnySet) sessions.add(workout.id)
    }
  }

  const now = Date.now()
  for (const [title, pr] of byExercise) {
    pr.sessionCount = sessionsSeen.get(title)?.size ?? 0

    // Weight + volume always; reps only when the exercise is rep-based (§6.1).
    const relevant = [pr.maxWeight, pr.maxVolume]
    if (repBased.has(title)) relevant.push(pr.maxReps)

    const dates = relevant
      .filter((m): m is PRMax => m !== null)
      .map((m) => m.date.getTime())

    pr.daysSinceLastPR =
      dates.length === 0
        ? null
        : Math.floor((now - Math.max(...dates)) / (1000 * 60 * 60 * 24))
  }

  return byExercise
}

/** Exercises that have any record at all, for the Records page. */
export function exercisesWithRecords(prs: Map<string, PRData>): PRData[] {
  return [...prs.values()].filter(
    (p) => p.maxWeight !== null || p.maxReps !== null || p.maxVolume !== null,
  )
}

/* ═════════════════════ 6.2 computePRAchievements ════════════════════════ */

export const PR_METRICS = ['weight', 'volume', 'oneRM'] as const
export type PRMetric = (typeof PR_METRICS)[number]

export type PRAchievement = {
  exerciseTitle: string
  metric: PRMetric
  value: number
  /** Previous record this beat — useful for "up from X" copy. */
  previous: number
  date: Date
  workoutId: string
  /** Index of the set within its exercise entry, so a badge can be placed. */
  setIndex: number
}

type MetricValues = Record<PRMetric, number | null>

/** The three metric values for a single set, or null where undefined. */
function metricsFor(set: WorkoutSet): MetricValues {
  const weight = recordWeight(set)
  const reps = set.reps

  return {
    weight,
    volume: weight !== null && reps !== null ? weight * reps : null,
    oneRM: weight !== null && reps !== null ? epley1RM(weight, reps) : null,
  }
}

/**
 * Chronological pass producing one badge per genuinely-broken record.
 *
 * The rules that make this non-trivial, all of which have tests:
 *
 *  1. Sets group into SESSIONS (one workout), ordered oldest → newest by
 *     start_time — never by key (§3.1).
 *  2. Within a session, only the single BEST set per metric counts. Three sets
 *     over the old PR in one session yields ONE badge, on the heaviest.
 *  3. A record can only be BROKEN, not established. An exercise's very first
 *     session sets the baseline silently and produces zero badges.
 *  4. One set can earn multiple badges at once — the metrics are independent.
 *  5. The failure + 0-reps exclusion applies identically.
 *
 * There are exactly three metrics. No reps badge (D-9) — so purely bodyweight
 * exercises never earn one. That is deliberate and already-decided; do not add
 * a fourth type.
 */
export function computePRAchievements(workouts: readonly Workout[]): PRAchievement[] {
  const ordered = [...workouts].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  )

  /** Running best per exercise per metric. */
  const best = new Map<string, MetricValues>()
  const achievements: PRAchievement[] = []

  for (const workout of ordered) {
    for (const entry of workout.exercises) {
      const title = entry.exerciseTitle

      // Best set THIS SESSION per metric, with the set that produced it.
      const sessionBest: Record<PRMetric, { value: number; setIndex: number } | null> =
        {
          weight: null,
          volume: null,
          oneRM: null,
        }

      let sawAnySet = false

      for (const set of entry.sets) {
        if (isExcludedSet(set)) continue
        sawAnySet = true

        const values = metricsFor(set)
        for (const metric of PR_METRICS) {
          const v = values[metric]
          if (v === null) continue
          const current = sessionBest[metric]
          if (!current || v > current.value) {
            sessionBest[metric] = { value: v, setIndex: set.setIndex }
          }
        }
      }

      if (!sawAnySet) continue

      const priorBest = best.get(title)

      if (!priorBest) {
        // Rule 3: the first session establishes the baseline SILENTLY.
        best.set(title, {
          weight: sessionBest.weight?.value ?? null,
          volume: sessionBest.volume?.value ?? null,
          oneRM: sessionBest.oneRM?.value ?? null,
        })
        continue
      }

      for (const metric of PR_METRICS) {
        const candidate = sessionBest[metric]
        if (!candidate) continue

        const previous = priorBest[metric]

        if (previous === null) {
          // No baseline for THIS metric yet (e.g. the first session was all
          // bodyweight, so weight was undefined). Establish it silently too —
          // a record can only be broken, not established.
          priorBest[metric] = candidate.value
          continue
        }

        if (candidate.value > previous) {
          // Rule 2: exactly one badge per metric per session, on the best set.
          achievements.push({
            exerciseTitle: title,
            metric,
            value: candidate.value,
            previous,
            date: workout.startTime,
            workoutId: workout.id,
            setIndex: candidate.setIndex,
          })
          priorBest[metric] = candidate.value
        }
      }
    }
  }

  return achievements
}

/** Badges for one workout, keyed `exerciseTitle::setIndex`, for the detail page. */
export function achievementsBySet(
  achievements: readonly PRAchievement[],
  workoutId: string,
): Map<string, PRMetric[]> {
  const map = new Map<string, PRMetric[]>()
  for (const a of achievements) {
    if (a.workoutId !== workoutId) continue
    const key = `${a.exerciseTitle}::${a.setIndex}`
    const list = map.get(key)
    if (list) list.push(a.metric)
    else map.set(key, [a.metric])
  }
  return map
}

/** Human label for a metric badge. */
export function metricLabel(metric: PRMetric): string {
  return metric === 'oneRM' ? '1RM PR' : `${metric} PR`
}
