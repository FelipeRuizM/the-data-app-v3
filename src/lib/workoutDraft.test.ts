import { describe, expect, it } from 'vitest'
import fixture from '../test/fixture.json'
import { normalizeWorkout, toList } from './normalize'
import {
  buildRawWorkout,
  draftFromWorkout,
  emptyExerciseGroup,
  emptySet,
  emptyWorkoutDraft,
  setLike,
  setsFromLastSession,
  setDraftFromSet,
  isBlankSets,
  type SetDraft,
  type WorkoutDraft,
  type BuildResult,
} from './workoutDraft'
import type { RawWorkout } from '../types'

const fixtureWorkouts = fixture.workouts as unknown as Record<string, RawWorkout>

function minimalValidDraft(over: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    title: 'Leg day',
    description: '',
    startLocal: '2026-04-08T16:50',
    durationMinutes: '60',
    place: '',
    category: '',
    avgHeartRate: '',
    calories: '',
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

  it('requires a duration', () => {
    const result = buildRawWorkout(minimalValidDraft({ durationMinutes: '' }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.errors.some((e) => e.field === 'durationMinutes')).toBe(true)
  })

  it('rejects a zero-length session', () => {
    expect(buildRawWorkout(minimalValidDraft({ durationMinutes: '0' })).ok).toBe(false)
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

/* ── exercise ids on save (D-40) ────────────────────────────────────────── */

describe('buildRawWorkout — exercise_id is written ALONGSIDE the title', () => {
  const idByName = new Map([['Bench Press (Barbell)', 'ex-1']])

  function draftWith(title: string) {
    const draft = emptyWorkoutDraft(new Date(2026, 3, 8, 16, 50))
    draft.title = 'Session'
    draft.place = 'Gym A'
    draft.exercises = [
      {
        exercise: { exerciseTitle: title, notes: '' },
        sets: [{ setType: 'normal', reps: '5', weight: '100', durationSeconds: '' }],
      },
    ]
    return draft
  }

  it('writes both fields for a catalogued exercise', () => {
    const built = buildRawWorkout(draftWith('Bench Press (Barbell)'), {
      exercises: idByName,
    })
    expect(built.ok).toBe(true)
    const entry = (built as { ok: true; raw: RawWorkout }).raw.exercises as Array<{
      exercise_id?: string
      exercise_title?: string
    }>
    expect(entry[0]!.exercise_id).toBe('ex-1')
    // The title stays. That is what makes this reversible and what keeps the
    // record readable to anything that knows nothing about ids.
    expect(entry[0]!.exercise_title).toBe('Bench Press (Barbell)')
  })

  it('omits the id for an exercise that is not in the catalog yet', () => {
    const built = buildRawWorkout(draftWith('Something New'), { exercises: idByName })
    const entry = (built as { ok: true; raw: RawWorkout }).raw.exercises as Array<{
      exercise_id?: string
      exercise_title?: string
    }>
    expect(entry[0]!.exercise_id).toBeUndefined()
    expect(entry[0]!.exercise_title).toBe('Something New')
  })

  it('writes name-only records when no catalog is passed, as every caller did before', () => {
    const built = buildRawWorkout(draftWith('Bench Press (Barbell)'))
    const entry = (built as { ok: true; raw: RawWorkout }).raw.exercises as Array<{
      exercise_id?: string
    }>
    expect(entry[0]!.exercise_id).toBeUndefined()
  })
})

describe('buildRawWorkout — category_id is written ALONGSIDE the name (D-42)', () => {
  const categories = new Map([['Push', 'cat-push']])

  function pushDraft(category: string) {
    const draft = emptyWorkoutDraft(new Date(2026, 3, 8, 16, 50))
    draft.title = 'Session'
    draft.place = 'Gym A'
    draft.category = category
    draft.exercises = [
      {
        exercise: { exerciseTitle: 'Squat', notes: '' },
        sets: [{ setType: 'normal', reps: '5', weight: '100', durationSeconds: '' }],
      },
    ]
    return draft
  }

  const raw = (r: BuildResult) => (r as { ok: true; raw: RawWorkout }).raw

  it('writes both fields for a known category', () => {
    const built = buildRawWorkout(pushDraft('Push'), { categories })
    expect(raw(built).category).toBe('Push')
    expect(raw(built).category_id).toBe('cat-push')
  })

  it('omits the id for a category not in /config', () => {
    const built = buildRawWorkout(pushDraft('Improvised'), { categories })
    expect(raw(built).category).toBe('Improvised')
    expect(raw(built).category_id).toBeUndefined()
  })

  it('writes neither field for an uncategorized workout', () => {
    const built = buildRawWorkout(pushDraft(''), { categories })
    // 14 of the original 81 records have no category at all, and that stays a
    // legal shape — never an empty string, never a placeholder id (§3.1).
    expect(raw(built).category).toBeUndefined()
    expect(raw(built).category_id).toBeUndefined()
  })
})

describe('duration replaces the end-time field (D-47)', () => {
  const raw = (r: BuildResult) => (r as { ok: true; raw: RawWorkout }).raw

  it('derives end_time from start + duration, in the stored format', () => {
    const built = buildRawWorkout(
      minimalValidDraft({ startLocal: '2026-04-08T16:50', durationMinutes: '70' }),
    )
    expect(raw(built).start_time).toBe('8 Apr 2026, 16:50')
    expect(raw(built).end_time).toBe('8 Apr 2026, 18:00')
  })

  it('carries the derived end across midnight and a month boundary', () => {
    const built = buildRawWorkout(
      minimalValidDraft({ startLocal: '2026-04-30T23:30', durationMinutes: '60' }),
    )
    // Unpadded day, three-letter English month, HH:mm, no seconds (§3.6).
    expect(raw(built).end_time).toBe('1 May 2026, 00:30')
  })

  it('a new draft is submittable without touching the date at all', () => {
    // The whole point of D-47: log a session you just finished by answering
    // title, exercises and sets. Nothing else is required.
    const draft = emptyWorkoutDraft(new Date(2026, 3, 8, 16, 50))
    draft.title = 'Leg day'
    draft.exercises = [
      {
        exercise: { exerciseTitle: 'Squat (Barbell)', notes: '' },
        sets: [{ setType: 'normal', reps: '5', weight: '100', durationSeconds: '' }],
      },
    ]
    const built = buildRawWorkout(draft)
    expect(built.ok).toBe(true)
    expect(raw(built).end_time).toBe('8 Apr 2026, 17:50')
  })

  it('round-trips a real record through draft and back without moving its end', () => {
    for (const [id, rawWorkout] of Object.entries(fixtureWorkouts)) {
      const workout = normalizeWorkout(id, rawWorkout)!
      const rebuilt = buildRawWorkout(draftFromWorkout(workout))
      if (!rebuilt.ok) throw new Error(`expected success for ${id}`)
      expect(rebuilt.raw.start_time, id).toBe(rawWorkout.start_time)
      expect(rebuilt.raw.end_time, id).toBe(rawWorkout.end_time)
    }
  })
})

describe('setLike — a new set inherits the previous one', () => {
  it('copies every value, so a straight set is one tap', () => {
    const previous: SetDraft = {
      setType: 'normal',
      reps: '8',
      weight: '80',
      durationSeconds: '45',
    }
    expect(setLike(previous)).toEqual(previous)
  })

  it('does not alias the previous set — editing one must not edit both', () => {
    const previous = emptySet()
    const next = setLike(previous)
    next.reps = '12'
    expect(previous.reps).toBe('')
  })

  it('falls back to an empty set for the first set of an exercise', () => {
    expect(setLike(undefined)).toEqual(emptySet())
  })
})

describe('workout calories (D-45)', () => {
  const raw = (r: BuildResult) => (r as { ok: true; raw: RawWorkout }).raw

  it('writes a real value', () => {
    expect(raw(buildRawWorkout(minimalValidDraft({ calories: '420' }))).calories).toBe(
      420,
    )
  })

  it('omits the field when blank', () => {
    expect('calories' in raw(buildRawWorkout(minimalValidDraft()))).toBe(false)
  })

  it('omits a typed 0 — it is the "not recorded" sentinel, not a real zero', () => {
    expect(
      'calories' in raw(buildRawWorkout(minimalValidDraft({ calories: '0' }))),
    ).toBe(false)
  })
})

describe('setsFromLastSession — prefill from the last time you did this (D-53)', () => {
  const workouts = Object.entries(fixtureWorkouts)
    .map(([id, raw]) => normalizeWorkout(id, raw))
    .filter((w): w is NonNullable<typeof w> => w !== null)

  /** The exercise logged in the most sessions, so the test has real history. */
  const busiest = (() => {
    const counts = new Map<string, number>()
    for (const w of workouts) {
      for (const e of w.exercises) {
        counts.set(e.exerciseTitle, (counts.get(e.exerciseTitle) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  })()

  it('returns the sets from the MOST RECENT session with that exercise', () => {
    const sets = setsFromLastSession(busiest, workouts)
    expect(sets).not.toBeNull()

    // Ordered by start_time and never by key — 37 records carry numeric-string
    // keys from an import and 44 carry push ids (§3.1).
    const sessions = workouts
      .filter((w) => w.exercises.some((e) => e.exerciseTitle === busiest))
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    const expected = sessions[0]!.exercises.find((e) => e.exerciseTitle === busiest)!
    expect(sets).toEqual(expected.sets.map(setDraftFromSet))
  })

  it('excludes the workout being edited from its own history', () => {
    const sessions = workouts
      .filter((w) => w.exercises.some((e) => e.exerciseTitle === busiest))
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    const sets = setsFromLastSession(busiest, workouts, sessions[0]!.id)
    const expected = sessions[1]!.exercises.find((e) => e.exerciseTitle === busiest)!
    expect(sets).toEqual(expected.sets.map(setDraftFromSet))
  })

  it('returns null for an exercise with no history, and for an empty name', () => {
    expect(setsFromLastSession('Zercher Squat', workouts)).toBeNull()
    expect(setsFromLastSession('   ', workouts)).toBeNull()
  })

  it('carries a bodyweight set through as blank, never as 0 (D-7b)', () => {
    const bodyweight = workouts.flatMap((w) =>
      w.exercises.filter((e) => e.sets.some((s) => s.weight.kind === 'bodyweight')),
    )[0]
    if (!bodyweight) throw new Error('fixture has no bodyweight set')
    const sets = setsFromLastSession(bodyweight.exerciseTitle, workouts)!
    // Collapsing absent into "0" would silently turn bodyweight work into a
    // genuine zero-kilogram set on the next save.
    expect(sets.some((s) => s.weight === '0' || s.weight === '')).toBe(true)
  })
})

describe('isBlankSets', () => {
  it('is true for a freshly added exercise', () => {
    expect(isBlankSets([emptySet()])).toBe(true)
  })
  it('is false once anything at all has been typed', () => {
    expect(isBlankSets([{ ...emptySet(), reps: '5' }])).toBe(false)
    expect(isBlankSets([emptySet(), { ...emptySet(), weight: '60' }])).toBe(false)
  })
})
