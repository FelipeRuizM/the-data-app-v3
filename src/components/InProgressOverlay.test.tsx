import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addMonths, subMonths } from 'date-fns'
import { beforeEach, describe, expect, it } from 'vitest'
import { InProgressGuard } from './InProgressOverlay'
import { isInProgress } from '../lib/monthGuard'

beforeEach(() => {
  sessionStorage.clear()
})

describe('isInProgress', () => {
  it('is true for the month we are living through', () => {
    expect(isInProgress(new Date())).toBe(true)
  })
  it('is false for a past or future month', () => {
    expect(isInProgress(subMonths(new Date(), 1))).toBe(false)
    expect(isInProgress(addMonths(new Date(), 1))).toBe(false)
  })
})

describe('InProgressGuard', () => {
  it('gates the current month', () => {
    render(
      <InProgressGuard month={new Date()}>
        <p>the report</p>
      </InProgressGuard>,
    )
    expect(screen.getByText('Still in progress')).toBeInTheDocument()
    expect(screen.queryByText('the report')).not.toBeInTheDocument()
  })

  it('lets a past month straight through', () => {
    render(
      <InProgressGuard month={subMonths(new Date(), 1)}>
        <p>the report</p>
      </InProgressGuard>,
    )
    expect(screen.getByText('the report')).toBeInTheDocument()
  })

  it('reveals the report on "Unlock anyway"', async () => {
    const user = userEvent.setup()
    render(
      <InProgressGuard month={new Date()}>
        <p>the report</p>
      </InProgressGuard>,
    )
    await user.click(screen.getByRole('button', { name: /unlock anyway/i }))
    expect(screen.getByText('the report')).toBeInTheDocument()
  })

  it('remembers the unlock in sessionStorage — per visit, NEVER the database', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <InProgressGuard month={new Date()}>
        <p>the report</p>
      </InProgressGuard>,
    )
    await user.click(screen.getByRole('button', { name: /unlock anyway/i }))
    unmount()

    // Remounting within the same session stays unlocked.
    render(
      <InProgressGuard month={new Date()}>
        <p>the report</p>
      </InProgressGuard>,
    )
    expect(screen.getByText('the report')).toBeInTheDocument()

    // And it lives in sessionStorage, not localStorage — it must not outlive
    // the tab (§7: a UX guard, not a data concept).
    expect(sessionStorage.length).toBeGreaterThan(0)
    expect(localStorage.length).toBe(0)
  })

  it('unlocking one month does not unlock another', async () => {
    const user = userEvent.setup()
    render(
      <InProgressGuard month={new Date()}>
        <p>this month</p>
      </InProgressGuard>,
    )
    await user.click(screen.getByRole('button', { name: /unlock anyway/i }))
    expect(sessionStorage.length).toBe(1)
  })
})
