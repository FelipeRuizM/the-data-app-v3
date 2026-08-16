import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../test/fixture.json'

const OWNER = 'test-owner-uid'
let currentUser: { uid: string; email: string } | null = null
let profileData: unknown = null

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({
  // initializeAuth, not getAuth: the app omits the popup/redirect resolver so
  // Firebase never loads its auth iframe (133 KiB of third-party JS).
  initializeAuth: () => ({}),
  browserLocalPersistence: {},
  indexedDBLocalPersistence: {},
  getAuth: () => ({}),
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    cb(currentUser)
    return () => {}
  },
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path?: string) => path ?? '',
  get: async (path: string) => {
    if (path.startsWith('roles/')) return { exists: () => false, val: () => null }
    if (path.startsWith('users/')) {
      return { exists: () => profileData !== null, val: () => profileData }
    }
    return { exists: () => false, val: () => null }
  },
}))

const { MonthlyReport } = await import('./MonthlyReport')
const { AuthProvider } = await import('../auth/AuthProvider')
const { ProfileProvider } = await import('../data/ProfileProvider')
const { buildProfile } = await import('../lib/db')
const { monthsWithActivity } = await import('../utils/workoutUtils')

const { profile } = buildProfile(fixture as never, {})
/** A month the fixture actually has data for, so assertions are meaningful. */
const busiest = monthsWithActivity(profile)
  .map((m) => ({
    m,
    n: profile.workouts.filter(
      (w) =>
        w.startTime.getMonth() === m.getMonth() &&
        w.startTime.getFullYear() === m.getFullYear(),
    ).length,
  }))
  .sort((a, b) => b.n - a.n)[0]!.m
const busiestParam = `${busiest.getFullYear()}-${String(busiest.getMonth() + 1).padStart(2, '0')}`

const settled = (find: () => number) =>
  waitFor(() => expect(find()).toBeGreaterThan(0), { timeout: 5000 })

function renderAt(param: string) {
  return render(
    <MemoryRouter initialEntries={[`/reports/${param}`]}>
      <AuthProvider>
        <ProfileProvider>
          <Routes>
            <Route path="/reports/:month" element={<MonthlyReport />} />
          </Routes>
        </ProfileProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  currentUser = { uid: OWNER, email: 'owner@example.test' }
  profileData = fixture
})

