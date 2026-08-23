import { useState } from 'react'

import { useAuth } from '../lib/auth-context'
import { roleLabel } from '../lib/roles'
import { applyTheme, readTheme, type Theme } from '../lib/theme'
import Popover from './Popover'
import { IconCheck, IconKeyboard, IconSignOut } from './icons'

/* Who is signed in, and the three things they might want to do about it.
 *
 * This used to be the foot of the sidebar: a theme select, the words "Signed in
 * as Super Admin", a Sign out button and a "?". Together they took about 170px
 * of vertical space off the top of the navigation, which is what pushed a ten
 * item sidebar into scrolling. Moving the cluster here is what stopped that —
 * the icon rail is a separate change and saves width, not height.
 *
 * There is no Settings item. This panel has no settings screen, and the only
 * per-user preference in it is the theme, which is here rather than behind a
 * door that would open onto a page containing one select.
 */

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export default function AccountMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const { account, context, signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(() => readTheme())

  const name = account?.email ?? account?.phone ?? null
  const role = roleLabel(context?.role ?? '')

  function change(next: Theme) {
    setTheme(next)
    applyTheme(next)
  }

  return (
    <Popover
      label={name ? `Account: ${name}` : 'Account'}
      className="avatar-btn"
      badge={<Avatar name={name} />}
    >
      {close => (
        <>
          <div className="popover-head">
            {/* The account first and the role second. Several people share a
                role here, and impersonation borrows one, so the role alone never
                answers "whose actions are these". */}
            <div className="popover-title">{name ?? 'Signed in'}</div>
            <div className="muted">{role}</div>
          </div>

          <div className="popover-section">
            <div className="popover-label" id="theme-choice">Colours</div>
            {/* Radio semantics, not a select: three options worth showing at
                once, and the current one readable without opening anything.
                A select inside a popover also means two overlays deep, which
                on some platforms closes the first. */}
            <div role="radiogroup" aria-labelledby="theme-choice">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={theme === t.value}
                  className="popover-item"
                  onClick={() => change(t.value)}
                >
                  <span className="popover-item-icon">
                    {theme === t.value && <IconCheck />}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="popover-section">
            <button
              className="popover-item"
              onClick={() => { close(); onShortcuts() }}
            >
              <span className="popover-item-icon"><IconKeyboard /></span>
              Keyboard shortcuts
            </button>

            <button className="popover-item danger" onClick={() => void signOut()}>
              <span className="popover-item-icon"><IconSignOut /></span>
              Sign out
            </button>
          </div>
        </>
      )}
    </Popover>
  )
}

/* Initials in a disc.
 *
 * No photograph, because the platform holds none: there is no avatar column and
 * inventing one would mean asking operators to upload a picture to a panel that
 * has no use for it. Initials off the email local part are enough to tell two
 * signed-in accounts apart, which is the whole job.
 *
 * The tint is derived from the name so it is stable across sessions and
 * different between colleagues — the fastest way to notice you are signed in as
 * the wrong account is that the disc is the wrong colour.
 */
function Avatar({ name }: { name: string | null }) {
  const local = (name ?? '?').split('@')[0]
  const initials = local
    .split(/[.\-_+\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?'

  // Sum of code points, not a hash: it only has to spread a handful of
  // colleagues across twelve hues, and a real hash would imply a precision
  // nothing here needs.
  let n = 0
  for (const ch of local) n += ch.codePointAt(0) ?? 0

  return (
    <span className="avatar" style={{ '--hue': (n % 12) * 30 } as React.CSSProperties}>
      {initials}
    </span>
  )
}
