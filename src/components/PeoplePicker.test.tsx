import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PeoplePicker } from './PeoplePicker'

const KNOWN = ['Person A', 'Person B', 'Person C']

function Harness({ initial = [] as string[] }) {
  const [selected, setSelected] = useState<string[]>(initial)
  return (
    <>
      <PeoplePicker selected={selected} onChange={setSelected} options={KNOWN} />
      <output>{selected.length === 0 ? '(nobody)' : selected.join(', ')}</output>
    </>
  )
}

describe('PeoplePicker', () => {
  it('shows no chip wall — an empty field is one control, not seven', () => {
    render(<Harness />)
    // Only the Add button. Previously every known person rendered as a toggle.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Add'])
  })

  it('adds a known person by typing the name', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Add a person'), 'Person B')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('status')).toHaveTextContent('Person B')
  })

  it('adds a name nobody has used before — create-on-the-fly (§4)', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Add a person'), 'Brand New Partner')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('status')).toHaveTextContent('Brand New Partner')
  })

  it('clears the field after adding, so the next name starts empty', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const field = screen.getByLabelText('Add a person')
    await user.type(field, 'Person A')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect((screen.getByLabelText('Add a person') as HTMLInputElement).value).toBe('')
  })

  it('lists who has been added, each removable', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['Person A', 'Person C']} />)
    await user.click(screen.getByRole('button', { name: 'Remove Person A' }))
    expect(screen.getByRole('status')).toHaveTextContent('Person C')
    expect(screen.getByRole('status')).not.toHaveTextContent('Person A')
  })

  it('never adds the same person twice', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['Person A']} />)
    await user.type(screen.getByLabelText('Add a person'), 'Person A')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('status')).toHaveTextContent('Person A')
    expect(screen.queryAllByRole('button', { name: /^Remove/ })).toHaveLength(1)
  })

  it('stops suggesting someone already added', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['Person B']} />)
    await user.click(screen.getByLabelText('Add a person'))
    expect(screen.queryAllByRole('option').map((o) => o.textContent)).toEqual([
      'Person A',
      'Person C',
    ])
  })

  it('ignores an empty add', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('status')).toHaveTextContent('(nobody)')
  })
})
