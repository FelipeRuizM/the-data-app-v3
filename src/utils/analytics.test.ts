import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { buildProfile } from '../lib/db'
import { CONFIG_DEFAULTS } from '../lib/config'
import { recentActivity } from '../categories/registry'
import {
  activeHourRange,
  activityHeatmap,
  crossTotals,
  partnerBreakdown,
  placeBreakdown,
  weeklyStreaks,
} from './analytics'
import type { ActivityItem } from '../types'

/* ── builders ───────────────────────────────────────────────────────────── */

let n = 0
function item(startTime: Date, over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: `a${++n}`,
    categoryId: 'workouts',
    title: 'Session',
    startTime,
    label: null,
    colorToken: 'cat-none',
    metric: '0',
    durationMinutes: 60,
    place: null,
    people: [],
    avgHeartRate: null,
    ...over,
  }
}

/** Sunday 2 Aug 2026 is the reference week start throughout. */
const sunday = (weekOffset: number, day = 0, hour = 12) =>
  new Date(2026, 7, 2 + weekOffset * 7 + day, hour, 0)

/* ── streaks (D-15) ─────────────────────────────────────────────────────── */

describe('weeklyStreaks', () => {
  it('counts consecutive WEEKS, so a rest day never breaks a streak', () => {
    // Three weeks, one session each, on different weekdays.
    const items = [item(sunday(0, 1)), item(sunday(1, 4)), item(sunday(2, 6))]
    const { current, longest } = weeklyStreaks(items, sunday(2, 6))
    expect(current).toBe(3)
    expect(longest?.weeks).toBe(3)
  })

  it('treats several sessions in one week as one week', () => {
    const items = [item(sunday(0, 0)), item(sunday(0, 2)), item(sunday(0, 5))]
    expect(weeklyStreaks(items, sunday(0, 5)).longest?.weeks).toBe(1)
  })

  it('breaks the run on a missed week', () => {
    const items = [item(sunday(0)), item(sunday(1)), item(sunday(3)), item(sunday(4))]
    const { longest } = weeklyStreaks(items, sunday(4))
    expect(longest?.weeks).toBe(2)
  })

  it('keeps the streak alive through an empty CURRENT week', () => {
    // Trained for three weeks, and it is now Sunday morning of the fourth with
    // nothing logged yet. There is still a week left to train — reporting zero
    // here would be false discouragement.
    const items = [item(sunday(0)), item(sunday(1)), item(sunday(2))]
    expect(weeklyStreaks(items, sunday(3, 0, 9)).current).toBe(3)
  })

  it('ends the streak once a whole week has been missed', () => {
    const items = [item(sunday(0)), item(sunday(1)), item(sunday(2))]
    expect(weeklyStreaks(items, sunday(4)).current).toBe(0)
  })

  it('reports the longest run’s date range, Sunday through Saturday', () => {
    const { longest } = weeklyStreaks(
      [item(sunday(0, 3)), item(sunday(1, 3))],
      sunday(1, 3),
    )
    expect(longest?.from.getDay()).toBe(0) // Sunday
    expect(longest?.to.getDay()).toBe(6) // Saturday
    expect(longest?.from.getDate()).toBe(2)
  })

  it('keeps the longest even when the current run is shorter', () => {
    const items = [
      item(sunday(0)),
      item(sunday(1)),
      item(sunday(2)),
      // gap
      item(sunday(5)),
    ]
    const { current, longest } = weeklyStreaks(items, sunday(5))
    expect(current).toBe(1)
    expect(longest?.weeks).toBe(3)
  })

  it('counts any category, not just one', () => {
    const items = [
      item(sunday(0), { categoryId: 'workouts' }),
      item(sunday(1), { categoryId: 'runs' }),
    ]
    expect(weeklyStreaks(items, sunday(1)).current).toBe(2)
  })

  it('is empty, not zero-length, for a profile with nothing in it', () => {
    expect(weeklyStreaks([], sunday(0))).toEqual({ current: 0, longest: null })
  })

  it('uses SUNDAY as the week start, not Monday', () => {
    // Sat 8 Aug and Sun 9 Aug are ADJACENT days but different weeks under a
    // Sunday start — so this is a 2-week streak, not a 1-week one. Under a
    // Monday start it would be a single week, which is the bug this guards.
    const saturday = new Date(2026, 7, 8, 12, 0)
    const nextSunday = new Date(2026, 7, 9, 12, 0)
    expect(weeklyStreaks([item(saturday), item(nextSunday)], nextSunday).current).toBe(
      2,
    )
  })
})

/* ── heatmap ────────────────────────────────────────────────────────────── */

describe('activityHeatmap', () => {
  it('returns all 168 cells, zeroes included', () => {
    const { cells } = activityHeatmap([item(sunday(0, 0, 9))])
    expect(cells).toHaveLength(7 * 24)
    // The renderer needs the zeroes: "never" is drawn as an outline, not as the
    // palest ramp step (§5).
    expect(cells.filter((c) => c.count === 0)).toHaveLength(167)
  })

  it('buckets by weekday and hour from the wall clock', () => {
    const { cells, max } = activityHeatmap([
      item(new Date(2026, 7, 4, 18, 30)), // Tuesday 18:xx
      item(new Date(2026, 7, 11, 18, 5)), // Tuesday 18:xx
      item(new Date(2026, 7, 5, 7, 0)), // Wednesday 07:xx
    ])
    expect(cells.find((c) => c.day === 2 && c.hour === 18)?.count).toBe(2)
    expect(cells.find((c) => c.day === 3 && c.hour === 7)?.count).toBe(1)
    expect(max).toBe(2)
  })

  it('has a max of zero for an empty profile, which the ramp must survive', () => {
    const { max, total } = activityHeatmap([])
    expect(max).toBe(0)
    expect(total).toBe(0)
  })
})

