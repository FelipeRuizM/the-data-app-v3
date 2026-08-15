import { useEffect, useState } from 'react'
import { Button, Label } from '../ui'
import { Section, SaveNote } from './Section'
import { useSave } from './useSave'
import { saveSettings } from '../../lib/settingsWrites'
import { validateRamp } from '../../utils/calculator'
import type { CalculatorSettings, RampSet } from '../../types'

/**
 * The warm-up and feeder percentages (§8).
 *
 * "Those ranges are a preference, not a law" — so they are editable and
 * persisted, and the code-level defaults are only a starting point. The §8
 * ranges are shown as guidance beside each ramp rather than enforced: a lifter
 * who wants a 35% warm-up is not making a mistake the app should refuse.
 *
 * The rounding increments are per-unit and per-account, because some machines
 * and dumbbells step by 1–2 kg (D-12).
 */
export function CalculatorEditor({
  uid,
  calculator,
}: {
  uid: string
  calculator: CalculatorSettings
}) {
  const stored = JSON.stringify(calculator)
  const [draft, setDraft] = useState<CalculatorSettings>(calculator)
  const { status, save } = useSave()

  useEffect(() => {
    setDraft(JSON.parse(stored) as CalculatorSettings)
  }, [stored])

  const dirty = JSON.stringify(draft) !== stored
  const errors = [...validateRamp(draft.warmup), ...validateRamp(draft.feeders)]
  const roundingValid = draft.roundingKg > 0 && draft.roundingLb > 0

  const setRamp = (key: 'warmup' | 'feeders', ramp: RampSet[]) =>
    setDraft({ ...draft, [key]: ramp })

  return (
    <Section
      title="Warm-up & feeder calculator"
      description="Percentages of your working weight, and the smallest weight you can actually load."
    >
      <RampEditor
        legend="Warm-up sets"
        hint="20–30% for 6–12 reps. Blood flow and joint lubrication, not fatigue."
        ramp={draft.warmup}
        onChange={(r) => setRamp('warmup', r)}
      />
      <RampEditor
        legend="Feeder sets"
        hint="First 40–50% for 4–6 reps, then 50–75% with reps dropping as the weight rises."
        ramp={draft.feeders}
        onChange={(r) => setRamp('feeders', r)}
      />

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="p-0">
          <Label>Rounding increment</Label>
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="In kilograms"
            value={draft.roundingKg}
            step={0.5}
            onChange={(v) => setDraft({ ...draft, roundingKg: v })}
          />
          <NumberField
            label="In pounds"
            value={draft.roundingLb}
            step={1}
            onChange={(v) => setDraft({ ...draft, roundingLb: v })}
          />
        </div>
      </fieldset>

      {errors.length > 0 ? (
        <ul role="alert" className="m-0 flex list-none flex-col gap-1 p-0">
          {errors.map((e) => (
            <li key={e} className="font-mono text-xs text-accent">
              {e}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={
            !dirty || errors.length > 0 || !roundingValid || status.state === 'saving'
          }
          onClick={() => void save(() => saveSettings(uid, { calculator: draft }))}
        >
          Save calculator
        </Button>
        <SaveNote status={status} dirty={dirty} />
      </div>
    </Section>
  )
}

/** One ramp — a list of percent/reps rows that can grow and shrink. */
function RampEditor({
  legend,
  hint,
  ramp,
  onChange,
}: {
  legend: string
  hint: string
  ramp: RampSet[]
  onChange: (next: RampSet[]) => void
}) {
  const setAt = (i: number, patch: Partial<RampSet>) =>
    onChange(ramp.map((r, j) => (i === j ? { ...r, ...patch } : r)))

  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="p-0">
        <Label>{legend}</Label>
      </legend>
      <p className="m-0 text-xs text-ink-2">{hint}</p>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {ramp.map((r, i) => (
          <li key={i} className="flex items-end gap-2">
            <span className="w-6 shrink-0 pb-2 font-mono text-xs text-ink-2 tabular-nums">
              {i + 1}
            </span>
            <NumberField
              label="Percent"
              value={r.percent}
              step={1}
              onChange={(v) => setAt(i, { percent: v })}
            />
            <NumberField
              label="Reps"
              value={r.reps}
              step={1}
              onChange={(v) => setAt(i, { reps: v })}
            />
            <button
              type="button"
              aria-label={`Remove ${legend.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(ramp.filter((_, j) => j !== i))}
              className="size-9 shrink-0 cursor-pointer rounded-sm border border-rule bg-transparent font-mono text-sm text-ink-1 hover:border-ink-3 hover:text-ink-0"
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>

      <Button
        className="self-start"
        onClick={() =>
          onChange([...ramp, { percent: ramp.at(-1)?.percent ?? 50, reps: 5 }])
        }
      >
        Add set
      </Button>
    </fieldset>
  )
}

/**
 * A numeric field that keeps what was typed while it is being typed.
 *
 * Parsing on every keystroke makes "2.5" impossible to enter — the moment "2."
 * is parsed it becomes 2 and the cursor jumps. The raw string is held locally
 * and only a parseable value is pushed up.
 */
function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step: number
  onChange: (next: number) => void
}) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText((prev) => (Number(prev) === value ? prev : String(value)))
  }, [value])

  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
        {label}
      </span>
      <input
        inputMode="decimal"
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const parsed = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isFinite(parsed)) onChange(parsed)
        }}
        className="w-full min-w-0 rounded-sm border border-rule bg-transparent px-2 py-2 font-mono text-sm text-ink-0 tabular-nums"
      />
    </label>
  )
}
