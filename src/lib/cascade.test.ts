import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import {
  countReferences,
  describeImpact,
  planRename,
  rawEntries,
  type CascadeSource,
} from './cascade'
import type { RawRun, RawSettings, RawWorkout } from '../types'

/**
 * The cascade is the one place a mistake rewrites history rather than a view,
 * so these run against the committed fixture as well as hand-built cases.
 */

const source: CascadeSource = {
  uid: 'owner',
  workouts: fixture.workouts as unknown as Record<string, RawWorkout>,
  runs: fixture.runs as unknown as Record<string, RawRun>,
  settings: fixture.settings as unknown as RawSettings,
}

/* ── rawEntries — keys are addresses, so they must survive ──────────────── */

describe('rawEntries', () => {
  it('keeps array indices as keys', () => {
    expect(rawEntries(['a', 'b'])).toEqual([
      ['0', 'a'],
      ['1', 'b'],
    ])
  })

  it('keeps object keys when RTDB returned the node sparse (§3.8)', () => {
    expect(rawEntries({ '0': 'a', '2': 'c' })).toEqual([
      ['0', 'a'],
      ['2', 'c'],
    ])
  })

  it('drops holes but does NOT renumber the survivors', () => {
    // Renumbering would make the plan address the wrong element.
    const sparse = ['a', null, 'c'] as unknown as string[]
    expect(rawEntries(sparse)).toEqual([
      ['0', 'a'],
      ['2', 'c'],
    ])
  })

  it('treats a missing node as nothing to rewrite', () => {
    expect(rawEntries(undefined)).toEqual([])
    expect(rawEntries(null)).toEqual([])
  })
})

/* ── exercises ──────────────────────────────────────────────────────────── */

describe('planRename — exercises', () => {
  it('rewrites exercise_title at its exact path in every workout that uses it', () => {
    const plan = planRename(source, 'exercise', 'Triceps Pushdown', 'Tricep Pushdown')
    const paths = Object.keys(plan.updates).filter((p) => p.includes('/exercises/'))

    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      expect(p).toMatch(
        /^users\/owner\/workouts\/[^/]+\/exercises\/\d+\/exercise_title$/,
      )
      expect(plan.updates[p]).toBe('Tricep Pushdown')
    }
  })

  it('counts records, and the count matches what the fixture actually holds', () => {
    const plan = planRename(source, 'exercise', 'Triceps Pushdown', 'X')
    const actual = Object.values(source.workouts).filter((w) =>
      rawEntries(w.exercises).some(([, e]) => e?.exercise_title === 'Triceps Pushdown'),
    ).length
    expect(plan.workouts).toBe(actual)
    expect(plan.records).toBe(actual)
    expect(plan.runs).toBe(0)
  })

  it('counts a workout once even when it holds the same exercise twice', () => {
    const twice: CascadeSource = {
      uid: 'u',
      workouts: {
        w1: {
          exercises: [
            { exercise_title: 'Squat', sets: [] },
            { exercise_title: 'Squat', sets: [] },
          ],
        },
      },
      runs: {},
      settings: undefined,
    }
    const plan = planRename(twice, 'exercise', 'Squat', 'Back Squat')
    // Two paths rewritten, but one record affected — the dialog says "1 workout".
    expect(Object.keys(plan.updates)).toHaveLength(2)
    expect(plan.workouts).toBe(1)
  })

  it('renames inside the featured shortlist too, without counting it as a record', () => {
    const featured = fixture.settings.featuredExercises
    const name = featured[0]!
    const plan = planRename(source, 'exercise', name, 'Renamed')

    expect(plan.featured).toBe(true)
    expect(plan.updates['users/owner/settings/featuredExercises']).toContain('Renamed')
    // Curation is not history: the record count must not be inflated by it.
    expect(plan.records).toBe(plan.workouts + plan.runs)
  })

  it('leaves runs alone — a run has no exercises', () => {
    const plan = planRename(source, 'exercise', 'Triceps Pushdown', 'X')
    expect(Object.keys(plan.updates).some((p) => p.includes('/runs/'))).toBe(false)
  })

  it('produces nothing for a name no record uses', () => {
    const plan = planRename(source, 'exercise', 'Nonexistent Lift', 'X')
    expect(plan.updates).toEqual({})
    expect(plan.records).toBe(0)
  })
})

