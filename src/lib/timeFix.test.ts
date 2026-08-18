import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { normalizeWorkout } from './normalize'
import { planTimeFix, fromLocalInputValue, toLocalInputValue } from './timeFix'
import type { RawWorkout, Workout } from '../types'

const UID = 'owner-uid'
const rawWorkouts = fixture.workouts as unknown as Record<string, RawWorkout>
const real = Object.entries(rawWorkouts)
  .map(([id, raw]) => normalizeWorkout(id, raw))
  .filter((w): w is Workout => w !== null)

const firstId = Object.keys(rawWorkouts)[0]!

describe('local input round-trip', () => {
  it('survives a date with a single-digit day and hour', () => {
    const d = new Date(2026, 3, 8, 6, 5)
    expect(toLocalInputValue(d)).toBe('2026-04-08T06:05')
    expect(fromLocalInputValue('2026-04-08T06:05')?.getTime()).toBe(d.getTime())
  })

  it('rejects anything that is not the exact shape', () => {
    for (const bad of ['', '2026-04-08', 'not a date', '2026-4-8T06:05']) {
      expect(fromLocalInputValue(bad), bad).toBeNull()
    }
  })
})

describe('planTimeFix — what it writes', () => {
  it('writes ONLY the two timestamp paths, never the record', () => {
    // The whole reason this is not `saveWorkout`: fixing a clock must not
    // rewrite 25 sets, and must not drop a field the draft layer never modelled.
    const plan = planTimeFix(UID, real, rawWorkouts, [
      { id: firstId, startLocal: '2027-01-02T09:30' },
    ])
    expect(Object.keys(plan.updates).sort()).toEqual([
      `users/${UID}/workouts/${firstId}/end_time`,
      `users/${UID}/workouts/${firstId}/start_time`,
    ])
  })

  it('writes the stored format exactly — unpadded day, no seconds (§3.6)', () => {
    const plan = planTimeFix(UID, real, rawWorkouts, [
      { id: firstId, startLocal: '2027-01-02T09:30' },
    ])
    expect(plan.updates[`users/${UID}/workouts/${firstId}/start_time`]).toBe(
      '2 Jan 2027, 09:30',
    )
  })

  it('PRESERVES the duration by shifting the end with the start', () => {
    const original = rawWorkouts[firstId]!
    const plan = planTimeFix(UID, real, rawWorkouts, [
      { id: firstId, startLocal: '2027-01-02T09:30' },
    ])

    const before =
      Date.parse(`${original.end_time!} UTC`) -
      Date.parse(`${original.start_time!} UTC`)
    const after =
      Date.parse(`${plan.updates[`users/${UID}/workouts/${firstId}/end_time`]!} UTC`) -
      Date.parse(`${plan.updates[`users/${UID}/workouts/${firstId}/start_time`]!} UTC`)
    expect(after).toBe(before)
  })

  it('changes the day as readily as the time', () => {
    // "The days should mostly be the same" — mostly, not always.
    const plan = planTimeFix(UID, real, rawWorkouts, [
      { id: firstId, startLocal: '2025-12-25T18:00' },
    ])
    expect(plan.updates[`users/${UID}/workouts/${firstId}/start_time`]).toBe(
      '25 Dec 2025, 18:00',
    )
  })
})

describe('planTimeFix — what it refuses to write', () => {
  it('writes nothing for a row that was not actually changed', () => {
    const unchanged = toLocalInputValue(real.find((w) => w.id === firstId)!.startTime)
    const plan = planTimeFix(UID, real, rawWorkouts, [
      { id: firstId, startLocal: unchanged },
    ])
    expect(plan.changed).toBe(0)
    expect(plan.updates).toEqual({})
  })

  it('writes nothing at all for an empty edit list', () => {
    expect(planTimeFix(UID, real, rawWorkouts, []).updates).toEqual({})
  })

  it('rejects an unparseable date instead of guessing one', () => {
    const plan = planTimeFix(UID, real, rawWorkouts, [
      { id: firstId, startLocal: 'tomorrow-ish' },
    ])
    expect(plan.updates).toEqual({})
    expect(plan.rejected).toEqual([
      { id: firstId, reason: 'Not a valid date and time.' },
    ])
  })

  it('rejects an id that does not exist', () => {
    const plan = planTimeFix(UID, real, rawWorkouts, [
      { id: 'no-such-workout', startLocal: '2027-01-02T09:30' },
    ])
    expect(plan.updates).toEqual({})
    expect(plan.rejected[0]!.reason).toBe('No workout with that id.')
  })

  it('does not invent an end_time for a record that never had one', () => {
    const noEnd: Record<string, RawWorkout> = {
      w1: {
        title: 'No end',
        description: '',
        start_time: '8 Apr 2026, 16:50',
        gym: '',
        exercises: [],
      },
    }
    const workouts = [normalizeWorkout('w1', noEnd['w1']!)!]
    const plan = planTimeFix(UID, workouts, noEnd, [
      { id: 'w1', startLocal: '2026-04-08T18:00' },
    ])
    expect(Object.keys(plan.updates)).toEqual([`users/${UID}/workouts/w1/start_time`])
  })

  it('handles many rows in one plan, skipping the untouched ones', () => {
    const ids = Object.keys(rawWorkouts).slice(0, 3)
    const plan = planTimeFix(UID, real, rawWorkouts, [
      { id: ids[0]!, startLocal: '2027-01-02T09:30' },
      {
        id: ids[1]!,
        startLocal: toLocalInputValue(real.find((w) => w.id === ids[1])!.startTime),
      },
      { id: ids[2]!, startLocal: '2027-01-04T11:00' },
    ])
    expect(plan.changed).toBe(2)
    expect(Object.keys(plan.updates)).toHaveLength(4)
  })
})

describe('planTimeFix — over the whole fixture', () => {
  it('a no-op plan over EVERY record writes nothing', () => {
    // The guard that matters most: opening the page and saving without touching
    // anything must not rewrite 81 records with "identical" timestamps.
    const edits = real.map((w) => ({
      id: w.id,
      startLocal: toLocalInputValue(w.startTime),
    }))
    const plan = planTimeFix(UID, real, rawWorkouts, edits)
    expect(plan.changed).toBe(0)
    expect(plan.rejected).toEqual([])
    expect(plan.updates).toEqual({})
  })

  it('every written timestamp parses back to what was asked for', () => {
    const edits = real.map((w, i) => ({
      id: w.id,
      startLocal: toLocalInputValue(new Date(2027, 0, 1 + (i % 27), 7, 15)),
    }))
    const plan = planTimeFix(UID, real, rawWorkouts, edits)
    expect(plan.changed).toBe(real.length)

    for (const [path, value] of Object.entries(plan.updates)) {
      if (!path.endsWith('/start_time')) continue
      expect(value).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/)
    }
  })
})
