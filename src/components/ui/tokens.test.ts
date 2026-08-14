import { describe, expect, it } from 'vitest'
import { categoryVar, seqVar } from './tokens'

describe('categoryVar', () => {
  it('resolves a known token to its custom property', () => {
    expect(categoryVar('cat-3')).toBe('var(--color-cat-3)')
  })

  it('degrades an unknown token to the neutral rather than throwing', () => {
    // A record whose category the owner deleted must still render (CLAUDE.md §4).
    expect(categoryVar('cat-deleted')).toBe('var(--color-cat-none)')
  })

  it('degrades null and undefined to the neutral', () => {
    // 14 of the 81 workouts have no category at all.
    expect(categoryVar(null)).toBe('var(--color-cat-none)')
    expect(categoryVar(undefined)).toBe('var(--color-cat-none)')
  })

  it('never treats the neutral itself as unknown', () => {
    expect(categoryVar('cat-none')).toBe('var(--color-cat-none)')
  })
})

describe('seqVar', () => {
  it('returns null for zero — "never" must not look like "once"', () => {
    expect(seqVar(0, 5)).toBeNull()
  })

  it('returns null for negatives rather than clamping them onto the ramp', () => {
    expect(seqVar(-3, 5)).toBeNull()
  })

  it('puts the smallest non-zero value on the first step', () => {
    expect(seqVar(1, 5)).toBe('var(--color-seq-1)')
  })

  it('puts the max on the last step', () => {
    expect(seqVar(5, 5)).toBe('var(--color-seq-5)')
  })

  it('clamps values above the max instead of overflowing the ramp', () => {
    expect(seqVar(99, 5)).toBe('var(--color-seq-5)')
  })

  it('survives a zero max without dividing by zero', () => {
    expect(seqVar(3, 0)).toBe('var(--color-seq-5)')
  })
})
