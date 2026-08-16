import { useContext } from 'react'
import { ProfileContext, type ProfileState } from './profileContext'

export type { ProfileState }
export { invalidateProfile } from './profileContext'

/**
 * The profile currently on screen — the viewer's own, or the owner's when the
 * viewer is a guest (D-23). The uid comes from the auth layer; no component
 * chooses it.
 *
 * Reads from `<ProfileProvider>` rather than fetching (D-61), so every page
 * sees the same object and a navigation costs nothing.
 */
export function useProfile(): ProfileState {
  const state = useContext(ProfileContext)
  if (state === null) {
    throw new Error('useProfile must be used inside <ProfileProvider>')
  }
  return state
}
