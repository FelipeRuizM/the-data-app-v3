import { useState } from 'react'
import {
  Badge,
  Button,
  CategoryTag,
  Chip,
  Label,
  Rule,
  StatFigure,
} from '../components/ui'
import { CATEGORY_TOKENS, SEQ_TOKENS } from '../components/ui/tokens'
import { ComboBox } from '../components/ComboBox'
import { CategoryPills } from '../components/CategoryPills'
import { PeoplePicker } from '../components/PeoplePicker'
import { SetBySetChart } from '../components/charts/SetBySetChart'
import type { SetPoint } from '../utils/setSeries'
import { SET_TYPES, SET_TYPE_LABEL } from '../types'
import type { ConfigCategory } from '../lib/config'

/* Every token and every component in isolation. A component that isn't here
   isn't done (CLAUDE.md §5). */

function Section({ title, note, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-5 py-10">
      <div className="flex flex-col gap-2 border-b border-rule pb-3">
        <h2 className="m-0 text-xl font-semibold text-ink-0">{title}</h2>
        {note ? <p className="m-0 max-w-prose text-sm text-ink-2">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}
type SectionProps = { title: string; note?: string; children: React.ReactNode }

function Swatch({ token, use }: { token: string; use: string }) {
  return (
    <div className="grid grid-cols-[2.5rem_1fr] items-center gap-3 border-b border-rule py-2">
      <span
        className="h-6 w-10 rounded-sm"
        style={{
          background: `var(--color-${token})`,
          // The ground is invisible against itself; outline it so it's reviewable.
          outline: token === 'ground' ? '1px solid var(--color-rule)' : 'none',
        }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-sm text-ink-1">--color-{token}</span>
        <span className="text-sm text-ink-2">{use}</span>
      </span>
    </div>
  )
}

export function Styleguide() {
  const [metric, setMetric] = useState<'sets' | 'reps' | 'volume'>('sets')
  const [title, setTitle] = useState('')
  const [reps, setReps] = useState('8')
  const [exercise, setExercise] = useState('')
  const [difficulty, setDifficulty] = useState(6)
  const [category, setCategory] = useState('Push')
  const [people, setPeople] = useState<string[]>(['Person A'])

  return (
    <div className="pb-16">
      <header className="flex flex-col gap-3 py-12">
        <Label>the-data-app-v3 · styleguide</Label>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink-0">
          Every token, every component.
        </h1>
        <p className="m-0 max-w-prose text-ink-1">
          Reviewed in isolation so the system can be judged without navigating the app.
          Colours here are the validated set — see the note under the categorical
          palette before changing any of them.
        </p>
      </header>

      <Section
        title="Ground and neutrals"
        note="One background. No card layer, no elevation, no shadow. Separation comes from whitespace and hairline rules only."
      >
        <div>
          <Swatch token="ground" use="the only background" />
          <Swatch token="rule" use="hairlines, chart gridlines" />
          <Swatch token="ink-3" use="axes, disabled, timestamps" />
          <Swatch token="ink-2" use="labels, metadata, mono chrome" />
          <Swatch token="ink-1" use="prose" />
          <Swatch token="ink-0" use="headlines, big figures" />
        </div>
      </Section>

      <Section
        title="The one accent"
        note="The primary data colour, and the only thing allowed to shout. If it appears somewhere that isn't data, that's a bug."
      >
        <div>
          <Swatch token="accent" use="primary data colour · 6.31:1 on ground" />
          <Swatch token="accent-dim" use="de-emphasised marks, same series" />
        </div>
      </Section>

      <Section
        title="Categorical palette"
        note="The one place extra hues appear. Categories pick from this set by token id — settings stores 'cat-3', never a hex — so a renamed split can never introduce an off-system colour. Assigned in fixed order, never cycled."
      >
        <div>
          {CATEGORY_TOKENS.map((t, i) => (
            <Swatch
              key={t}
              token={t}
              use={
                i < 3
                  ? `currently ${['Push', 'Pull', 'Legs'][i]}`
                  : 'available for new categories'
              }
            />
          ))}
          <Swatch
            token="cat-none"
            use="uncategorized or deleted — neutral, not error"
          />
        </div>
        <div className="border-l-2 border-accent py-1 pl-4">
          <p className="m-0 text-sm text-ink-1">
            <strong className="text-ink-0">
              Do not brighten cat-1 to a proper gold.
            </strong>{' '}
            It reads as a muddy bronze on purpose. Red-green colourblindness collapses
            that hue axis, leaving lightness as the only cue, so the warm hue must sit
            darker than cat-2. Three brighter golds were tested and all failed at ΔE
            4.9–6.9 — indistinguishable from the green for roughly 1 in 12 men. The
            current set passes all pairs at ΔE 11.4 deutan, 15.6 normal vision.
          </p>
        </div>
      </Section>

      <Section
        title="Sequential ramp"
        note="Magnitude only — heatmaps and intensity. One hue, terminating exactly on the accent, so the brightest cell and the primary data colour are the same thing."
      >
        <div className="flex gap-0.5">
          {SEQ_TOKENS.map((t) => (
            <div
              key={t}
              className="h-11 flex-1 rounded-sm"
              style={{ background: `var(--color-${t})` }}
            />
          ))}
        </div>
        <div className="flex justify-between">
          <Label>1 session</Label>
          <Label>5+</Label>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="h-6 w-10 rounded-sm border"
            style={{ borderColor: 'var(--color-rule)' }}
          />
          <span className="text-sm text-ink-2">
            Zero is not on the ramp — an empty cell is an outline, because
            &ldquo;never&rdquo; must not look like &ldquo;once&rdquo;.
          </span>
        </div>
      </Section>

      <Section
        title="Type"
        note="The hierarchy inverts the usual: labels are small, monospaced, letter-spaced and dim; numbers are large and bright. Labels should read as annotations on a plot, not as interface."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label>Label · IBM Plex Mono</Label>
            <p className="m-0 text-ink-1">
              Prose sits in IBM Plex Sans at a comfortable measure. The grotesk carries
              reading; the mono carries every number and every label.
            </p>
          </div>

          <Rule />

          <div className="flex flex-col gap-2">
            <Label>Tabular figures — these columns must align</Label>
            <div className="flex gap-10">
              <div className="flex flex-col">
                <span className="font-mono text-xs text-ink-2">tabular (correct)</span>
                <span className="font-mono text-lg text-ink-0">1,247.50</span>
                <span className="font-mono text-lg text-ink-0">
                  &nbsp;&nbsp;&nbsp;98.25
                </span>
                <span className="font-mono text-lg text-ink-0">&nbsp;&nbsp;110.00</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-xs text-ink-2">
                  proportional (wrong)
                </span>
                <span
                  className="text-lg text-ink-2"
                  style={{ fontVariantNumeric: 'proportional-nums' }}
                >
                  1,247.50
                </span>
                <span
                  className="text-lg text-ink-2"
                  style={{ fontVariantNumeric: 'proportional-nums' }}
                >
                  &nbsp;&nbsp;&nbsp;98.25
                </span>
                <span
                  className="text-lg text-ink-2"
                  style={{ fontVariantNumeric: 'proportional-nums' }}
                >
                  &nbsp;&nbsp;110.00
                </span>
              </div>
            </div>
            <p className="m-0 text-sm text-ink-2">
              If the left column ever stops aligning, the Plex Mono webfont failed to
              load and something is falling back.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Stat figures"
        note="The editorial treatment: one huge figure, dim label beneath, generous vertical rhythm. Used on Records and the monthly report."
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-6 gap-y-8">
          <StatFigure
            value="14,820"
            unit="KG"
            label="Volume"
            delta={{ text: '↑ 2,140 · +16.9%', direction: 'up' }}
          />
          <StatFigure
            value="6:42"
            unit="/KM"
            label="Avg pace"
            delta={{ text: '↓ 0:18 · faster', direction: 'up' }}
          />
          <StatFigure
            value="18"
            label="Sessions"
            delta={{ text: '— no change', direction: 'flat' }}
          />
          <StatFigure
            value="142"
            unit="BPM"
            label="Avg heart rate"
            delta={{ text: '↓ 4 · −2.7%', direction: 'down' }}
          />
        </div>
      </Section>

      <Section title="Buttons and chips">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Log workout</Button>
          <Button>Edit</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Inline toggles — the legend pattern</Label>
          <div className="flex flex-wrap gap-1.5">
            {(['sets', 'reps', 'volume'] as const).map((m) => (
              <Chip key={m} pressed={metric === m} onClick={() => setMetric(m)}>
                {m}
              </Chip>
            ))}
          </div>
          <span className="font-mono text-xs text-ink-2">selected: {metric}</span>
        </div>
      </Section>

      <Section
        title="Category tags and badges"
        note="A hairline dot plus a mono label, never a filled pill — a pill would put a block of colour beside a number and compete with the data. Set types stay neutral; only an earned record gets the accent."
      >
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <CategoryTag token="cat-1">Push</CategoryTag>
          <CategoryTag token="cat-2">Pull</CategoryTag>
          <CategoryTag token="cat-3">Legs</CategoryTag>
          <CategoryTag token={null}>Uncategorized</CategoryTag>
          <CategoryTag token="cat-deleted-by-owner">Deleted category</CategoryTag>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* The LABEL, not the stored value — `normal` reads as "working"
              everywhere a human sees it (D-57). */}
          {SET_TYPES.map((s) => (
            <Badge key={s}>{SET_TYPE_LABEL[s]}</Badge>
          ))}
          <Badge pr>weight PR</Badge>
          <Badge pr>volume PR</Badge>
          <Badge pr>1RM PR</Badge>
        </div>
      </Section>

      <Section
        title="Form controls"
        note="The log forms are the app's primary surface. Nothing here may compute below 16px — iOS Safari zooms on focus below that and does not zoom back out (D-55)."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Label>Text</Label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Placeholder"
              className={demoInput}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Number</Label>
            <input
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="reps"
              className={demoInput}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <ComboBox
              label="ComboBox — type, filter, or add"
              value={exercise}
              onChange={setExercise}
              options={DEMO_EXERCISES}
              placeholder="Start typing…"
            />
            <span className="font-mono text-xs text-ink-2">
              value: {exercise === '' ? '(empty)' : exercise}
            </span>
          </div>
          <label className="flex flex-col gap-1">
            <Label>Slider</Label>
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm text-ink-0 tabular-nums">
                {difficulty} / 10
              </span>
            </span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
          </label>
        </div>

        <CategoryPills
          value={category}
          onChange={setCategory}
          categories={DEMO_CATEGORIES}
        />

        <PeoplePicker
          selected={people}
          onChange={setPeople}
          options={['Person A', 'Person B', 'Person C']}
        />
      </Section>

      <Section
        title="Charts"
        note="Only the set-by-set plot is here so far — the heatmap, tally bars, muscle-group charts and monthly trend predate this section and are still only reviewable inside their pages."
      >
        <SetBySetChart points={DEMO_SETS} units="kg" />
      </Section>

      <Section
        title="Error boundary"
        note="Route-level, so one bad aggregation can't blank the app. Rendered here as a specimen; the live boundary wraps every route."
      >
        <div className="border-l-2 border-rule pl-4">
          <Label>Something broke on this page</Label>
          <p className="m-0 mt-2 max-w-prose text-ink-1">
            The rest of the app still works — use the navigation to go somewhere else.
          </p>
        </div>
      </Section>
    </div>
  )
}

const demoInput =
  'w-full min-w-0 rounded-sm border border-rule bg-transparent px-3 py-2 text-ink-0 placeholder:text-ink-3'

const DEMO_EXERCISES = [
  'Bench Press (Barbell)',
  'Bent Over Row (Barbell)',
  'Pull Up',
  'Squat (Barbell)',
]

const DEMO_CATEGORIES: ConfigCategory[] = [
  { id: 'push', name: 'Push', colorToken: 'cat-1', order: 0 },
  { id: 'pull', name: 'Pull', colorToken: 'cat-2', order: 1 },
  { id: 'legs', name: 'Legs', colorToken: 'cat-3', order: 2 },
]

/** Two sessions, with a bodyweight set and a PR, so every branch is visible. */
const DEMO_SETS: SetPoint[] = [
  [8, 40, 0],
  [8, 42.5, 0],
  [6, 45, 0],
  [10, 45, 1],
  [8, 50, 1],
  [6, 55, 1],
].map(([reps, weight, session], index) => ({
  index,
  date: new Date(2026, 3, 8 + (session ?? 0) * 7, 17, 0),
  workoutId: `w${session}`,
  setInSession: (index % 3) + 1,
  session: session!,
  setType: 'normal' as const,
  reps: reps!,
  weightKg: weight!,
  volumeKg: reps! * weight!,
  prMetrics: index === 5 ? (['weight'] as const).slice() : [],
}))
