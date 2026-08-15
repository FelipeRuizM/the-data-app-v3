import { Link } from 'react-router-dom'
import { CATEGORIES, recentActivity, totalRecords } from '../categories/registry'
import { CategoryTag, Label } from '../components/ui'
import { formatDayShort, formatDuration } from '../lib/dates'
import { useAuth } from '../auth/hooks'
import { useProfile } from '../data/useProfile'
import type { ActivityItem } from '../types'

/**
 * Deliberately sparse (§4). One large tap target per registry category, then a
 * short recent-activity strip. Nothing else.
 *
 * Both the log buttons and the strip iterate the registry — neither knows that
 * "workouts" and "runs" are the two categories that happen to exist today.
 */
export function Home() {
  const { canWrite, role } = useAuth()
  const state = useProfile()

  return (
    <div className="flex flex-col gap-10 py-10">
      {canWrite ? (
        <section className="flex flex-col gap-3">
          <Label as="h2">Log</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <Link
                key={c.id}
                to={c.newPath}
                className="flex min-h-24 items-end rounded-sm border border-rule px-5 py-4 no-underline transition-colors duration-[120ms] hover:border-ink-3"
              >
                <span className="font-mono text-lg tracking-tight text-ink-0">
                  Log a {c.labelSingular}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <Label as="h2">Recent activity</Label>
        <RecentActivity state={state} isGuest={role === 'guest'} />
      </section>
    </div>
  )
}

function RecentActivity({
  state,
  isGuest,
}: {
  state: ReturnType<typeof useProfile>
  isGuest: boolean
}) {
  if (state.status === 'loading') {
    return (
      <ul className="flex list-none flex-col gap-0 p-0" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <li
            key={i}
            className="flex items-center gap-3 border-b border-rule py-4"
            aria-hidden="true"
          >
            <span className="h-3 w-24 rounded-sm bg-rule" />
            <span className="h-3 flex-1 rounded-sm bg-rule" />
          </li>
        ))}
        <li className="sr-only">Loading recent activity…</li>
      </ul>
    )
  }

  if (state.status === 'denied') {
    return (
      <EmptyState
        label="No access"
        title="This profile isn’t readable."
        body="The database rules rejected the read. If you were just given access, sign out and back in so the session picks it up."
      />
    )
  }

  if (state.status === 'error') {
    return (
      <EmptyState
        label="Couldn’t load"
        title="Something went wrong fetching this data."
        body={state.message}
      />
    )
  }

  const { profile, config, dropped } = state.data
  const items = recentActivity(profile, config, 8)

  if (items.length === 0) {
    return (
      <EmptyState
        label="Nothing here yet"
        title={
          totalRecords(profile) === 0
            ? 'This profile has no activity.'
            : 'No recent activity.'
        }
        body={
          isGuest
            ? 'The account you’re viewing hasn’t logged anything yet.'
            : 'Log a workout or a run and it will show up here, newest first.'
        }
      />
    )
  }

  const droppedCount = dropped.workouts + dropped.runs

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex list-none flex-col gap-0 p-0">
        {items.map((item) => (
          <ActivityRow key={`${item.categoryId}:${item.id}`} item={item} />
        ))}
      </ul>

      {droppedCount > 0 ? (
        // Surfaced rather than swallowed: a record with an unparseable date is
        // a data problem the owner should know about, not something to hide.
        <p className="m-0 font-mono text-xs text-ink-3">
          {droppedCount} record{droppedCount === 1 ? '' : 's'} skipped — unreadable
          date.
        </p>
      ) : null}
    </div>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <li className="border-b border-rule">
      <Link
        to={`/${item.categoryId}/${item.id}`}
        className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-4 no-underline"
      >
        <span className="min-w-0 truncate text-ink-0">{item.title}</span>
        <span className="font-mono text-xs whitespace-nowrap text-ink-3">
          {formatDayShort(item.startTime)}
        </span>
        <span className="col-span-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <CategoryTag token={item.colorToken}>
            {item.label ?? 'Uncategorized'}
          </CategoryTag>
          <span className="font-mono text-xs text-ink-2">{item.metric}</span>
          <span className="font-mono text-xs text-ink-2">
            {formatDuration(item.durationMinutes)}
          </span>
        </span>
      </Link>
    </li>
  )
}

/** Empty is designed, never a bare "No data" (§9). */
function EmptyState({
  label,
  title,
  body,
}: {
  label: string
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-rule py-1 pl-4">
      <Label>{label}</Label>
      <p className="m-0 text-ink-0">{title}</p>
      <p className="m-0 max-w-prose text-sm text-ink-2">{body}</p>
    </div>
  )
}
