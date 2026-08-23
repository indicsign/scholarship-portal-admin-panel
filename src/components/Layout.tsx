import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../lib/auth-context'
import ThemeControl from './ThemeControl'
import { Dialog } from './ui'
import { humanise } from '../lib/format'
import { focusPrimaryFilter, useShortcuts, type Shortcut } from '../lib/shortcuts'

/* The shell.
 *
 * Landmarks are real elements — <nav>, <main>, <header> — so a screen-reader
 * user can jump between them, and the skip link is the first tab stop on every
 * page so a keyboard user is not walked through the whole sidebar to reach the
 * table they came for.
 */

/* One list, read by the sidebar, the shortcuts and the document title. Three
 * copies of the same four routes is how a section ends up navigable by keyboard
 * but missing from the menu. */
type Section = {
  to: string
  label: string
  key: string
  /** Hidden unless the caller is the platform super admin. */
  superAdminOnly?: boolean
}

const SECTIONS: Section[] = [
  { to: '/dashboard', label: 'Dashboard', key: 'd' },
  { to: '/organisations', label: 'Organisations', key: 'o' },
  { to: '/ecosystem', label: 'Ecosystem', key: 'e' },
  { to: '/data-requests', label: 'Data requests', key: 'r' },
  { to: '/grievances', label: 'Grievances', key: 'g' },
  { to: '/messages', label: 'Messages', key: 'm' },
  { to: '/slides', label: 'Slides', key: 'l' },
  { to: '/audit', label: 'Audit trail', key: 'a' },
  { to: '/support', label: 'Support access', key: 's' },
  // Only the super admin administers accounts, so only they are offered the
  // link. Showing it to platform staff would be offering a door that answers
  // 403 — the route and the service refuse it either way.
  { to: '/users', label: 'User management', key: 'u', superAdminOnly: true },
] as const

interface Props {
  pendingOrganisations?: number
  openDataRequests?: number
}

export default function Layout({ pendingOrganisations, openDataRequests }: Props) {
  const { context, impersonation, signOut, endImpersonation } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [helpOpen, setHelpOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // Filtered once. A section the caller may not reach must disappear from the
  // keyboard shortcuts too, or `g u` would navigate to a screen that refuses.
  const sections = SECTIONS.filter(
    s => !s.superAdminOnly || context?.role === 'PLATFORM_SUPER_ADMIN',
  )

  const shortcuts: Shortcut[] = [
    ...sections.map(s => ({
      keys: `g ${s.key}`,
      label: `Go to ${s.label.toLowerCase()}`,
      run: () => navigate(s.to),
    })),
    { keys: '/', label: 'Search or filter this screen', run: focusPrimaryFilter },
    // Not a toggle: shortcuts are ignored while a dialog is open, so the way
    // back out of this one is Escape or its Close button.
    { keys: '?', label: 'Show this list', run: () => setHelpOpen(true) },
  ]

  useShortcuts(shortcuts)

  /* A route change in a single-page app moves nothing: focus stays on the link
   * in the sidebar, and a screen-reader user is given no reason to believe the
   * page changed at all. Moving focus into <main> is what makes the new heading
   * the next thing read, and the title is what distinguishes four open tabs.
   *
   * Skipped on first paint, where stealing focus from the document would
   * interrupt a reader who has not started. */
  useEffect(() => {
    const section = sections.find(s => s.to === location.pathname)
    document.title = section
      ? `${section.label} · Admin panel`
      : 'Admin panel · Scholarship Platform'

    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus()
  }, [location.pathname])

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>

      {impersonation && <ImpersonationBanner onEnd={endImpersonation} />}

      <div className={`shell${impersonation ? ' with-banner' : ''}`}>
        <nav className="sidebar" aria-label="Sections">
          <div className="brand">
            Scholarship Platform
            <small>Admin panel</small>
          </div>

          <div className="nav">
            {sections.map(s => {
              const count = s.to === '/organisations' ? pendingOrganisations
                : s.to === '/data-requests' ? openDataRequests
                  : 0
              return (
                <NavLink key={s.to} to={s.to}>
                  <span>{s.label}</span>
                  {!!count && (
                    <span className="count">
                      {count}
                      <span className="sr-only">
                        {s.to === '/organisations' ? ' awaiting approval' : ' waiting on a decision'}
                      </span>
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>

          <div className="sidebar-foot">
            <ThemeControl />

            <div className="whoami">
              <div className="muted">Signed in as</div>
              <div style={{ fontWeight: 600 }}>{humanise(context?.role ?? '')}</div>
            </div>

            <div className="row">
              <button className="subtle sm" onClick={signOut} style={{ flex: 1 }}>
                Sign out
              </button>
              {/* Discoverability. A shortcut nobody knows about is a shortcut
                  nobody uses, and this is the only affordance that says the
                  keyboard does anything here. */}
              <button
                className="subtle sm"
                onClick={() => setHelpOpen(true)}
                aria-haspopup="dialog"
                title="Keyboard shortcuts"
              >
                <span aria-hidden="true">?</span>
                <span className="sr-only">Keyboard shortcuts</span>
              </button>
            </div>
          </div>
        </nav>

        {/* tabIndex -1 so the skip link and the route change above can move
            focus here, which is what makes both do anything for a
            screen-reader user rather than only scrolling the page. */}
        <main className="main" id="main" tabIndex={-1} ref={mainRef}>
          <Outlet />
        </main>
      </div>

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} shortcuts={shortcuts} />
    </>
  )
}

function ShortcutHelp({
  open, onClose, shortcuts,
}: {
  open: boolean
  onClose: () => void
  shortcuts: Shortcut[]
}) {
  return (
    <Dialog
      open={open}
      title="Keyboard shortcuts"
      onClose={onClose}
      footer={<button className="primary" onClick={onClose}>Close</button>}
    >
      <dl className="shortcuts">
        {shortcuts.map(s => (
          <div key={s.keys}>
            <dt>
              {s.keys.split(' ').map(k => <kbd key={k}>{k}</kbd>)}
            </dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
      <p className="muted" style={{ marginBottom: 0, fontSize: 12 }}>
        Shortcuts are ignored while you are typing and while a dialog is open.
      </p>
    </Dialog>
  )
}

/* Section 7.2 permits impersonation only when it is logged and disclosed. This
 * is the operator's half of that: it cannot be dismissed, it states whose
 * account this is, and the way out is one control away. An operator who forgets
 * they are inside a support session produces both a misleading audit trail and
 * a frightened student. */
function ImpersonationBanner({ onEnd }: { onEnd: () => void }) {
  const { impersonation } = useAuth()
  if (!impersonation) return null

  return (
    <div className="impersonation-banner" role="alert">
      <span aria-hidden="true">●</span>
      <span>
        Support session — you are acting as{' '}
        <strong>{humanise(impersonation.actingAs.role)}</strong>. Everything you
        do is recorded and will be disclosed to them.
      </span>
      <span className="spacer" />
      <button className="sm" onClick={onEnd}>End session</button>
    </div>
  )
}
