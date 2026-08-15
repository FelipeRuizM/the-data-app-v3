import { Label } from '../components/ui'
import { StateBlock } from '../components/StateBlock'
import { CategoryEditor } from '../components/admin/CategoryEditor'
import { StringListEditor } from '../components/admin/StringListEditor'
import { BaseExercises } from '../components/admin/BaseExercises'
import { useAuth } from '../auth/hooks'
import { useProfile } from '../data/useProfile'
import { saveNamedCatalog, saveStringList } from '../lib/configWrites'

/**
 * The global admin panel (§4, D-17b) — "settings in the admin panel are
 * global". Everything on this page writes `/config`, which every account reads
 * and only an admin may write.
 *
 * Route-guarded by <RequireAdmin> *and* hidden from the nav. Hiding alone would
 * leave a typed URL working, and the guard alone would advertise a page nobody
 * else can open. The rules are still the real boundary: `/config` rejects a
 * non-admin write regardless of what the client renders.
 */
export function Admin() {
  const state = useProfile()
  const { profileUid } = useAuth()

  if (state.status === 'loading') {
    return (
      <Page>
        <div className="h-24 w-full rounded-sm bg-rule" aria-busy="true" />
      </Page>
    )
  }

  if (state.status !== 'ready' || !profileUid) {
    return (
      <Page>
        <StateBlock
          label={state.status === 'error' ? 'Couldn’t load' : 'No access'}
          title={
            state.status === 'error'
              ? 'Something went wrong.'
              : 'This profile isn’t readable.'
          }
          body={
            state.status === 'error'
              ? state.message
              : 'The database rules rejected the read.'
          }
        />
      </Page>
    )
  }

  const { profile, config } = state.data

  // Base-tier entries only. A base exercise shadowed by a same-named entry in
  // this admin's own tier won't appear — the merged catalog keeps the user's
  // (D-20) — which is correct for every other page and a known blind spot here.
  const baseExercises = profile.exercises.filter((e) => e.tier === 'base')

  const groupsInUse = new Set(profile.exercises.map((e) => e.muscleGroup))

  return (
    <Page>
      <CategoryEditor
        uid={profileUid}
        configKey="workoutCategories"
        title="Workout categories"
        description="Your training splits, and the colour each one carries everywhere in the app."
        categories={config.workoutCategories}
        noun="workout"
      />

      <CategoryEditor
        uid={profileUid}
        configKey="runTypes"
        title="Run types"
        description="The same idea for runs."
        categories={config.runTypes}
        noun="run"
      />

      <StringListEditor
        title="Muscle groups"
        description="What exercises can be filed under. Excluded from the monthly radar: Core and Other, which distort the balance shape."
        values={config.muscleGroups}
        addLabel="Add group"
        ordered
        onSave={(next) => saveStringList('muscleGroups', next)}
        blockRemove={(name) =>
          groupsInUse.has(name)
            ? `Exercises are still filed under ${name}. Re-file them first.`
            : null
        }
      />

      <StringListEditor
        title="Rep-based exercises"
        description="Exercises ranked on reps rather than weight — bodyweight work, where the load never changes. These show Max Reps as their headline record."
        values={config.repBasedExercises}
        addLabel="Add exercise"
        suggestions={profile.exercises.map((e) => e.name)}
        onSave={(next) => saveStringList('repBasedExercises', next)}
      />

      <BaseExercises exercises={baseExercises} muscleGroups={config.muscleGroups} />

      <StringListEditor
        title="Shoes"
        description="Offered when logging a run. Each account picks its own default in Settings."
        values={config.shoes}
        addLabel="Add shoes"
        onSave={(next) => saveNamedCatalog('shoes', next)}
      />

      <StringListEditor
        title="Watches"
        description="Same, for watches."
        values={config.watches}
        addLabel="Add watch"
        onSave={(next) => saveNamedCatalog('watches', next)}
      />
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-10 py-10">
      <div className="flex flex-col gap-2">
        <Label as="h1">Admin</Label>
        <p className="m-0 max-w-prose text-sm text-ink-2">
          Global vocabulary — shared by every account. Anything personal lives in
          Settings.
        </p>
      </div>
      {children}
    </div>
  )
}
