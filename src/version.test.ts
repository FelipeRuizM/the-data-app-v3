import { describe, expect, it } from 'vitest'
import { APP_VERSION } from './version'

/**
 * The version is a human-maintained string bumped on every deploy (§0 rule 6),
 * which makes it exactly the kind of thing that drifts into the wrong shape.
 * These guard the format, not the value — the value is meant to change.
 */
describe('APP_VERSION', () => {
  it('is major.minor, with no v prefix and no patch component', () => {
    // The "v" belongs to the label that renders it, not to the number, or the
    // header ends up reading "vv3.0".
    expect(APP_VERSION).toMatch(/^\d+\.\d+$/)
  })

  it('is at least 3.0 — versions go forward', () => {
    const [major, minor] = APP_VERSION.split('.').map(Number) as [number, number]
    expect(major).toBeGreaterThanOrEqual(3)
    if (major === 3) expect(minor).toBeGreaterThanOrEqual(0)
  })
})
