import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTERS,
  UNCATEGORIZED,
  filterWorkouts,
  hasActiveFilters,
  withinRange,
  workoutFilterOptions,
  type WorkoutFilters,
} from './filters'
import type { Workout } from '../types'

function workout(over: Partial<Workout>): Workout {
  return {
    id: 'w',
    title: 'Workout',
    description: '',
    startTime: new Date(2026, 7, 14, 17, 0),
    endTime: null,
    place: null,
    category: null,
    avgHeartRate: null,
    people: [],
    exercises: [],
    durationMinutes: null,
    ...over,
  }
}

const filters = (over: Partial<WorkoutFilters>): WorkoutFilters => ({
  ...EMPTY_FILTERS,
  ...over,
})

describe('withinRange — inclusive by DAY, not by instant', () => {
  const aug14at17 = new Date(2026, 7, 14, 17, 0)

  it('includes a record on the end date logged after midnight', () => {
    // The bug this exists to prevent: `startTime <= to` with `to` at 00:00
    // makes a same-day range match nothing at all.
    const from = new Date(2026, 7, 14, 0, 0)
    const to = new Date(2026, 7, 14, 0, 0)
    expect(withinRange(aug14at17, from, to)).toBe(true)
  })

  it('includes a record on the start date', () => {
    expect(withinRange(aug14at17, new Date(2026, 7, 14, 23, 59), null)).toBe(true)
  })

  it('excludes days before and after', () => {
    expect(withinRange(aug14at17, new Date(2026, 7, 15), null)).toBe(false)
    expect(withinRange(aug14at17, null, new Date(2026, 7, 13))).toBe(false)
  })

  it('treats null bounds as unbounded', () => {
    expect(withinRange(aug14at17, null, null)).toBe(true)
  })

  it('compares calendar days across a year boundary', () => {
    const dec31 = new Date(2025, 11, 31, 22, 0)
    expect(withinRange(dec31, new Date(2026, 0, 1), null)).toBe(false)
    expect(withinRange(dec31, null, new Date(2025, 11, 31))).toBe(true)
  })
})

describe('filterWorkouts', () => {
  const push = workout({
    id: 'a',
    category: 'Push',
    place: 'Place A',
    people: ['Person A'],
  })
  const pull = workout({ id: 'b', category: 'Pull', place: 'Place B', people: [] })
  const none = workout({ id: 'c', category: null, place: null, people: ['Person B'] })
  const all = [push, pull, none]

  it('returns everything when no filter is set', () => {
    expect(filterWorkouts(all, EMPTY_FILTERS)).toHaveLength(3)
  })

  it('filters by category', () => {
    expect(filterWorkouts(all, filters({ category: 'Push' })).map((w) => w.id)).toEqual(
      ['a'],
    )
  })

  it('filters to uncategorized without matching a real category', () => {
    // "no category" and "no category filter" are different things.
    expect(
      filterWorkouts(all, filters({ category: UNCATEGORIZED })).map((w) => w.id),
    ).toEqual(['c'])
  })

  it('filters by place', () => {
    expect(filterWorkouts(all, filters({ place: 'Place B' })).map((w) => w.id)).toEqual(
      ['b'],
    )
  })

  it('filters by person against the people array, not equality', () => {
    expect(
      filterWorkouts(all, filters({ person: 'Person A' })).map((w) => w.id),
    ).toEqual(['a'])
  })

  it('excludes workouts with nobody when a person filter is set', () => {
    expect(
      filterWorkouts(all, filters({ person: 'Person A' })).map((w) => w.id),
    ).not.toContain('b')
  })

  it('combines filters with AND', () => {
    expect(
      filterWorkouts(all, filters({ category: 'Push', place: 'Place B' })),
    ).toHaveLength(0)
    expect(
      filterWorkouts(all, filters({ category: 'Push', place: 'Place A' })).map(
        (w) => w.id,
      ),
    ).toEqual(['a'])
  })

  it('filters by date range inclusively', () => {
    const older = workout({ id: 'old', startTime: new Date(2026, 6, 1, 9, 0) })
    const list = [push, older]
    expect(
      filterWorkouts(list, filters({ from: new Date(2026, 7, 1) })).map((w) => w.id),
    ).toEqual(['a'])
    expect(
      filterWorkouts(list, filters({ to: new Date(2026, 6, 1) })).map((w) => w.id),
    ).toEqual(['old'])
  })

  it('never mutates the input array', () => {
    const input = [...all]
    filterWorkouts(input, filters({ category: 'Push' }))
    expect(input).toHaveLength(3)
  })
})

describe('workoutFilterOptions', () => {
  it('derives options from the records present, sorted', () => {
    const list = [
      workout({ category: 'Pull', place: 'Place B', people: ['Person B'] }),
      workout({ category: 'Push', place: 'Place A', people: ['Person A', 'Person B'] }),
    ]
    const o = workoutFilterOptions(list)
    expect(o.categories).toEqual(['Pull', 'Push'])
    expect(o.places).toEqual(['Place A', 'Place B'])
    expect(o.people).toEqual(['Person A', 'Person B'])
    expect(o.hasUncategorized).toBe(false)
  })

  it('flags the uncategorized bucket only when one exists', () => {
    expect(workoutFilterOptions([workout({ category: null })]).hasUncategorized).toBe(
      true,
    )
    expect(workoutFilterOptions([workout({ category: 'Push' })]).hasUncategorized).toBe(
      false,
    )
  })

  it('keeps a category that /config no longer defines', () => {
    // A deleted category still exists on old records and must stay filterable.
    expect(
      workoutFilterOptions([workout({ category: 'Retired Split' })]).categories,
    ).toEqual(['Retired Split'])
  })

  it('deduplicates people appearing across many workouts', () => {
    const list = [
      workout({ people: ['Person A'] }),
      workout({ people: ['Person A', 'Person C'] }),
    ]
    expect(workoutFilterOptions(list).people).toEqual(['Person A', 'Person C'])
  })

  it('returns empty options for an empty list', () => {
    const o = workoutFilterOptions([])
    expect(o.categories).toEqual([])
    expect(o.places).toEqual([])
    expect(o.people).toEqual([])
    expect(o.hasUncategorized).toBe(false)
  })
})

describe('hasActiveFilters', () => {
  it('is false for the empty filter set', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })
  it('is true when any single filter is set', () => {
    expect(hasActiveFilters(filters({ category: 'Push' }))).toBe(true)
    expect(hasActiveFilters(filters({ place: 'Place A' }))).toBe(true)
    expect(hasActiveFilters(filters({ person: 'Person A' }))).toBe(true)
    expect(hasActiveFilters(filters({ from: new Date() }))).toBe(true)
    expect(hasActiveFilters(filters({ to: new Date() }))).toBe(true)
  })
})
