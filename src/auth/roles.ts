/**
 * Role resolution — pure, so it can be tested exhaustively.
 *
 * This is the security-critical logic in the app's UI layer. It decides what a
 * viewer is allowed to see and do. It is NOT the security boundary —
 * `database.rules.json` is (CLAUDE.md §2). Everything here is a courtesy that
 * keeps the UI honest; the rules are what actually stop a write.
 *
 * Keep this file free of Firebase imports so the tests never need a network,
 * an emulator, or a mock.
 */

export type Role = 'admin' | 'user' | 'guest' | 'none'

/** A `/roles/{uid}` record. Owner-maintained from the console; no client writes it. */
export type RolesEntry = {
  role?: string | undefined
  readsProfile?: string | undefined
}

const KNOWN_ROLES = ['admin', 'user', 'guest'] as const

/**
 * Resolve a signed-in UID to a role.
 *
 * The app is **invite-only** (D-3): signing in with Google is not enough. An
 * account with no `/roles` entry resolves to `none` and sees the login screen
 * saying it isn't provisioned — otherwise any stranger with a Google account
 * would silently get a writable profile.
 *
 * The owner UID is a deliberate bootstrap exception: `/roles` is unwritable from
 * the client by design, so without this the owner would be locked out of their
 * own app until they populated the node from the Firebase console.
 */
export function resolveRole(
  uid: string | null | undefined,
  ownerUid: string,
  entry: RolesEntry | null | undefined,
): Role {
  if (!uid) return 'none'

  // Bootstrap: the owner is admin even before /roles exists.
  if (ownerUid && uid === ownerUid) return 'admin'

  const claimed = entry?.role
  if (claimed && (KNOWN_ROLES as readonly string[]).includes(claimed)) {
    return claimed as Role
  }

  // Signed in, but not provisioned — or carrying a role string we don't
  // recognise, which we refuse to interpret generously.
  return 'none'
}

/**
 * Which profile's data this viewer is looking at.
 *
 * Admins and users see their own. A guest is pointed at someone else's profile
 * via `readsProfile` — that is the whole mechanism behind "guest reads the
 * owner's profile" (D-23), and it is read-only; see `canWrite`.
 */
export function resolveProfileUid(
  uid: string | null | undefined,
  role: Role,
  entry: RolesEntry | null | undefined,
): string | null {
  if (!uid || role === 'none') return null
  if (role === 'guest') return entry?.readsProfile ?? null
  return uid
}

/**
 * Can this viewer write to the profile currently on screen?
 *
 * Only ever true when the viewer owns that profile. A guest is never writable —
 * not even to the profile it can read — and an admin's extra power is over
 * global `/config`, **not** over other people's data (D-17b).
 */
export function canWrite(
  uid: string | null | undefined,
  role: Role,
  profileUid: string | null | undefined,
): boolean {
  if (!uid || !profileUid) return false
  if (role === 'none' || role === 'guest') return false
  return uid === profileUid
}

/** Only an admin sees the global admin panel. */
export function isAdmin(role: Role): boolean {
  return role === 'admin'
}
