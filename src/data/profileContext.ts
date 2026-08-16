import { createContext } from 'react'
import type { LoadResult } from '../lib/db'

export type ProfileState =
  | { status: 'loading' }
  /** The read was denied. Distinct from empty — they must never look the same. */
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: LoadResult }

/**
 * One profile for the whole app (D-61).
 *
 * `null` means no `<ProfileProvider>` above — `useProfile` throws on it rather
 * than returning a plausible-looking loading state, because a missing provider
 * is a wiring bug that would otherwise present as a page that never loads.
 */
export const ProfileContext = createContext<ProfileState | null>(null)

/**
 * The provider's re-read, registered here so a write can trigger one without
 * every write module importing React.
 *
 * A single slot rather than a listener set: there is exactly one provider, and
 * a set would make `invalidateProfile`'s promise mean "some of them finished".
 */
let refresher: (() => Promise<void>) | null = null

export function setProfileRefresher(fn: (() => Promise<void>) | null): void {
  refresher = fn
}

/**
 * Re-read the profile, and **resolve only when the new data is on screen**.
 *
 * The await matters. `saveWorkout` invalidates and then the form navigates to
 * the record it just wrote — if this returned before the read landed, the
 * detail page would mount against the old profile and render "no workout with
 * that id" for a frame. Awaiting makes that impossible by construction rather
 * than by adding a revalidating flag to every not-found branch.
 */
export async function invalidateProfile(): Promise<void> {
  await refresher?.()
}
