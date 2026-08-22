import { useEffect, useRef } from 'react'

/* Keyboard shortcuts.
 *
 * Table 4.1's brief for this panel is "dense and log-heavy", and the styles
 * that follow from it put keyboard efficiency ahead of visual richness. That
 * was true of the type and the row height and not yet true of anything else:
 * moving between the queue and the audit trail meant reaching for the mouse.
 *
 * The set is deliberately small and unmodified — single letters, in the manner
 * of a mail client — because a console used all day rewards muscle memory, and
 * because chords collide with what the browser and the screen reader have
 * already claimed.
 *
 * Three rules keep them out of the way:
 *
 *   * never while the operator is typing, which includes selects and anything
 *     contenteditable;
 *   * never with a modifier held, so Ctrl-A still selects and Cmd-R still
 *     reloads;
 *   * never while a modal dialog is open, where Escape and the focus trap own
 *     the keyboard.
 *
 * `?` lists them all, so none of this has to be documented elsewhere to be
 * discoverable.
 */

export interface Shortcut {
  /** The key, or a two-key sequence such as `g o`. */
  keys: string
  label: string
  run: () => void
}

/** True when the keystroke belongs to whatever the operator is typing into. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** How long a `g` stays armed waiting for its second key. */
const SEQUENCE_WINDOW = 1200

export function useShortcuts(shortcuts: Shortcut[]) {
  // Held in a ref so the listener is bound once rather than being torn down and
  // rebuilt on every render of the shell. Written in an effect rather than
  // during render: the array is rebuilt each pass, and a ref written during
  // render is a value React is entitled to discard.
  const current = useRef(shortcuts)
  useEffect(() => {
    current.current = shortcuts
  })

  useEffect(() => {
    let prefix: string | null = null
    let armed: number | null = null

    function disarm() {
      prefix = null
      if (armed) window.clearTimeout(armed)
      armed = null
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      // A dialog is modal: its own Escape handling and focus trap own the
      // keyboard for as long as it is up.
      if (document.querySelector('dialog[open]')) return

      const key = e.key
      if (key === 'Escape') return disarm()

      const combined = prefix ? `${prefix} ${key}` : key
      const match = current.current.find(s => s.keys === combined)

      if (match) {
        e.preventDefault()
        disarm()
        match.run()
        return
      }

      // Not a shortcut on its own, but the first half of one. Arm and wait.
      if (!prefix && current.current.some(s => s.keys.startsWith(`${key} `))) {
        prefix = key
        armed = window.setTimeout(disarm, SEQUENCE_WINDOW)
        return
      }

      disarm()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      disarm()
    }
  }, [])
}

/**
 * Moves focus to the screen's primary filter.
 *
 * Each page marks one control with `data-primary-filter`; pages with nothing to
 * filter simply have none, and the shortcut does nothing rather than guessing.
 */
export function focusPrimaryFilter() {
  const el = document.querySelector<HTMLElement>('[data-primary-filter]')
  if (!el) return
  el.focus()
  if (el instanceof HTMLInputElement) el.select()
}
