import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SelectInput } from './SelectInput'

/**
 * The picker that replaced free text wherever a value comes from a known set
 * (D-49). Two behaviours carry real risk and are what these tests exist for:
 * an unknown stored value must survive, and create-on-the-fly must still work
 * where §4 requires it.
 */

function Harness({
  initial = '',
  options,
  allowCreate = false,
}: {
  initial?: string
  options: string[]
  allowCreate?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <SelectInput
        label="Place"
        value={value}
        onChange={setValue}
        options={options}
        allowCreate={allowCreate}
      />
      <output>{value === '' ? '(empty)' : value}</output>
    </>
  )
}

describe('SelectInput', () => {
  it('offers the catalog plus an empty choice', () => {
    render(<Harness options={['Place A', 'Place B']} />)
    const select = screen.getByLabelText('Place') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['', 'Place A', 'Place B'])
  })

  it('reports the picked name', async () => {
    const user = userEvent.setup()
    render(<Harness options={['Place A', 'Place B']} />)
    await user.selectOptions(screen.getByLabelText('Place'), 'Place B')
    expect((screen.getByLabelText('Place') as HTMLSelectElement).value).toBe('Place B')
    expect(screen.getByRole('status')).toHaveTextContent('Place B')
  })

  it('KEEPS a stored value the catalog no longer holds', () => {
    // A retired category still sits on old records (§3.7 — every join must be
    // total). Dropping it here would silently rewrite the record on save.
    render(<Harness initial="Retired Split" options={['Push', 'Pull']} />)
    const select = screen.getByLabelText('Place') as HTMLSelectElement
    expect(select.value).toBe('Retired Split')
    expect([...select.options].map((o) => o.value)).toContain('Retired Split')
  })

  it('does not duplicate a stored value that IS in the catalog', () => {
    render(<Harness initial="Push" options={['Push', 'Pull']} />)
    const select = screen.getByLabelText('Place') as HTMLSelectElement
    expect([...select.options].filter((o) => o.value === 'Push')).toHaveLength(1)
  })

  it('offers no create option unless asked', () => {
    render(<Harness options={['Place A']} />)
    const select = screen.getByLabelText('Place') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).not.toContain('::create-new::')
  })

  it('swaps to a text field for create-on-the-fly, and back again', async () => {
    const user = userEvent.setup()
    render(<Harness options={['Place A']} allowCreate />)

    await user.selectOptions(screen.getByLabelText('Place'), '::create-new::')
    const field = screen.getByLabelText('Place') as HTMLInputElement
    expect(field.tagName).toBe('INPUT')

    await user.type(field, 'Brand New Gym')
    expect(screen.getByRole('status')).toHaveTextContent('Brand New Gym')

    await user.click(screen.getByRole('button', { name: /back to the list/i }))
    expect((screen.getByLabelText('Place') as HTMLSelectElement).tagName).toBe('SELECT')
    // Backing out clears the half-typed name rather than leaving a stray join.
    expect(screen.getByRole('status')).toHaveTextContent('(empty)')
  })
})
