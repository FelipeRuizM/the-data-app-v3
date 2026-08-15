import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { buildProfile } from '../lib/db'
import { calculateRunRecords } from './runRecords'
import type { Run } from '../types'

function run(over: Partial<Run>): Run {
  return {
    id: 'r',
    title: 'Run',
    description: '',
    startTime: new Date(2026, 0, 1, 7, 0),
    typeId: null,
    type: null,
    place: null,
    distanceKm: 5,
    durationSeconds: 1800,
    paceSecPerKm: 360,
    storedPace: '6:00',
    avgHeartRate: null,
    calories: null,
    difficulty: null,
    elevationGainM: null,
    maxElevationM: null,
    steps: null,
    people: [],
    shoes: null,
    watch: null,
    durationMinutes: 30,
    ...over,
  }
}

describe('calculateRunRecords', () => {
  it('picks the LOWEST pace as fastest — the one metric where lower wins', () => {
    const records = calculateRunRecords([
      run({ id: 'slow', paceSecPerKm: 400 }),
      run({ id: 'fast', paceSecPerKm: 300 }),
    ])
    const pace = records.find((r) => r.key === 'fastestPace')!
    expect(pace.runId).toBe('fast')
    expect(pace.value).toBe(300)
  })

  it('picks the highest for distance, duration, elevation and steps', () => {
    const records = calculateRunRecords([
      run({
        id: 'a',
        distanceKm: 5,
        durationSeconds: 1800,
        elevationGainM: 10,
        steps: 5000,
      }),
      run({
        id: 'b',
        distanceKm: 12,
        durationSeconds: 4000,
        elevationGainM: 300,
        steps: 14000,
      }),
    ])
    for (const key of [
      'longestDistance',
      'longestDuration',
      'mostElevation',
      'mostSteps',
    ] as const) {
      expect(records.find((r) => r.key === key)!.runId, key).toBe('b')
    }
  })

  it('skips metrics that were never recorded rather than reporting a zero', () => {
    const records = calculateRunRecords([run({ elevationGainM: null, steps: null })])
    expect(records.find((r) => r.key === 'mostElevation')).toBeUndefined()
    expect(records.find((r) => r.key === 'mostSteps')).toBeUndefined()
  })

  it('treats a real 0 elevation as eligible — flat runs count', () => {
    const records = calculateRunRecords([run({ elevationGainM: 0 })])
    expect(records.find((r) => r.key === 'mostElevation')!.value).toBe(0)
  })

  it('returns nothing for an empty history', () => {
    expect(calculateRunRecords([])).toEqual([])
  })

  it('carries the date and run id so each record links to its run', () => {
    const d = new Date(2026, 5, 9, 8, 0)
    const records = calculateRunRecords([run({ id: 'x', startTime: d })])
    expect(records[0]!.date).toEqual(d)
    expect(records[0]!.runId).toBe('x')
  })

  it('produces records from the real fixture without throwing', () => {
    const { profile } = buildProfile(fixture as never, {})
    const records = calculateRunRecords(profile.runs)
    expect(records.length).toBeGreaterThan(0)
    // Every record must point at a run that exists.
    for (const r of records) {
      expect(profile.runs.some((x) => x.id === r.runId)).toBe(true)
    }
  })
})
