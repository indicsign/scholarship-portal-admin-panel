/* Shared presentational primitives.
 *
 * Components only. The hooks that used to live here are in lib/hooks.ts and
 * lib/announce.ts: a module that exports both components and plain functions
 * breaks Fast Refresh, so the split is structural rather than stylistic.
 *
 * What they share is one job — making the accessibility requirements of
 * section 7.1 the default rather than something each screen has to remember.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react'

/* --- field -------------------------------------------------------------------
 *
 * Wires the label, the hint and the error message to the control by id. Doing
 * this by hand at each call site is how a form ends up with three labelled
 * inputs and one that a screen reader announces as "edit text, blank". */

interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: (props: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
    required?: boolean
  }) => ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ')

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>

      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        required,
      })}

      {hint && <span className="hint" id={hintId}>{hint}</span>}
      {/* role="alert" so a validation failure is spoken when it appears,
          rather than only when the field is next focused. */}
      {error && <span className="error" id={errorId} role="alert">{error}</span>}
    </div>
  )
}

/* --- dialog --------------------------------------------------------------------
 *
 * Built on <dialog showModal()>, which gives focus trapping, Escape-to-close,
 * inertness of the page behind, and the correct role — all natively, and all
 * things a div-based modal has to reimplement and usually gets wrong. */

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /* Wider, for a form long enough that the default column turns it into a
     scroll. Not the default: a dialog asking one question reads better narrow,
     and a confirmation stretched to 52rem looks like a mistake. */
  wide?: boolean
}

export function Dialog({ open, title, onClose, children, footer, wide }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  // Escape fires the dialog's own cancel event; routing it through onClose
  // keeps React state in step with the element's open attribute.
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const cancel = (e: Event) => { e.preventDefault(); onClose() }
    el.addEventListener('cancel', cancel)
    return () => el.removeEventListener('cancel', cancel)
  }, [onClose])

  return (
    <dialog ref={ref} aria-labelledby={titleId} className={wide ? 'wide' : undefined}>
      <div className="head">
        <h2 id={titleId}>{title}</h2>
      </div>
      <div className="body">{children}</div>
      {footer && <div className="foot">{footer}</div>}
    </dialog>
  )
}

/* --- pills ---------------------------------------------------------------------
 *
 * Colour never carries meaning alone: the label is always present, so the
 * distinction survives monochrome rendering and colour vision deficiency. */

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

const ORG_STATUS_TONE: Record<string, Tone> = {
  APPROVED: 'ok',
  PENDING_APPROVAL: 'warn',
  SUSPENDED: 'danger',
  REJECTED: 'neutral',
}

export function StatusPill({ status }: { status: string }) {
  const label = status === 'PENDING_APPROVAL' ? 'Pending' : status[0] + status.slice(1).toLowerCase()
  return <Pill tone={ORG_STATUS_TONE[status] ?? 'neutral'}>{label}</Pill>
}

/* --- states ----------------------------------------------------------------------- */

export function Loading({ label = 'Loading' }: { label?: string }) {
  // aria-busy rather than a spinner graphic: there is nothing to see, and the
  // status role announces it without a decorative element to hide.
  return <div className="state" role="status" aria-busy="true">{label}…</div>
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {hint}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  const requestId = (error as { requestId?: string })?.requestId

  return (
    <div className="alert danger" role="alert">
      <p>{message}</p>
      {requestId && (
        <p className="mono" style={{ fontSize: 12 }}>
          Reference: {requestId}
        </p>
      )}
      {onRetry && (
        <p><button className="sm" onClick={onRetry}>Try again</button></p>
      )}
    </div>
  )
}

/* --- pagination -------------------------------------------------------------------- */

interface PagerProps {
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  onPage: (page: number) => void
}

export function Pager({ page, pageSize, total, hasMore, onPage }: PagerProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav className="pager" aria-label="Pagination">
      <span>
        {total === 0 ? 'No results' : `${first}–${last} of ${total}`}
      </span>
      <span className="right" />
      <button className="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <button className="sm" onClick={() => onPage(page + 1)} disabled={!hasMore}>
        Next
      </button>
    </nav>
  )
}
