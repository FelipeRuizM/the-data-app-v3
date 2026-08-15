import { Label } from './ui'
import { categoryVar } from './ui/tokens'
import type { CalendarDay } from '../utils/workoutUtils'

/** Weeks start Sunday, matching the streak definition (D-15). */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/**
 * A month grid marking which days had activity (§7 Layer 2).
 *
 * A day with nothing is drawn as a hairline outline rather than the palest
 * fill — "didn't train" must not look like "trained a little" (§5).
 */
export function SessionCalendar({ weeks }: { weeks: CalendarDay[][] }) {
  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption>
        <Label as="h3">Sessions</Label>
      </figcaption>

      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="text-center font-mono text-label text-ink-3"
            >
              {d}
            </span>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => (
              <Day key={di} day={day} />
            ))}
          </div>
        ))}
      </div>

      <table className="sr-only">
        <caption>Days with activity this month</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Workouts</th>
            <th scope="col">Runs</th>
          </tr>
        </thead>
        <tbody>
          {weeks
            .flat()
            .filter((d) => d.dayOfMonth !== null && (d.workouts > 0 || d.runs > 0))
            .map((d) => (
              <tr key={d.dayOfMonth}>
                <td>{d.dayOfMonth}</td>
                <td>{d.workouts}</td>
                <td>{d.runs}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  )
}

function Day({ day }: { day: CalendarDay }) {
  if (day.dayOfMonth === null) return <span aria-hidden="true" />

  const total = day.workouts + day.runs
  const label =
    total === 0
      ? `${day.dayOfMonth}: nothing`
      : `${day.dayOfMonth}: ${day.workouts} workout${day.workouts === 1 ? '' : 's'}, ${day.runs} run${day.runs === 1 ? '' : 's'}`

  return (
    <span
      title={label}
      className="flex aspect-square items-center justify-center rounded-sm border font-mono text-[10px]"
      style={{
        // Empty is an outline, never a fill.
        borderColor: total === 0 ? 'var(--color-rule)' : 'transparent',
        background:
          total === 0
            ? 'transparent'
            : day.workouts > 0 && day.runs > 0
              ? 'var(--color-accent)'
              : day.workouts > 0
                ? categoryVar('cat-1')
                : categoryVar('cat-3'),
        color: total === 0 ? 'var(--color-ink-3)' : 'var(--color-ground)',
      }}
    >
      {day.dayOfMonth}
    </span>
  )
}
