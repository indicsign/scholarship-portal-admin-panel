import { useCallback, useRef, useState, type ReactNode } from 'react'

import { AnnouncerContext, type Tone } from '../lib/announce'

/* Confirmation that something happened.
 *
 * "ARIA live regions announcing asynchronous status changes" is listed in
 * section 7.1 as a measure applied uniformly across all portals, and that is
 * half of what this does. The other half is the same message on screen.
 *
 * The two are not interchangeable and having only the first was a real hole:
 * approving an organisation closes the dialog and removes the row from the
 * pending queue, so an operator watching the screen saw a row vanish and was
 * never told that an account had been created and a temporary password sent to
 * somebody. A screen-reader user was told. Everybody should be.
 *
 * One region and one stack for the whole app, so every screen reports through
 * the same place rather than each growing its own and competing.
 */

interface Toast {
  id: number
  text: string
  tone: Tone
}

/** Long enough to read a sentence twice, and pausable — see `hold` below. */
const DISMISS_AFTER = 10_000

export function Announcer({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])

  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())
  /* Pointer over the stack, or focus inside it. A confirmation naming a
   * grievance number or an email address is something an operator copies down,
   * and having it disappear mid-word is the failure this guards against. */
  const held = useRef(false)
  const due = useRef(new Map<number, number>())

  const drop = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
    due.current.delete(id)
    setToasts(list => list.filter(t => t.id !== id))
  }, [])

  const schedule = useCallback((id: number, ms: number) => {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    due.current.set(id, Date.now() + ms)
    timers.current.set(id, window.setTimeout(() => drop(id), ms))
  }, [drop])

  const announce = useCallback<(text: string, tone?: Tone) => void>((text, tone = 'ok') => {
    // Cleared first, so announcing the same string twice is still spoken the
    // second time — assistive technology ignores an unchanged live region.
    setMessage('')
    window.setTimeout(() => setMessage(text), 60)

    const id = nextId.current++
    // The clock is recorded even when the stack is being held, so that
    // releasing it dismisses a toast that arrived while the pointer was
    // resting there. Recording it only alongside the timer left such a toast
    // with nothing to expire it, and it stayed on screen for good.
    due.current.set(id, Date.now() + DISMISS_AFTER)
    // Capped at three. A queue that grows without bound covers the screen and
    // buries the newest message, which is the one that matters. An evicted
    // toast keeps its timer, which harmlessly clears the two maps when it
    // fires — cleaning up inside the updater would be a side effect in a
    // function React is entitled to call twice.
    setToasts(list => [...list.slice(-2), { id, text, tone }])
    if (!held.current) schedule(id, DISMISS_AFTER)
  }, [schedule])

  /* Pause while the pointer is over the stack, resume with whatever each toast
   * had left on its clock — floored, so a message uncovered at the last
   * moment does not vanish in the same instant. */
  function hold() {
    held.current = true
    for (const timer of timers.current.values()) window.clearTimeout(timer)
    timers.current.clear()
  }

  function release() {
    held.current = false
    const now = Date.now()
    for (const [id, at] of [...due.current]) schedule(id, Math.max(at - now, 2_000))
  }

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}

      {/* The spoken copy. The visible stack below is hidden from assistive
          technology precisely because this exists: without that, every
          confirmation would be announced twice. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>

      {toasts.length > 0 && (
        <div
          className="toasts"
          aria-hidden="true"
          onMouseEnter={hold}
          onMouseLeave={release}
        >
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.tone}`}>
              <span>{t.text}</span>
              {/* tabIndex -1 because this subtree is aria-hidden: a focusable
                  control inside a hidden region is a trap for a keyboard user,
                  who has already had the message spoken to them and has
                  nothing here to dismiss. */}
              <button className="subtle sm" onClick={() => drop(t.id)} tabIndex={-1}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </AnnouncerContext.Provider>
  )
}
