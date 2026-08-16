import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SetBySetChart } from './SetBySetChart'
import type { SetPoint } from '../../utils/setSeries'

function point(over: Partial<SetPoint> = {}): SetPoint {
  return {
    index: 0,
    date: new Date(2026, 3, 8, 17, 0),
    workoutId: 'w1',
    setInSession: 1,
    session: 0,
    setType: 'normal',
    reps: 10,
    weightKg: 50,
    volumeKg: 500,
    prMetrics: [],
    ...over,
  }
}

const POINTS: SetPoint[] = [
  point({ index: 0, reps: 8, weightKg: 40, volumeKg: 320 }),
  point({ index: 1, setInSession: 2, reps: 10, weightKg: 50, volumeKg: 500 }),
  point({
    index: 2,
    session: 1,
    setInSession: 1,
    date: new Date(2026, 3, 15, 17, 0),
    reps: 6,
    weightKg: 60,
    volumeKg: 360,
    prMetrics: ['weight'],
  }),
]

const chip = (name: string) => screen.getByRole('button', { name })

describe('SetBySetChart', () => {
  it('shows all three series by default', () => {
    render(<SetBySetChart points={POINTS} units="kg" />)
    for (const key of ['reps', 'weight', 'volume']) {
      expect(chip(key)).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('renders nothing for a single set — one point is a number, not a series', () => {
    const { container } = render(<SetBySetChart points={[point()]} units="kg" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('labels the axis in PERCENT while more than one series is on', () => {
    // Reps run 1–30, weight 0–200, volume 0–3,000. A second y-axis would let
    // any correlation be manufactured by choosing where the axes cross, so
    // each series is drawn against its own maximum instead.
    render(<SetBySetChart points={POINTS} units="kg" />)
    expect(screen.getByText(/% of its own best/i)).toBeInTheDocument()
    const plot = screen.getByRole('img')
    expect(within(plot).getByText('100%')).toBeInTheDocument()
  })

  it('switches to REAL units once a single series is left', async () => {
    const user = userEvent.setup()
    render(<SetBySetChart points={POINTS} units="kg" />)

    await user.click(chip('reps'))
    await user.click(chip('volume'))

    // Only weight remains: nothing to reconcile, so be exact.
    expect(screen.queryByText(/% of its own best/i)).not.toBeInTheDocument()
    const plot = screen.getByRole('img')
    // The top tick is that series' max, in kilograms.
    expect(within(plot).getByText('60')).toBeInTheDocument()
  })

  it('will not let you turn the last series off', async () => {
    const user = userEvent.setup()
    render(<SetBySetChart points={POINTS} units="kg" />)

    await user.click(chip('reps'))
    await user.click(chip('volume'))
    await user.click(chip('weight'))

    expect(chip('weight')).toHaveAttribute('aria-pressed', 'true')
  })

  it('reads out the most recent set at rest, so it is never blank', () => {
    render(<SetBySetChart points={POINTS} units="kg" />)
    const readout = screen.getByRole('status')
    expect(readout).toHaveTextContent('60')
    expect(readout).toHaveTextContent('6')
  })

  it('flags a set that broke a record', () => {
    render(<SetBySetChart points={POINTS} units="kg" />)
    expect(screen.getByRole('status')).toHaveTextContent('1 PR')
  })

  it('carries a text alternative with every value (§9)', () => {
    render(<SetBySetChart points={POINTS} units="kg" />)
    const table = screen.getByRole('table')
    // Header plus one row per set — the alternative is the whole series, not a
    // summary of it.
    expect(within(table).getAllByRole('row')).toHaveLength(POINTS.length + 1)
  })

  it('converts to the display unit without touching what is stored (D-18)', () => {
    render(<SetBySetChart points={POINTS} units="lb" />)
    const table = screen.getByRole('table')
    expect(within(table).getByText(/Weight \(lb\)/)).toBeInTheDocument()
    // 60 kg = 132.3 lb.
    expect(within(table).getByText('132.3')).toBeInTheDocument()
  })

  it('draws no weight mark for a bodyweight set rather than plotting zero', () => {
    // Collapsing absent into zero would put a pull-up on the floor of the
    // chart as though it were an unloaded lift (D-7b).
    const bodyweight = [
      point({ index: 0, weightKg: null, volumeKg: 800 }),
      point({ index: 1, weightKg: null, volumeKg: 800 }),
    ]
    render(<SetBySetChart points={bodyweight} units="kg" />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0)
  })
})
