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
  const known: readonly string[] = [...CATEGORY_TOKENS, CATEGORY_NONE]
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
