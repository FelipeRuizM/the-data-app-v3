import { describe, expect, it } from 'vitest'
import { categoryVar, seqVar, categoryTextVar } from './tokens'

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

/* ── contrast, computed rather than trusted ─────────────────────────────── */

/**
 * WCAG relative luminance and contrast, so a palette edit cannot silently drop
 * text below the readable threshold. These are the numbers Lighthouse and axe
 * compute; recomputing them here turns a manual audit into a test.
 */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  )
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)]
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const HEX: Record<string, string> = {
  ground: '#0C0C0F',
  'ink-3': '#4A4A55',
  'ink-2': '#7A7A85',
  'ink-1': '#B6B6C0',
  'ink-0': '#F4F4F6',
  accent: '#FF5B2E',
  'cat-1': '#A15A09',
  'cat-2': '#15AF53',
  'cat-3': '#15A4B8',
  'cat-4': '#0760BF',
  'cat-5': '#9C73FC',
  'cat-6': '#C40F77',
  'cat-none': '#6B6B76',
}

describe('text contrast on the ground', () => {
  it.each(['ink-2', 'ink-1', 'ink-0', 'accent'])('%s clears 4.5:1', (token) => {
    expect(contrast(HEX[token]!, HEX['ground']!)).toBeGreaterThanOrEqual(4.5)
  })

  it('ink-3 does NOT, which is why it is banned from text', () => {
    // Documenting the constraint, not the failure: ink-3 is an axis and
    // gridline colour. If someone brightens it, this test tells them the ban
    // can be lifted.
    expect(contrast(HEX['ink-3']!, HEX['ground']!)).toBeLessThan(4.5)
  })
})

describe('categoryTextVar', () => {
  const CATEGORY_FILLS = [
    'accent',
    'cat-1',
    'cat-2',
    'cat-3',
    'cat-4',
    'cat-5',
    'cat-6',
    'cat-none',
  ]

  it.each(CATEGORY_FILLS)('picks a readable ink for %s', (fill) => {
    const ink = categoryTextVar(fill) === 'var(--color-ink-0)' ? 'ink-0' : 'ground'
    expect(
      contrast(HEX[ink]!, HEX[fill]!),
      `${ink} on ${fill} is unreadable`,
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('picks light text for the dark half of the palette', () => {
    // cat-1 is a dark bronze on purpose — it must sit below cat-2 in lightness
    // for colourblind separation — so it is one of the fills that needs it.
    expect(categoryTextVar('cat-1')).toBe('var(--color-ink-0)')
    expect(categoryTextVar('cat-2')).toBe('var(--color-ground)')
  })

  it('treats an unknown token as the neutral, which needs light text', () => {
    expect(categoryTextVar('nonsense')).toBe(categoryTextVar('cat-none'))
  })
})