describe('MonthlyReport', () => {
  it('renders the Activity stat cards for a month with data', async () => {
    renderAt(busiestParam)
    await settled(() => screen.queryAllByText('Activities').length)
    expect(screen.getByText('Activities')).toBeInTheDocument()
    expect(screen.getByText('Total time')).toBeInTheDocument()
    expect(screen.getByText('Avg session')).toBeInTheDocument()
    expect(screen.getByText('Avg heart rate')).toBeInTheDocument()
  })

  it('says the report is never stored', async () => {
    renderAt(busiestParam)
    await settled(() => screen.queryAllByText(/Nothing on this page is stored/i).length)
    expect(screen.getByText(/Nothing on this page is stored/i)).toBeInTheDocument()
  })

  it('shows a designed empty state for a month with no activity', async () => {
    renderAt('1999-01')
    await settled(() => screen.queryAllByText(/No activity in/i).length)
    expect(screen.getByText(/No activity in January 1999/i)).toBeInTheDocument()
  })

  it('rejects a malformed month in the URL rather than rendering nonsense', async () => {
    renderAt('not-a-month')
    await settled(() => screen.queryAllByText('That isn’t a month.').length)
    expect(screen.getByText('That isn’t a month.')).toBeInTheDocument()
  })

  it('offers previous and next month navigation', async () => {
    renderAt(busiestParam)
    await settled(() => screen.queryAllByRole('link').length)
    expect(screen.getByRole('link', { name: /prev/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /next/i })).toBeInTheDocument()
  })

  it('omits the running split from Total time when there are no runs', async () => {
    // Same principle as the hidden section: never state "0.0h running" for
    // someone who doesn't run.
    profileData = { workouts: fixture.workouts }
    renderAt(busiestParam)
    await settled(() => screen.queryAllByText('Total time').length)
    expect(screen.queryByText(/running/i)).not.toBeInTheDocument()
    expect(screen.getByText(/h lifting/i)).toBeInTheDocument()
  })

  it('hides the Runs section entirely when neither month had a run', async () => {
    // Workouts only — the Runs block must be absent, not zeroed (§7).
    profileData = { workouts: fixture.workouts }
    renderAt(busiestParam)
    await settled(() => screen.queryAllByText('Activity').length)
    // Scoped to the section HEADING: "Runs" also appears as a column header in
    // the calendar's sr-only table, which an unscoped query would match.
    expect(screen.queryByRole('heading', { name: 'Runs' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workouts' })).toBeInTheDocument()
  })

  it('hides the Workouts section entirely for a pure runner', async () => {
    profileData = { runs: fixture.runs }
    const firstRun = Object.values(fixture.runs)[0]! as { start_time: string }
    // Derive the month from a real run so the section actually has data.
    const m = firstRun.start_time.match(/(\d{1,2}) (\w{3}) (\d{4})/)!
    const monthIdx =
      [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ].indexOf(m[2]!) + 1
    renderAt(`${m[3]}-${String(monthIdx).padStart(2, '0')}`)
    await settled(() => screen.queryAllByText('Activity').length)
    expect(screen.queryByRole('heading', { name: 'Workouts' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Runs' })).toBeInTheDocument()
  })
})

describe('MonthlyReport — muscle group charts', () => {
  it('renders the sets-per-group chart with a text alternative', async () => {
    renderAt(busiestParam)
    await settled(() => screen.queryAllByText('Sets per muscle group').length)
    // figcaption + sr-only table caption
    expect(screen.getAllByText('Sets per muscle group').length).toBeGreaterThanOrEqual(
      2,
    )
  })

  it('toggles the radar between sets, reps and volume', async () => {
    const user = userEvent.setup()
    renderAt(busiestParam)
    await settled(() => screen.queryAllByText('Training balance').length)

    const repsChip = screen.getByRole('button', { name: /^reps$/i })
    await user.click(repsChip)
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: /Training balance by reps/i }),
      ).toBeInTheDocument(),
    )
  })

  it('carries no explanatory note under the radar (D-48)', async () => {
    renderAt(busiestParam)
    await settled(() => screen.queryAllByText('Training balance').length)
    expect(screen.queryByText(/Core and Other are excluded/i)).not.toBeInTheDocument()
  })
})

describe('MonthlyReport — layers 3–4 and trends', () => {
  it('shows the records-broken card, collapsed by default', async () => {
    renderAt(busiestParam)
    await settled(
      () => screen.queryAllByRole('heading', { name: 'Records broken' }).length,
    )
    const summary = screen.queryByText(/personal record/i)
    // Either records exist (collapsible) or the designed empty state shows.
    expect(
      summary !== null || screen.queryByText('No records broken this month.') !== null,
    ).toBe(true)
  })

  it('expands the records card to show per-exercise line items', async () => {
    const user = userEvent.setup()
    renderAt(busiestParam)
    await settled(
      () => screen.queryAllByRole('heading', { name: 'Records broken' }).length,
    )

    const summary = screen.queryByText(/personal record/i)
    if (!summary) return // month legitimately had none
    await user.click(summary)
    await waitFor(() => expect(screen.getAllByText(/ PR$/).length).toBeGreaterThan(0))
  })

  it('renders the trend chart with a text alternative', async () => {
    renderAt(busiestParam)
    await settled(() => screen.queryAllByRole('heading', { name: 'Trends' }).length)
    expect(screen.getByRole('img', { name: /across all history/i })).toBeInTheDocument()
  })

  it('marks the selected month in the trend chart’s text alternative', async () => {
    renderAt(busiestParam)
    await settled(() => screen.queryAllByRole('heading', { name: 'Trends' }).length)
    // Exactly one row is the selected month.
    const yeses = screen.getAllByRole('cell').filter((c) => c.textContent === 'yes')
    expect(yeses).toHaveLength(1)
  })

  it('switches the trend metric', async () => {
    const user = userEvent.setup()
    renderAt(busiestParam)
    await settled(() => screen.queryAllByRole('heading', { name: 'Trends' }).length)
    await user.click(screen.getByRole('button', { name: /^distance$/i }))
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: /Monthly distance across all history/i }),
      ).toBeInTheDocument(),
    )
  })
})

describe('MonthlyReport — the in-progress guard (§7)', () => {
  it('gates the CURRENT month behind an overlay', async () => {
    const now = new Date()
    const param = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    renderAt(param)
    await settled(
      () => screen.queryAllByText(/Still in progress|No activity in/i).length,
    )

    // Either it's gated, or the month is genuinely empty — both are valid, but
    // it must never render the full report ungated.
    const gated = screen.queryByText('Still in progress') !== null
    const empty = screen.queryByText(/No activity in/i) !== null
    expect(gated || empty).toBe(true)
    if (gated) {
      expect(
        screen.queryByRole('heading', { name: 'Activity' }),
      ).not.toBeInTheDocument()
    }
  })

  it('never gates a PAST month', async () => {
    renderAt(busiestParam)
    await settled(() => screen.queryAllByRole('heading', { name: 'Activity' }).length)
    expect(screen.queryByText('Still in progress')).not.toBeInTheDocument()
  })
})
