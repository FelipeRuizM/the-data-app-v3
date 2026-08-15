import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, Label } from './ui'

/**
 * A minimal accessible confirm dialog, hand-rolled rather than pulling in
 * Radix for one use — no card layer, no shadow, just a hairline border on the
 * ground (§5). CLAUDE.md permits headless primitives for dialogs specifically
 * "where accessibility matters"; the accessibility here is small enough
 * (focus trap + Escape + role) to own directly without adding a dependency.
 *
 * Used before every delete (D-5's "confirm dialog stating the affected record
 * count" pattern, applied here to a single record).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
  confirmDisabled = false,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Extra controls between the body and the buttons — the merge picker (D-5). */
  children?: ReactNode
  /** For a dialog whose action needs a choice made first. */
  confirmDisabled?: boolean
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // Destructive action: focus starts on Cancel, never on the confirm button.
    cancelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ground/80 p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        className="flex w-full max-w-sm flex-col gap-4 border border-rule bg-ground p-5"
      >
        <Label as="h2">
          <span id="confirm-dialog-title">{title}</span>
        </Label>
        <p id="confirm-dialog-body" className="m-0 text-sm text-ink-1">
          {body}
        </p>
        {children}
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
