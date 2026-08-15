/**
 * Palette token ids. Categories and run types are stored in the database as one
 * of these strings — never as a hex (CLAUDE.md §5, D-17). That is what keeps
 * "no raw hex in components" true even for owner-chosen colours.
 */
export const CATEGORY_TOKENS = [
  'cat-1',
  'cat-2',
  'cat-3',
  'cat-4',
  'cat-5',
  'cat-6',
] as const

export type CategoryToken = (typeof CATEGORY_TOKENS)[number]

/** Uncategorized, or a category that was deleted. Neutral — never an error state. */
export const CATEGORY_NONE = 'cat-none' as const

export type CategoryTokenOrNone = CategoryToken | typeof CATEGORY_NONE

/**
 * Resolve a stored token id to the CSS custom property that carries its colour.
 * An unknown id degrades to the neutral rather than throwing: a record whose
 * category was deleted must still render (CLAUDE.md §4).
 */
export function categoryVar(token: string | null | undefined): string {
  // `accent` belongs here even though it is not a category: the calendar fills
  // a day that holds BOTH a workout and a run with it, and it takes dark text
  // (6.31:1) like the bright half of the categorical palette.
  const known: readonly string[] = [...CATEGORY_TOKENS, CATEGORY_NONE, 'accent']
  return known.includes(token ?? '')
    ? `var(--color-${token})`
    : `var(--color-${CATEGORY_NONE})`
}

/** The sequential ramp, dark → bright. Magnitude only; zero is not on it. */
export const SEQ_TOKENS = ['seq-1', 'seq-2', 'seq-3', 'seq-4', 'seq-5'] as const

/**
 * Map a value to a ramp step. Returns `null` for zero — callers must render an
 * outline, not the palest step, because "never" must not look like "once".
 */
export function seqVar(value: number, max: number): string | null {
  if (value <= 0) return null
  const step = Math.min(
    SEQ_TOKENS.length,
    Math.max(1, Math.ceil((value / Math.max(max, 1)) * SEQ_TOKENS.length)),
  )
  return `var(--color-seq-${step})`
}

/**
 * The readable text colour to sit ON a categorical fill.
 *
 * Half the palette needs dark text and half needs light, and guessing is how a
 * calendar cell ends up at 3.7:1 — which is exactly what axe caught on the
 * monthly report. Measured against the validated palette:
 *
 *   cat-1  3.70 on ground  ·  4.80 on ink-0   → light
 *   cat-4  3.19            ·  5.57            → light
 *   cat-6  3.42            ·  5.19            → light
 *   none   3.71            ·  4.79            → light
 *   cat-2  6.78            ·  2.62            → dark
 *   cat-3  6.54            ·  2.72            → dark
 *   cat-5  5.83            ·  3.05            → dark
 *   accent 6.31            ·  2.82            → dark
 *
 * `tokens.test.ts` recomputes every pairing, so changing a palette value cannot
 * silently drop one below 4.5:1.
 */
const NEEDS_LIGHT_TEXT: readonly string[] = ['cat-1', 'cat-4', 'cat-6', CATEGORY_NONE]

export function categoryTextVar(token: string | null | undefined): string {
  // Resolve the same way `categoryVar` does FIRST. An unknown or deleted
  // category falls back to the cat-none fill (§4), and cat-none needs light
  // text — reading the raw token here put dark text on it at 3.71:1, which is
  // the exact path a deleted category takes.
  // `accent` belongs here even though it is not a category: the calendar fills
  // a day holding BOTH a workout and a run with it, and it takes dark text
  // (6.31:1) like the bright half of the categorical palette.
  const known: readonly string[] = [...CATEGORY_TOKENS, CATEGORY_NONE, 'accent']
  const resolved = known.includes(token ?? '') ? token! : CATEGORY_NONE
  return NEEDS_LIGHT_TEXT.includes(resolved)
    ? 'var(--color-ink-0)'
    : 'var(--color-ground)'
}
