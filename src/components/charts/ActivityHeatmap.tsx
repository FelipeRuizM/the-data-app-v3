import { useId } from 'react'
import { Label } from '../ui'
import { seqVar } from '../ui/tokens'
import { activeHourRange, type Heatmap } from '../../utils/analytics'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * When training happens — weekday × hour, on the sequential ramp (§4, §5).
 *
 * The rule that matters: **zero is not on the ramp.** An empty cell is drawn as
 * a `--rule` outline, never as `--seq-1`, because "never trained at 6am" and
 * "trained once at 6am" must not look the same. That is the single most common
 * way a heatmap lies.
 *
 * Rows are days starting SUNDAY, matching the streak week (D-15). Columns are
 * trimmed to the hours actually used — eight empty pre-dawn columns would cost
 * the real ones their width at 375px.
 */
export function ActivityHeatmap({ heatmap }: { heatmap: Heatmap }) {
  const titleId = useId()
  const { from, to } = activeHourRange(heatmap)
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)

  if (heatmap.total === 0) return null

  const cell = (day: number, hour: number) =>
    heatmap.cells.find((c) => c.day === day && c.hour === hour)?.count ?? 0

  const size = 100 / hours.length

  return (
    <figure className="m-0 flex flex-col gap-3">
      <Label as="h3">
        <span id={titleId}>When you train</span>
      </Label>

      <div className="overflow-x-auto">
        <table
          aria-hidden="true"
          className="w-full min-w-[280px] border-separate border-spacing-[2px]"
        >
          <tbody>
            {DAYS.map((label, day) => (
              <tr key={label}>
                <th
                  scope="row"
                  className="pr-2 text-right font-mono text-label font-normal tracking-[0.1em] text-ink-3 uppercase"
                >
                  {label}
                </th>
                {hours.map((hour) => {
                  const count = cell(day, hour)
                  const fill = seqVar(count, heatmap.max)
                  return (
                    <td key={hour} style={{ width: `${size}%` }} className="p-0">
                      <span
                        className="block aspect-square rounded-[1px]"
                        style={
                          fill === null
                            ? // Never trained in this hour: an outline, not a
                              // colour. See the note above.
                              { boxShadow: 'inset 0 0 0 1px var(--color-rule)' }
                            : { background: fill }
                        }
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td />
              {hours.map((hour) => (
                <td
                  key={hour}
                  className="pt-1 text-center font-mono text-[9px] text-ink-3 tabular-nums"
                >
                  {/* Every third hour, so the labels don't collide at 375px. */}
                  {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <figcaption className="font-mono text-label tracking-[0.12em] text-ink-3 uppercase">
        {heatmap.total} activities by weekday and hour · busiest cell {heatmap.max}
      </figcaption>

      {/* The text alternative every chart owes (§5, §9). */}
      <div className="sr-only">
        <table>
          <caption>Activities by weekday and hour</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {hours.map((h) => (
                <th key={h} scope="col">{`${String(h).padStart(2, '0')}:00`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((label, day) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {hours.map((hour) => (
                  <td key={hour}>{cell(day, hour)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
