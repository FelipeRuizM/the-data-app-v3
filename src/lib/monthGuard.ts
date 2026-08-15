import { format, isSameMonth } from 'date-fns'

/**
 * The in-progress-month guard's pure parts, kept apart from the component so
 * that file exports only a component — mixing the two breaks Fast Refresh.
 */

/** True when `month` is the calendar month we're currently living through. */
export function isInProgress(month: Date, now: Date = new Date()): boolean {
  return isSameMonth(month, now)
}

const storageKey = (month: Date) => `report-unlocked:${format(month, 'yyyy-MM')}`

/**
 * Per-visit dismissal. `sessionStorage`, never the database (§7) — this is a
 * UX guard, not a data concept, so it must not outlive the tab.
 */
export function wasUnlocked(month: Date): boolean {
  try {
    return sessionStorage.getItem(storageKey(month)) === '1'
  } catch {
    // Private-mode or blocked storage: fail toward SHOWING the guard, which is
    // the harmless direction.
    return false
  }
}

export function rememberUnlocked(month: Date): void {
  try {
    sessionStorage.setItem(storageKey(month), '1')
  } catch {
    // Ignore — the unlock still applies for this render.
  }
}
