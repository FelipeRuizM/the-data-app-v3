import { useEffect, useMemo, useState } from 'react'
import { get, ref } from 'firebase/database'
import { Button, Label } from '../../components/ui'
import { StateBlock } from '../../components/StateBlock'
import { useAuth } from '../../auth/hooks'
import { useProfile } from '../../data/useProfile'
import { db } from '../../lib/firebase'
import { formatDay, formatDuration, formatTime } from '../../lib/dates'
import { applyTimeFix } from '../../lib/writes'
import { planTimeFix, toLocalInputValue, type TimeEdit } from '../../lib/timeFix'
import type { RawWorkout } from '../../types'

/**
 * Bulk-fix workout timestamps (D-66).
 *
 * **Unlinked on purpose.** Nothing navigates here; it is reached by typing
 * `#/workouts/fix-times`. It is a maintenance tool for correcting clocks that
 * were wrong at import, not a feature of the app, and a nav entry would
 * advertise a page whose job is to stop being needed.
 *
 * It writes **only** `start_time` and `end_time`, as a targeted multi-path
 * update. Every other field — and every set — is untouched by construction, not
 * by this page remembering to copy it. See `planTimeFix` for why the end shifts
 * with the start rather than being recomputed.
 */
export function FixTimes() {
  const { profileUid, canWrite } = useAuth()
  const state = useProfile()

  const [raw, setRaw] = useState<Record<string, RawWorkout> | null>(null)
  const [rawError, setRawError] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  /**
   * The RAW records, read separately from the shared profile.
   *
   * The normalized profile has already parsed the timestamps into `Date`, and
   * `durationMinutes` is null for an implausible span (D-19) — which is exactly
   * the kind of record this page exists to fix. The raw strings are the only
   * honest basis for "shift the end by the same amount the start moved".
   */
  useEffect(() => {
    if (!profileUid) return
    let cancelled = false
    get(ref(db(), `users/${profileUid}/workouts`))
      .then((snap) => {
        if (cancelled) return
        setRaw(snap.exists() ? (snap.val() as Record<string, RawWorkout>) : {})
      })
      .catch((e: unknown) => {
        if (!cancelled) setRawError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [profileUid])

  const rows = useMemo(() => {
    if (state.status !== 'ready') return []
    const needle = query.trim().toLowerCase()
    return [...state.data.profile.workouts]
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .filter(
        (w) =>
          needle === '' ||
          w.title.toLowerCase().includes(needle) ||
          formatDay(w.startTime).toLowerCase().includes(needle) ||
          (w.category ?? '').toLowerCase().includes(needle),
      )
  }, [state, query])

  const plan = useMemo(() => {
    if (state.status !== 'ready' || !profileUid || !raw) return null
    const list: TimeEdit[] = Object.entries(edits).map(([id, startLocal]) => ({
      id,
      startLocal,
    }))
    return planTimeFix(profileUid, state.data.profile.workouts, raw, list)
  }, [state, profileUid, raw, edits])

  if (state.status === 'loading' || (state.status === 'ready' && raw === null)) {
    return (
      <Page>
        <div className="h-24 w-full rounded-sm bg-rule" aria-busy="true" />
      </Page>
    )
  }

  if (state.status !== 'ready' || !profileUid || !canWrite) {
    return (
      <Page>
        <StateBlock
          label="No access"
          title="This needs a writable profile."
          body="Sign in as an account that owns its own data."
        />
      </Page>
    )
  }

  if (rawError) {
    return (
      <Page>
        <StateBlock
          label="Couldn’t load"
          title="Something went wrong."
          body={rawError}
        />
      </Page>
    )
  }

  const onSave = async () => {
    if (!plan || plan.changed === 0) return
    setSaving(true)
    setSaveError(null)
    setSavedCount(null)
    try {
      await applyTimeFix(plan.updates)
      setSavedCount(plan.changed)
      setEdits({})
      // Re-read the raw records so the next edit shifts from the NEW end time
      // rather than the one that was just replaced.
      const snap = await get(ref(db(), `users/${profileUid}/workouts`))
      setRaw(snap.exists() ? (snap.val() as Record<string, RawWorkout>) : {})
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page>
      <label className="flex flex-col gap-1">
        <Label>Find</Label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, date or category"
          className="w-full min-w-0 rounded-sm border border-rule bg-transparent px-3 py-2 text-ink-0 placeholder:text-ink-3"
        />
      </label>

      {saveError ? (
        <div role="alert" className="border-l-2 border-accent py-1 pl-3">
          <p className="m-0 text-sm text-ink-1">Couldn’t save: {saveError}</p>
        </div>
      ) : null}

      {savedCount !== null ? (
        <p
          role="status"
          className="m-0 font-mono text-label tracking-[0.12em] text-ink-2 uppercase"
        >
          {savedCount} workout{savedCount === 1 ? '' : 's'} moved
        </p>
      ) : null}

      {rows.length === 0 ? (
        <StateBlock
          label="Nothing here"
          title="No workout matches that."
          body="Clear the search to see everything again."
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0 p-0">
          {rows.map((w) => {
            const stored = toLocalInputValue(w.startTime)
            const current = edits[w.id] ?? stored
            const dirty = current !== stored
            return (
              <li
                key={w.id}
                className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-rule py-4 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-ink-0">{w.title}</span>
                  <span className="flex flex-wrap gap-x-3 font-mono text-xs text-ink-2">
                    <span>
                      {formatDay(w.startTime)} · {formatTime(w.startTime)}
                    </span>
                    <span>{formatDuration(w.durationMinutes)}</span>
                    {w.category ? <span>{w.category}</span> : null}
                  </span>
                </div>

                <input
                  type="datetime-local"
                  value={current}
                  aria-label={`New date and time for ${w.title}`}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [w.id]: e.target.value }))
                  }
                  className={
                    'w-full min-w-0 rounded-sm border bg-transparent px-3 py-2 text-ink-0 sm:w-auto ' +
                    (dirty ? 'border-accent' : 'border-rule')
                  }
                />
              </li>
            )
          })}
        </ul>
      )}

      {/* Sticky, because the list is 81 rows long and a save button at the
          bottom of it is a save button nobody finds. */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-rule bg-ground py-4">
        <Button
          variant="primary"
          disabled={saving || !plan || plan.changed === 0}
          onClick={() => void onSave()}
        >
          {saving
            ? 'Saving…'
            : plan && plan.changed > 0
              ? `Save ${plan.changed} change${plan.changed === 1 ? '' : 's'}`
              : 'No changes'}
        </Button>
        {plan && plan.rejected.length > 0 ? (
          <span role="alert" className="font-mono text-xs text-accent">
            {plan.rejected.length} row(s) have an unusable date
          </span>
        ) : null}
      </div>
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <Label as="h1">Fix workout times</Label>
      </div>
      {children}
    </div>
  )
}
