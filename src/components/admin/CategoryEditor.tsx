import { useState } from 'react'
import { Button, CategoryTag } from '../ui'
import { ConfirmDialog } from '../ConfirmDialog'
import { Section, SaveNote } from '../settings/Section'
import { useSave } from '../settings/useSave'
import { CATEGORY_TOKENS, categoryVar, type CategoryToken } from '../ui/tokens'
import {
  countCategoryUses,
  deleteCategory,
  renameCategory,
  saveCategory,
  saveCategoryOrder,
  type CategoryKey,
} from '../../lib/configWrites'
import type { ConfigCategory } from '../../lib/config'

/**
 * Workout categories and run types — name, palette token, order (§4, D-17).
 *
 * Two things make this different from the string lists next to it:
 *
 *  · the colour is stored as a TOKEN ID (`"cat-1"`), never a hex, which is what
 *    keeps "no raw hex in components" true even for owner-chosen colours (§5);
 *  · the name is denormalized onto every record, so renaming cascades (D-32)
 *    and deleting degrades those records to the neutral rather than breaking
 *    them (§4).
 */

type Dialog =
  | { mode: 'rename'; category: ConfigCategory; newName: string; records: number }
  | { mode: 'delete'; category: ConfigCategory; records: number }

export function CategoryEditor({
  uid,
  configKey,
  title,
  description,
  categories,
  noun,
}: {
  uid: string
  configKey: CategoryKey
  title: string
  description?: string | undefined
  categories: ConfigCategory[]
  /** What a record is called here — "workout" or "run". */
  noun: string
}) {
  const { status, save } = useSave()
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [adding, setAdding] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const names = categories.map((c) => c.name)
  const close = () => {
    setDialog(null)
    setEditing(null)
  }

  const add = async () => {
    const name = adding.trim()
    if (name === '') return
    if (names.includes(name)) {
      setProblem('That name already exists.')
      return
    }
    setProblem(null)
    // The next unused token, so a new category never silently duplicates a
    // colour already in play. Six exist; after that it wraps and the owner can
    // pick a different one explicitly.
    const used = new Set(categories.map((c) => c.colorToken))
    const token =
      CATEGORY_TOKENS.find((t) => !used.has(t)) ??
      CATEGORY_TOKENS[categories.length % CATEGORY_TOKENS.length]!
    const ok = await save(() =>
      saveCategory(configKey, {
        id: '',
        name,
        colorToken: token,
        order: categories.length,
      }),
    )
    if (ok) setAdding('')
  }

  const beginRename = async (category: ConfigCategory, next: string) => {
    const name = next.trim()
    if (name === '' || name === category.name) {
      setEditing(null)
      return
    }
    if (names.includes(name)) {
      setProblem('That name already exists.')
      setEditing(null)
      return
    }
    const records = await countCategoryUses(uid, configKey, category.name)
    setDialog({ mode: 'rename', category, newName: name, records })
  }

  const beginDelete = async (category: ConfigCategory) => {
    const records = await countCategoryUses(uid, configKey, category.name)
    setDialog({ mode: 'delete', category, records })
  }

  const confirm = () => {
    if (!dialog) return
    void save(async () => {
      if (dialog.mode === 'rename') {
        await renameCategory(uid, configKey, dialog.category, dialog.newName)
      } else {
        await deleteCategory(configKey, dialog.category.id)
      }
    }).then(() => close())
  }

  const move = (index: number, by: -1 | 1) => {
    const next = [...categories]
    const target = index + by
    if (target < 0 || target >= next.length) return
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    void save(() => saveCategoryOrder(configKey, next))
  }

  return (
    <Section title={title} description={description}>
      {categories.length === 0 ? (
        <p className="m-0 text-sm text-ink-2">
          None yet — the built-in defaults apply until you add one.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0 p-0">
          {categories.map((category, i) => (
            <li
              key={category.id}
              className="flex flex-col gap-2 border-b border-rule py-3"
            >
              {editing?.id === category.id ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editing.value}
                    aria-label={`New name for ${category.name}`}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void beginRename(category, editing.value)
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    className="min-w-0 flex-1 rounded-sm border border-rule bg-transparent px-2 py-1 text-sm text-ink-0"
                  />
                  <Button onClick={() => void beginRename(category, editing.value)}>
                    Save
                  </Button>
                  <Button onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <CategoryTag token={category.colorToken}>
                      {category.name}
                    </CategoryTag>
                  </span>
                  <SmallButton
                    label={`Move ${category.name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </SmallButton>
                  <SmallButton
                    label={`Move ${category.name} down`}
                    disabled={i === categories.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </SmallButton>
                  <TextAction
                    onClick={() =>
                      setEditing({ id: category.id, value: category.name })
                    }
                  >
                    Rename
                  </TextAction>
                  <TextAction onClick={() => void beginDelete(category)}>
                    Delete
                  </TextAction>
                </div>
              )}

              <SwatchPicker
                name={category.name}
                selected={category.colorToken}
                onPick={(token) =>
                  void save(() =>
                    saveCategory(configKey, { ...category, colorToken: token }),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
            Add {noun} {configKey === 'runTypes' ? 'type' : 'category'}
          </span>
          <input
            value={adding}
            onChange={(e) => {
              setAdding(e.target.value)
              setProblem(null)
            }}
            placeholder="Name"
            className="rounded-sm border border-rule bg-transparent px-3 py-2 text-sm text-ink-0 placeholder:text-ink-3"
          />
        </label>
        <Button onClick={() => void add()} disabled={status.state === 'saving'}>
          Add {configKey === 'runTypes' ? 'type' : 'category'}
        </Button>
      </div>

      {problem ? (
        <span role="alert" className="font-mono text-xs text-accent">
          {problem}
        </span>
      ) : null}
      <SaveNote status={status} />

      <ConfirmDialog
        open={dialog?.mode === 'rename'}
        title="Rename?"
        body={
          dialog?.mode === 'rename'
            ? `“${dialog.category.name}” becomes “${dialog.newName}”, and ${
                dialog.records === 0
                  ? `none of your ${noun}s carry the old name`
                  : `${dialog.records} of your ${noun}s will be rewritten to match`
              }.`
            : ''
        }
        confirmLabel="Rename"
        onConfirm={confirm}
        onCancel={close}
      >
        <p className="m-0 text-xs text-ink-2">
          Only your own records are rewritten — an account can write nothing but its own
          data. Other profiles keep the old name and show it in neutral grey.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.mode === 'delete'}
        title="Delete?"
        body={
          dialog?.mode === 'delete'
            ? dialog.records === 0
              ? `No ${noun} uses “${dialog.category.name}”.`
              : `${dialog.records} of your ${noun}s use “${dialog.category.name}”. They keep the label and fall back to neutral grey — nothing is lost, and you can re-file them later.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={confirm}
        onCancel={close}
      />
    </Section>
  )
}

/**
 * The six categorical tokens as swatches.
 *
 * A picker of the validated palette, not a colour input — the palette passed a
 * colourblind-separation validator as a SET, and a free hex field would let a
 * well-meaning owner break that in one click (§5).
 */
function SwatchPicker({
  name,
  selected,
  onPick,
}: {
  name: string
  selected: CategoryToken
  onPick: (token: CategoryToken) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase">
        Colour
      </span>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            aria-label={`${token} for ${name}`}
            aria-pressed={token === selected}
            onClick={() => onPick(token)}
            className={
              'size-6 cursor-pointer rounded-sm border transition-colors duration-[120ms] ' +
              (token === selected ? 'border-ink-0' : 'border-rule hover:border-ink-3')
            }
          >
            <span
              aria-hidden="true"
              className="block size-full rounded-[1px]"
              style={{ background: categoryVar(token) }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function SmallButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="size-8 shrink-0 cursor-pointer rounded-sm border border-rule bg-transparent font-mono text-sm text-ink-1 transition-colors duration-[120ms] hover:border-ink-3 hover:text-ink-0 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}

function TextAction({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-label tracking-[0.12em] text-ink-2 uppercase transition-colors duration-[120ms] hover:text-accent"
    >
      {children}
    </button>
  )
}
