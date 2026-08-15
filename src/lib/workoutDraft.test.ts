import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { normalizeWorkout, toList } from './normalize'
import {
  buildRawWorkout,
  draftFromWorkout,
  emptyExerciseGroup,
  emptySet,
  emptyWorkoutDraft,
  type WorkoutDraft,
} from './workoutDraft'
import type { RawWorkout } from '../types'

const fixtureWorkouts = fixture.workouts as unknown as Record<string, RawWorkout>

function minimalValidDraft(over: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    title: 'Leg day',
    description: '',
    startLocal: '2026-04-08T16:50',
    endLocal: '2026-04-08T17:50',
    place: '',
    category: '',
    avgHeartRate: '',
    people: [],
    exercises: [
      {
        exercise: { exerciseTitle: 'Squat (Barbell)', notes: '' },
        sets: [{ setType: 'normal', reps: '5', weight: '100', durationSeconds: '' }],
      },
    ],
    ...over,
  }
}

describe('buildRawWorkout — validation', () => {
  it('rejects an empty draft with the fields actually wrong', () => {
    const result = buildRawWorkout(emptyWorkoutDraft())
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    const fields = result.errors.map((e) => e.field)
    expect(fields).toContain('title')
    expect(fields).toContain('exercises')
  })

  it('requires end to be after start', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        startLocal: '2026-04-08T17:00',
        endLocal: '2026-04-08T16:00',
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.errors.some((e) => e.field === 'endLocal')).toBe(true)
  })

  it('rejects end equal to start — a zero-length session', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        startLocal: '2026-04-08T17:00',
        endLocal: '2026-04-08T17:00',
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('requires at least one exercise with a title', () => {
    const result = buildRawWorkout(
      minimalValidDraft({ exercises: [emptyExerciseGroup()] }),
    )
    expect(result.ok).toBe(false)
  })

  it('requires every titled exercise to have at least one set', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        exercises: [
          { exercise: { exerciseTitle: 'Squat (Barbell)', notes: '' }, sets: [] },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.errors.some((e) => /at least one set/.test(e.message))).toBe(true)
  })

  it('accepts a minimal valid draft', () => {
    expect(buildRawWorkout(minimalValidDraft()).ok).toBe(true)
  })
})

describe('buildRawWorkout — byte-compatible omission rules (§3.1, D-7b)', () => {
  it('always writes gym, even as an empty string — the field is never omitted', () => {
    const result = buildRawWorkout(minimalValidDraft({ place: '' }))
    if (!result.ok) throw new Error('expected success')
    expect('gym' in result.raw).toBe(true)
    expect(result.raw.gym).toBe('')
  })

  it('omits category when blank', () => {
    const result = buildRawWorkout(minimalValidDraft({ category: '' }))
    if (!result.ok) throw new Error('expected success')
    expect('category' in result.raw).toBe(false)
  })

  it('writes category when set', () => {
    const result = buildRawWorkout(minimalValidDraft({ category: 'Push' }))
    if (!result.ok) throw new Error('expected success')
    expect(result.raw.category).toBe('Push')
  })

  it('omits avg_heart_rate when blank', () => {
    const result = buildRawWorkout(minimalValidDraft({ avgHeartRate: '' }))
    if (!result.ok) throw new Error('expected success')
    expect('avg_heart_rate' in result.raw).toBe(false)
  })

  it('omits avg_heart_rate for a typed 0 — it would just re-read as absent anyway', () => {
    const result = buildRawWorkout(minimalValidDraft({ avgHeartRate: '0' }))
    if (!result.ok) throw new Error('expected success')
    expect('avg_heart_rate' in result.raw).toBe(false)
  })

  it('writes a real avg_heart_rate', () => {
    const result = buildRawWorkout(minimalValidDraft({ avgHeartRate: '142' }))
    if (!result.ok) throw new Error('expected success')
    expect(result.raw.avg_heart_rate).toBe(142)
  })

  it('omits people when none were added', () => {
    const result = buildRawWorkout(minimalValidDraft({ people: [] }))
    if (!result.ok) throw new Error('expected success')
    expect('people' in result.raw).toBe(false)
  })

  it('writes people when present', () => {
    const result = buildRawWorkout(
      minimalValidDraft({ people: ['Person A', 'Person B'] }),
    )
    if (!result.ok) throw new Error('expected success')
    expect(result.raw.people).toEqual(['Person A', 'Person B'])
  })

  it('omits weight_kg for an empty weight field — bodyweight', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        exercises: [
          {
            exercise: { exerciseTitle: 'Pull Up', notes: '' },
            sets: [{ setType: 'normal', reps: '8', weight: '', durationSeconds: '' }],
          },
        ],
      }),
    )
    if (!result.ok) throw new Error('expected success')
    expect('weight_kg' in toList(toList(result.raw.exercises)[0]!.sets)[0]!).toBe(false)
  })

  it('writes a literal weight_kg: 0 for a typed "0" — a genuine zero, not bodyweight', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        exercises: [
          {
            exercise: { exerciseTitle: 'Assisted Dip', notes: '' },
            sets: [{ setType: 'normal', reps: '8', weight: '0', durationSeconds: '' }],
          },
        ],
      }),
    )
    if (!result.ok) throw new Error('expected success')
    expect(toList(toList(result.raw.exercises)[0]!.sets)[0]!.weight_kg).toBe(0)
  })

  it('omits reps when blank — one real set in the export genuinely lacks it', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        exercises: [
          {
            exercise: { exerciseTitle: 'Plank', notes: '' },
            sets: [{ setType: 'normal', reps: '', weight: '', durationSeconds: '60' }],
          },
        ],
      }),
    )
    if (!result.ok) throw new Error('expected success')
    expect('reps' in toList(toList(result.raw.exercises)[0]!.sets)[0]!).toBe(false)
  })

  it('omits exercise_notes when blank', () => {
    const result = buildRawWorkout(minimalValidDraft())
    if (!result.ok) throw new Error('expected success')
    expect('exercise_notes' in toList(result.raw.exercises)[0]!).toBe(false)
  })

  it('writes exercise_notes when present', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        exercises: [
          {
            exercise: { exerciseTitle: 'Squat (Barbell)', notes: 'felt heavy' },
            sets: [
              { setType: 'normal', reps: '5', weight: '100', durationSeconds: '' },
            ],
          },
        ],
      }),
    )
    if (!result.ok) throw new Error('expected success')
    expect(toList(result.raw.exercises)[0]!.exercise_notes).toBe('felt heavy')
  })

  it('assigns set_index by array order, not by anything the user typed', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        exercises: [
          {
            exercise: { exerciseTitle: 'Squat (Barbell)', notes: '' },
            sets: [emptySet(), emptySet(), emptySet()].map((s) => ({
              ...s,
              reps: '5',
            })),
          },
        ],
      }),
    )
    if (!result.ok) throw new Error('expected success')
    expect(
      toList(toList(result.raw.exercises)[0]!.sets).map((s) => s.set_index),
    ).toEqual([0, 1, 2])
  })

  it('drops an exercise group whose title is blank rather than writing a nameless entry', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        exercises: [
          minimalValidDraft().exercises[0]!,
          { exercise: { exerciseTitle: '   ', notes: '' }, sets: [emptySet()] },
        ],
      }),
    )
    if (!result.ok) throw new Error('expected success')
    expect(result.raw.exercises).toHaveLength(1)
  })

  it('trims title, description and gym', () => {
    const result = buildRawWorkout(
      minimalValidDraft({
        title: '  Leg day  ',
        description: '  notes  ',
        place: '  Gym A  ',
      }),
    )
    if (!result.ok) throw new Error('expected success')
    expect(result.raw.title).toBe('Leg day')
    expect(result.raw.description).toBe('notes')
    expect(result.raw.gym).toBe('Gym A')
  })
})

