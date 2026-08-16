import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ComboBox } from './ComboBox'

/**
 * The picker every catalog field uses (D-52). What matters here is that typing
 * filters, that a name outside the catalog is a legal value rather than an
 * error, and that the keyboard path works — this is the control the whole log
 * form is built out of.
 */

function Harness({ initial = '', options }: { initial?: string; options: string[] }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <ComboBox label="Exercise" value={value} onChange={setValue} options={options} />
      <output>{value === '' ? '(empty)' : value}</output>
    </>
  )
}

const CATALOG = ['Bench Press (Barbell)', 'Bent Over Row (Barbell)', 'Pull Up']

const rows = () => screen.queryAllByRole('option').map((o) => o.textContent)

describe('ComboBox', () => {
  it('is a text field, not a select', () => {
    render(<Harness options={CATALOG} />)
    expect((screen.getByLabelText('Exercise') as HTMLElement).tagName).toBe('INPUT')
  })

  it('shows nothing until you interact', () => {
    render(<Harness options={CATALOG} />)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens the full catalog on focus', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    await user.click(screen.getByLabelText('Exercise'))
    expect(rows()).toEqual(CATALOG)
  })

  it('filters as you type, on a substring rather than a prefix', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    // "row" is mid-name — how these are actually remembered. The Add row is
    // still offered: nothing is called exactly "row", and a name that merely
    // contains your query is not the same as the one you meant.
    await user.type(screen.getByLabelText('Exercise'), 'row')
    expect(rows()).toEqual(['Bent Over Row (Barbell)', 'Add “row”'])
  })

  it('matches case-insensitively', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    await user.type(screen.getByLabelText('Exercise'), 'PULL')
    expect(rows()).toContain('Pull Up')
  })

  it('clicking a match commits it and closes the list', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    await user.type(screen.getByLabelText('Exercise'), 'bench')
    await user.click(screen.getByRole('option', { name: 'Bench Press (Barbell)' }))

    expect(screen.getByRole('status')).toHaveTextContent('Bench Press (Barbell)')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('offers an explicit Add row when nothing matches', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    await user.type(screen.getByLabelText('Exercise'), 'Zercher Squat')
    expect(rows()).toEqual(['Add “Zercher Squat”'])
  })

  it('KEEPS a name outside the catalog — that is a value, not an error', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    await user.type(screen.getByLabelText('Exercise'), 'Zercher Squat')
    expect(screen.getByRole('status')).toHaveTextContent('Zercher Squat')
  })

  it('offers no Add row once the typed name matches exactly', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    await user.type(screen.getByLabelText('Exercise'), 'Pull Up')
    expect(rows()).toEqual(['Pull Up'])
  })

  it('arrow keys and Enter pick a match without touching the mouse', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    const field = screen.getByLabelText('Exercise')
    await user.click(field)
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('Bent Over Row (Barbell)')
  })

  it('Escape closes the list and leaves the typed value alone', async () => {
    const user = userEvent.setup()
    render(<Harness options={CATALOG} />)
    await user.type(screen.getByLabelText('Exercise'), 'Zercher')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Zercher')
  })

  it('seeds from an existing value without dropping it', () => {
    // A retired category still sits on old records (§3.7 — joins must be total).
    render(<Harness initial="Retired Split" options={CATALOG} />)
    expect((screen.getByLabelText('Exercise') as HTMLInputElement).value).toBe(
      'Retired Split',
    )
  })
})
