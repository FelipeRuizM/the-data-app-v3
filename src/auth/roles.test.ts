import { describe, expect, it } from 'vitest'
import { canWrite, isAdmin, resolveProfileUid, resolveRole } from './roles'

const OWNER = 'owner-uid'
const GUEST = 'guest-uid'
const OTHER = 'someone-else'

describe('resolveRole', () => {
  it('treats a signed-out visitor as none', () => {
    expect(resolveRole(null, OWNER, null)).toBe('none')
    expect(resolveRole(undefined, OWNER, null)).toBe('none')
    expect(resolveRole('', OWNER, null)).toBe('none')
  })

  it('makes the owner admin even with no /roles entry (bootstrap)', () => {
    // /roles is unwritable from the client, so without this the owner is locked
    // out of their own app until they populate it from the console.
    expect(resolveRole(OWNER, OWNER, null)).toBe('admin')
  })

  it('refuses a signed-in account that has no /roles entry', () => {
    // The app is invite-only. Valid credentials alone must not grant a profile.
    expect(resolveRole(OTHER, OWNER, null)).toBe('none')
    expect(resolveRole(OTHER, OWNER, {})).toBe('none')
  })

  it('reads admin, user and guest from the entry', () => {
    expect(resolveRole(OTHER, OWNER, { role: 'admin' })).toBe('admin')
    expect(resolveRole(OTHER, OWNER, { role: 'user' })).toBe('user')
    expect(resolveRole(GUEST, OWNER, { role: 'guest' })).toBe('guest')
  })

  it('refuses to interpret an unrecognised role string generously', () => {
    // A typo in the console must fail closed, not fall through to `user`.
    expect(resolveRole(OTHER, OWNER, { role: 'Admin' })).toBe('none')
    expect(resolveRole(OTHER, OWNER, { role: 'superuser' })).toBe('none')
    expect(resolveRole(OTHER, OWNER, { role: '' })).toBe('none')
  })

  it('does not let a non-owner claim admin by naming a blank owner uid', () => {
    // Guards the case where VITE_OWNER_UID is missing at build time: an empty
    // owner uid must not match an empty/undefined viewer uid into admin.
    expect(resolveRole('', '', null)).toBe('none')
    expect(resolveRole(OTHER, '', null)).toBe('none')
  })
})

describe('resolveProfileUid', () => {
  it('points admins and users at their own profile', () => {
    expect(resolveProfileUid(OWNER, 'admin', null)).toBe(OWNER)
    expect(resolveProfileUid(OTHER, 'user', { role: 'user' })).toBe(OTHER)
  })

  it('points a guest at the profile named in readsProfile', () => {
    expect(
      resolveProfileUid(GUEST, 'guest', { role: 'guest', readsProfile: OWNER }),
    ).toBe(OWNER)
  })

  it('gives a guest with no readsProfile nothing to read', () => {
    expect(resolveProfileUid(GUEST, 'guest', { role: 'guest' })).toBeNull()
  })

  it('gives an unprovisioned or signed-out viewer nothing', () => {
    expect(resolveProfileUid(OTHER, 'none', null)).toBeNull()
    expect(resolveProfileUid(null, 'none', null)).toBeNull()
  })
})

describe('canWrite', () => {
  it('lets a user write their own profile', () => {
    expect(canWrite(OTHER, 'user', OTHER)).toBe(true)
  })

  it('lets an admin write their own profile', () => {
    expect(canWrite(OWNER, 'admin', OWNER)).toBe(true)
  })

  it('never lets a guest write — not even the profile it can read', () => {
    expect(canWrite(GUEST, 'guest', OWNER)).toBe(false)
    expect(canWrite(GUEST, 'guest', GUEST)).toBe(false)
  })

  it('never lets an admin write someone else’s profile', () => {
    // Admin power is over global /config, not over other people's data (D-17b).
    expect(canWrite(OWNER, 'admin', OTHER)).toBe(false)
  })

  it('never lets a user write someone else’s profile', () => {
    expect(canWrite(OTHER, 'user', OWNER)).toBe(false)
  })

  it('is false when signed out or when no profile is loaded', () => {
    expect(canWrite(null, 'none', OWNER)).toBe(false)
    expect(canWrite(OWNER, 'admin', null)).toBe(false)
  })
})

describe('isAdmin', () => {
  it('is true only for admin', () => {
    expect(isAdmin('admin')).toBe(true)
    expect(isAdmin('user')).toBe(false)
    expect(isAdmin('guest')).toBe(false)
    expect(isAdmin('none')).toBe(false)
  })
})