describe('draftFromWorkout / buildRawWorkout — round-trip through the real fixture', () => {
  const cases = Object.entries(fixtureWorkouts)

  it('round-trips every fixture workout through normalize → draft → build → normalize', () => {
    for (const [id, raw] of cases) {
      const original = normalizeWorkout(id, raw)
      expect(original, `fixture workout ${id} failed to normalize`).not.toBeNull()

      const draft = draftFromWorkout(original!)
      const rebuilt = buildRawWorkout(draft)
      expect(rebuilt.ok, `round-trip failed validation for ${id}`).toBe(true)
      if (!rebuilt.ok) continue

      const reNormalized = normalizeWorkout(id, rebuilt.raw)
      expect(reNormalized).not.toBeNull()

      // Compare the parts a round-trip must preserve exactly. Dates compare by
      // value; everything else structurally.
      expect(reNormalized!.title).toBe(original!.title)
      expect(reNormalized!.description).toBe(original!.description)
      expect(reNormalized!.startTime.getTime()).toBe(original!.startTime.getTime())
      expect(reNormalized!.endTime?.getTime()).toBe(original!.endTime?.getTime())
      expect(reNormalized!.place).toBe(original!.place)
      expect(reNormalized!.category).toBe(original!.category)
      expect(reNormalized!.avgHeartRate).toBe(original!.avgHeartRate)
      expect(reNormalized!.people).toEqual(original!.people)

      // set_index is deliberately reassigned by array order on every write
      // (documented above), so it's compared separately: it must always come
      // out 0-based and contiguous, even on historical records whose
      // original set_index wasn't (the fixture has at least one such case —
      // a stale index the writer self-heals rather than preserves).
      expect(reNormalized!.exercises.map((e) => e.sets.map((s) => s.setIndex))).toEqual(
        original!.exercises.map((e) => e.sets.map((_s, i) => i)),
      )
      const stripIndex = (exs: NonNullable<typeof original>['exercises']) =>
        exs.map((e) => ({
          ...e,
          sets: e.sets.map(({ setIndex: _setIndex, ...s }) => s),
        }))
      expect(stripIndex(reNormalized!.exercises)).toEqual(
        stripIndex(original!.exercises),
      )
    }
  })

  it('specifically preserves bodyweight sets as bodyweight through a full round-trip', () => {
    const entry = cases.find(([, w]) =>
      toList(w.exercises).some((e) => toList(e.sets).some((s) => s.weight_kg == null)),
    )!
    const original = normalizeWorkout(entry[0], entry[1])!
    const rebuilt = buildRawWorkout(draftFromWorkout(original))
    if (!rebuilt.ok) throw new Error('expected success')

    const reNormalized = normalizeWorkout(entry[0], rebuilt.raw)!
    const kinds = reNormalized.exercises.flatMap((e) =>
      e.sets.map((s) => s.weight.kind),
    )
    expect(kinds).toContain('bodyweight')
  })

  it('specifically preserves a genuine zero-weight set through a full round-trip', () => {
    const entry = cases.find(([, w]) =>
      toList(w.exercises).some((e) => toList(e.sets).some((s) => s.weight_kg === 0)),
    )!
    const original = normalizeWorkout(entry[0], entry[1])!
    const rebuilt = buildRawWorkout(draftFromWorkout(original))
    if (!rebuilt.ok) throw new Error('expected success')

    const reNormalized = normalizeWorkout(entry[0], rebuilt.raw)!
    const kinds = reNormalized.exercises.flatMap((e) =>
      e.sets.map((s) => s.weight.kind),
    )
    expect(kinds).toContain('zero')
  })
})