/* ── places ─────────────────────────────────────────────────────────────── */

describe('planRename — places', () => {
  it('rewrites a workout gym AND a run location — one places concept, two fields (§3.4)', () => {
    const plan = planRename(source, 'place', 'Place C', 'Place Ç')
    const paths = Object.keys(plan.updates)

    expect(paths.some((p) => p.endsWith('/gym'))).toBe(true)
    expect(paths.some((p) => p.endsWith('/location'))).toBe(true)
    expect(plan.workouts).toBeGreaterThan(0)
    expect(plan.runs).toBeGreaterThan(0)
    expect(plan.records).toBe(plan.workouts + plan.runs)
  })
})

/* ── people ─────────────────────────────────────────────────────────────── */

describe('planRename — people', () => {
  it('rewrites the whole people list, not one index', () => {
    const plan = planRename(source, 'person', 'Person A', 'Ana')
    const path = Object.keys(plan.updates).find((p) => p.endsWith('/people'))
    expect(path).toBeDefined()
    expect(Array.isArray(plan.updates[path!])).toBe(true)
    expect(plan.updates[path!]).toContain('Ana')
    expect(plan.updates[path!]).not.toContain('Person A')
  })

  it('collapses the duplicate a merge would otherwise create', () => {
    // Merging A into B on a record that already lists B must leave ONE entry.
    const both: CascadeSource = {
      uid: 'u',
      workouts: { w1: { people: ['Person A', 'Person B'] } },
      runs: {},
      settings: undefined,
    }
    const plan = planRename(both, 'person', 'Person A', 'Person B')
    expect(plan.updates['users/u/workouts/w1/people']).toEqual(['Person B'])
  })

  it('rewrites a run’s people as well', () => {
    const withPeople = Object.entries(source.runs).find(
      ([, r]) => rawEntries(r.people).length > 0,
    )
    expect(withPeople).toBeDefined()
    const name = rawEntries(withPeople![1].people)[0]![1]
    const plan = planRename(source, 'person', name, 'Someone Else')
    expect(plan.runs).toBeGreaterThan(0)
  })
})

/* ── counting, which is what gates a delete ─────────────────────────────── */

describe('countReferences', () => {
  it('reports zero for a name nothing uses — the only case a delete is legal (D-5)', () => {
    expect(countReferences(source, 'place', 'Nowhere').records).toBe(0)
  })

  it('reports the same totals the rename plan would touch', () => {
    const counted = countReferences(source, 'place', 'Place C')
    const planned = planRename(source, 'place', 'Place C', 'Elsewhere')
    // Same traversal, so a delete can never disagree with a rename about what
    // counts as a reference.
    expect(counted.records).toBe(planned.records)
    expect(counted.workouts).toBe(planned.workouts)
    expect(counted.runs).toBe(planned.runs)
  })

  it('notices a featured-only exercise, which does not block a delete', () => {
    const onlyFeatured: CascadeSource = {
      uid: 'u',
      workouts: {},
      runs: {},
      settings: { featuredExercises: ['Ghost Lift'] },
    }
    const refs = countReferences(onlyFeatured, 'exercise', 'Ghost Lift')
    expect(refs.records).toBe(0)
    expect(refs.featured).toBe(true)
  })
})

/* ── the sentence the dialog shows ──────────────────────────────────────── */

describe('describeImpact', () => {
  it('says nothing is affected when nothing is', () => {
    expect(describeImpact({ workouts: 0, runs: 0, records: 0 })).toMatch(/No logged/)
  })

  it('names both collections when both are hit', () => {
    expect(describeImpact({ workouts: 3, runs: 2, records: 5 })).toBe(
      '3 workouts and 2 runs will be rewritten.',
    )
  })

  it('singularises', () => {
    expect(describeImpact({ workouts: 1, runs: 0, records: 1 })).toBe(
      '1 workout will be rewritten.',
    )
  })
})
