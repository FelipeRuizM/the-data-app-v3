import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CategoryPills } from './CategoryPills'
import type { ConfigCategory } from '../lib/config'

const CATEGORIES: ConfigCategory[] = [
  { id: 'push', name: 'Push', colorToken: 'cat-1', order: 0 },
  { id: 'pull', name: 'Pull', colorToken: 'cat-2', order: 1 },
  { id: 'legs', name: 'Legs', colorToken: 'cat-3', order: 2 },
]

function Harness({
  initial = '',
  categories = CATEGORIES,
}: {
  initial?: string
  categories?: ConfigCategory[]
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <CategoryPills value={value} onChange={setValue} categories={categories} />
      <output>{value === '' ? '(uncategorized)' : value}</output>
    </>
  )
}

const pill = (name: string) => screen.getByRole('button', { name })

describe('CategoryPills', () => {
  it('renders one pill per configured category', () => {
    render(<Harness />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Push',
      'Pull',
      'Legs',
    ])
  })

  it('marks only the selected pill as pressed', () => {
    render(<Harness initial="Pull" />)
    expect(pill('Pull')).toHaveAttribute('aria-pressed', 'true')
    expect(pill('Push')).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects on tap', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(pill('Legs'))
    expect(screen.getByRole('status')).toHaveTextContent('Legs')
  })

  it('tapping the selected pill clears it — uncategorized is a legal answer', async () => {
    // 14 of the 81 real workouts have no category (§3.1), so there has to be a
    // way back to none without a separate control.
    const user = userEvent.setup()
    render(<Harness initial="Push" />)
    await user.click(pill('Push'))
    expect(screen.getByRole('status')).toHaveTextContent('(uncategorized)')
  })

  it('KEEPS a stored category that /config no longer defines', () => {
    // Deselecting it silently would rewrite the record on the next save (§3.7).
    render(<Harness initial="Retired Split" />)
    expect(pill('Retired Split')).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not invent a pill for a category that is merely absent', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Retired Split' })).toBeNull()
  })

  it('renders nothing but the label when /config has no categories', () => {
    render(<Harness categories={[]} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