describe('activeHourRange', () => {
  it('trims dead hours but keeps a one-hour margin', () => {
    const heatmap = activityHeatmap([
      item(new Date(2026, 7, 4, 9, 0)),
      item(new Date(2026, 7, 5, 19, 0)),
    ])
    expect(activeHourRange(heatmap)).toEqual({ from: 8, to: 20 })
  })

  it('clamps at midnight and 23:00', () => {
    const heatmap = activityHeatmap([
      item(new Date(2026, 7, 4, 0, 0)),
      item(new Date(2026, 7, 5, 23, 0)),
    ])
    expect(activeHourRange(heatmap)).toEqual({ from: 0, to: 23 })
  })

  it('falls back to a sensible window when there is nothing', () => {
    expect(activeHourRange(activityHeatmap([]))).toEqual({ from: 6, to: 22 })
  })
})

/* ── breakdowns ─────────────────────────────────────────────────────────── */

describe('placeBreakdown', () => {
  it('counts by place, most used first', () => {
    const items = [
      item(sunday(0), { place: 'Gym A' }),
      item(sunday(1), { place: 'Gym B' }),
      item(sunday(2), { place: 'Gym A' }),
    ]
    expect(placeBreakdown(items)).toEqual([
      { name: 'Gym A', count: 2 },
      { name: 'Gym B', count: 1 },
    ])
  })

  it('excludes unrecorded places rather than bucketing them as Unknown', () => {
    const items = [
      item(sunday(0), { place: null }),
      item(sunday(1), { place: 'Gym A' }),
    ]
    expect(placeBreakdown(items)).toEqual([{ name: 'Gym A', count: 1 }])
  })
})

describe('partnerBreakdown', () => {
  it('counts each person once per session, across every category', () => {
    const items = [
      item(sunday(0), { people: ['Ana', 'Bo'] }),
      item(sunday(1), { people: ['Ana'], categoryId: 'runs' }),
      item(sunday(2), { people: [] }),
    ]
    expect(partnerBreakdown(items)).toEqual([
      { name: 'Ana', count: 2 },
      { name: 'Bo', count: 1 },
    ])
  })
})

/* ── totals ─────────────────────────────────────────────────────────────── */

describe('crossTotals', () => {
  it('sums durations and averages only what was recorded', () => {
    const items = [
      item(sunday(0), { durationMinutes: 60, avgHeartRate: 140 }),
      item(sunday(1), { durationMinutes: 30, avgHeartRate: null }),
    ]
    const totals = crossTotals(items)
    expect(totals.activities).toBe(2)
    expect(totals.totalMinutes).toBe(90)
    expect(totals.avgMinutes).toBe(45)
    // The unrecorded HR is out of the denominator too — 140, not 70.
    expect(totals.avgHeartRate).toBe(140)
  })

  it('returns null rather than a misleading zero when nothing is recorded', () => {
    const items = [item(sunday(0), { durationMinutes: null, avgHeartRate: null })]
    const totals = crossTotals(items)
    expect(totals.totalMinutes).toBeNull()
    expect(totals.avgMinutes).toBeNull()
    expect(totals.avgHeartRate).toBeNull()
    expect(totals.activities).toBe(1)
  })
})

/* ── against the real fixture, through the registry ─────────────────────── */

describe('the whole pipeline, registry-driven', () => {
  const { profile } = buildProfile(fixture as never, {})
  const items = recentActivity(profile, CONFIG_DEFAULTS)

  it('covers every category’s records, not just workouts', () => {
    expect(items).toHaveLength(profile.workouts.length + profile.runs.length)
    expect(new Set(items.map((i) => i.categoryId))).toEqual(
      new Set(['workouts', 'runs']),
    )
  })

  it('never lets a 0-sentinel heart rate reach the average (§3.2)', () => {
    // The fixture deliberately holds `avg_heart_rate: 0` on both a workout and
    // a run. If either leaked through, this average would be dragged down.
    expect(items.some((i) => i.avgHeartRate === 0)).toBe(false)
    const totals = crossTotals(items)
    expect(totals.avgHeartRate).not.toBeNull()
    expect(totals.avgHeartRate!).toBeGreaterThan(60)
  })

  it('breaks down places across both categories', () => {
    const places = placeBreakdown(items)
    expect(places.length).toBeGreaterThan(0)
    const total = places.reduce((n, p) => n + p.count, 0)
    expect(total).toBeLessThanOrEqual(items.length)
  })

  it('produces a streak that is never longer than the active weeks', () => {
    const { longest } = weeklyStreaks(items, new Date(2026, 7, 15))
    expect(longest!.weeks).toBeLessThanOrEqual(crossTotals(items).activeWeeks)
  })
})
