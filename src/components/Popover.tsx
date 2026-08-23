import { useCallback, useEffect, useId, useRef, useState } from 'react'

/* A panel hung off a button in the top bar.
 *
 * Two of these exist — the bell and the account menu — and they share this
 * rather than each growing their own half-correct version of the behaviour that
 * makes a popover usable:
 *
 *   - Escape closes it and returns focus to the button. Without the return, a
 *     keyboard user who dismisses the panel is left with focus on <body> and
 *     has to tab from the top of the page again.
 *   - A pointer press outside closes it. On pointerdown rather than click, so a
 *     press that starts outside and releases inside cannot leave it open.
 *   - Focus leaving the panel closes it, which is what makes Tab work: tabbing
 *     past the last control moves on through the page instead of trapping.
 *   - Only one is open at a time, because two panels overlapping in the corner
 *     is nobody's intent.
 *
 * Deliberately not role="menu". That role promises arrow-key navigation between
 * items, and a promise the implementation does not keep is worse for a screen
 * reader than no promise: it is a group of buttons, announced as a group of
 * buttons, and Tab moves between them.
 */

let openPanel: (() => void) | null = null

export default function Popover({
  label, badge, children, align = 'end', className,
}: {
  /** The accessible name of the trigger. */
  label: string
  /** What the trigger shows: an icon, an avatar, a count. */
  badge: React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelID = useId()

  /* Two closers, and the difference is the ref.
   *
   * dismiss() returns focus to the trigger, which is what Escape owes a
   * keyboard user — without it focus lands on <body> and they tab from the top
   * of the page again. It reads the trigger ref, so it lives here and is called
   * only from the key handler in the effect below.
   *
   * close() is what the panel's own items get. It deliberately does *not*
   * return focus: those items navigate or open a dialog, and pulling focus back
   * to a button the operator has just left would fight whatever they clicked.
   * It touches no ref, which is also what keeps it safe to hand across the
   * render boundary to children(). */
  const close = useCallback(() => setOpen(false), [])

  const dismiss = useCallback(() => {
    setOpen(false)
    trigger.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    // Close whichever panel was already open, then register as the open one.
    openPanel?.()
    openPanel = () => setOpen(false)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        dismiss()
      }
    }
    function onDown(e: PointerEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    /* Focus moving out of the wrapper closes it. Guarded on relatedTarget:
     * a blur with nowhere to go — the window losing focus, or a click on the
     * page chrome — should leave the panel alone rather than snatching it away
     * while the operator alt-tabs to copy something. */
    function onFocusOut(e: FocusEvent) {
      const next = e.relatedTarget as Node | null
      if (next && !wrap.current?.contains(next)) setOpen(false)
    }

    // Captured now. By cleanup time the element may already be detached, and
    // removing the listener from a different node than it was added to leaves
    // it attached for as long as the old node lives.
    const node = wrap.current

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    node?.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      node?.removeEventListener('focusout', onFocusOut)
      if (openPanel) openPanel = null
    }
  }, [open, dismiss])

  return (
    <div className="popover-wrap" ref={wrap}>
      <button
        ref={trigger}
        className={className ? `topbar-btn ${className}` : 'topbar-btn'}
        aria-expanded={open}
        aria-controls={open ? panelID : undefined}
        onClick={() => setOpen(v => !v)}
      >
        {badge}
        <span className="sr-only">{label}</span>
      </button>

      {open && (
        <div className={`popover ${align}`} id={panelID}>
          {children(close)}
        </div>
      )}
    </div>
  )
}
