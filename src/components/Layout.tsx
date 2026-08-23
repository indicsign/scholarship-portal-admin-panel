import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../lib/auth-context'
import { rememberPlace } from '../lib/place'
import { roleLabel } from '../lib/roles'
import AccountMenu from './AccountMenu'
import NotificationBell from './NotificationBell'
import { Dialog } from './ui'
import {
  IconAudit, IconDashboard, IconDataRequests, IconEcosystem, IconGrievances,
  IconMessages, IconOrganisations, IconSlides, IconSupport, IconUsers,
} from './icons'
import { focusPrimaryFilter, useShortcuts, type Shortcut } from '../lib/shortcuts'

/* The shell.
 *
 * Landmarks are real elements — <nav>, <main>, <header> — so a screen-reader
 * user can jump between them, and the skip link is the first tab stop on every
 * page so a keyboard user is not walked through the whole sidebar to reach the
 * table they came for.
 *
 * Two things about its shape, both of which used to be otherwise:
 *
 * The sidebar is an icon rail that widens when a pointer or the keyboard
 * reaches it. It widens as an overlay, over the content rather than pushing it,
 * because these screens are wide tables and reflowing one under the reader's
 * cursor every time they cross the left edge would be worse than any width it
 * won back.
 *
 * The account cluster is in the top bar. It was the foot of the sidebar — a
 * theme select, "Signed in as", Sign out, and a "?" — which cost about 170px of
 * height and was what made ten sections scroll. The rail saves width; moving
 * this saved the height.
 */

/* One list, read by the sidebar, the shortcuts and the document title. Three
 * copies of the same routes is how a section ends up navigable by keyboard but
 * missing from the menu.
 *
 * Grouped, because ten peers is not a structure. Read as a flat column,
 * "Slides" and "Data requests" carry the same weight, and nothing tells a new
 * operator that three of these ten are queues with a clock running while two
 * are read-only and three are governance. The grouping is by what the operator
 * is doing, not by subject matter:
 *
 *   Overview     read-only. Nothing here is a decision.
 *   Decisions    a queue with a deadline, ending in an act with consequences —
 *                admitting a party to sensitive data, answering a statutory
 *                right, resolving a complaint about somebody who cannot be
 *                trusted to notice it themselves. These are the daily job.
 *   Published    copy that reaches people who are not in this room.
 *   Oversight    who did what, borrowing an identity, and who may do anything
 *                at all.
 *
 * The groups earn their keep twice over. Expanded they are headings; collapsed
 * to the rail they become hairlines, so the column reads as clusters of 2, 3, 2
 * and 3 rather than ten interchangeable glyphs — and position memory works far
 * better on four clusters than on a list of ten.
 */
type Section = {
  to: string
  label: string
  key: string
  /** The rail's glyph. See icons.tsx on why these carry their labels anyway. */
  Icon: (p: { className?: string }) => React.ReactElement
  /** Hidden unless the caller is the platform super admin. */
  superAdminOnly?: boolean
}

type Group = {
  /** Shown while the rail is open; a separator line while it is collapsed. */
  label: string
  sections: Section[]
}

const GROUPS: Group[] = [
  {
    label: 'Overview',
    sections: [
      { to: '/dashboard', label: 'Dashboard', key: 'd', Icon: IconDashboard },
      { to: '/ecosystem', label: 'Ecosystem', key: 'e', Icon: IconEcosystem },
    ],
  },
  {
    label: 'Decisions',
    sections: [
      { to: '/organisations', label: 'Organisations', key: 'o', Icon: IconOrganisations },
      { to: '/data-requests', label: 'Data requests', key: 'r', Icon: IconDataRequests },
      { to: '/grievances', label: 'Grievances', key: 'g', Icon: IconGrievances },
    ],
  },
  {
    label: 'Published',
    sections: [
      { to: '/messages', label: 'Messages', key: 'm', Icon: IconMessages },
      { to: '/slides', label: 'Slides', key: 'l', Icon: IconSlides },
    ],
  },
  {
    label: 'Oversight',
    sections: [
      { to: '/audit', label: 'Audit trail', key: 'a', Icon: IconAudit },
      { to: '/support', label: 'Support access', key: 's', Icon: IconSupport },
      // Only the super admin administers accounts, so only they are offered the
      // link. Showing it to platform staff would be offering a door that answers
      // 403 — the route and the service refuse it either way.
      { to: '/users', label: 'User management', key: 'u', Icon: IconUsers, superAdminOnly: true },
    ],
  },
]

interface Props {
  pendingOrganisations?: number
  openDataRequests?: number
  /* Overdue only, not every open grievance. A badge that always reads 40-odd is
   * a badge nobody looks at; this is the number the screen is sorted by. */
  overdueGrievances?: number
}

/** Read out after the count, so the announcement is a sentence. */
function countHint(to: string) {
  switch (to) {
    case '/organisations': return 'awaiting approval'
    case '/data-requests': return 'waiting on a decision'
    default: return 'past due'
  }
}

export default function Layout({
  pendingOrganisations, openDataRequests, overdueGrievances,
}: Props) {
  const { context, impersonation, endImpersonation } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [helpOpen, setHelpOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // Filtered once. A section the caller may not reach must disappear from the
  // keyboard shortcuts too, or `g u` would navigate to a screen that refuses.
  //
  // Memoised because the document-title effect below depends on it: a fresh
  // array every render would re-run that effect every render, and it also moves
  // focus to <main>.
  /* Filtered once, and both shapes kept: the sidebar walks the groups, while
   * the shortcuts and the title lookup want a flat list. A section the caller
   * may not reach must disappear from the shortcuts too, or `g u` would
   * navigate to a screen that refuses.
   *
   * A group whose every section is filtered out drops with them — an empty
   * heading with a separator under it reads as a section that failed to load.
   *
   * Memoised because the document-title effect below depends on the flat list:
   * a fresh array every render would re-run that effect every render, and it
   * also moves focus to <main>. */
  const groups = useMemo(
    () => GROUPS
      .map(g => ({
        ...g,
        sections: g.sections.filter(
          s => !s.superAdminOnly || context?.role === 'SUPER_ADMIN',
        ),
      }))
      .filter(g => g.sections.length > 0),
    [context?.role],
  )

  const sections = useMemo(() => groups.flatMap(g => g.sections), [groups])

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
    /* Remembered so a refresh returns to this screen. The URL no longer carries
     * it — see main.tsx — and losing your place on every reload would be a poor
     * trade for a clean address bar. sessionStorage, so it dies with the tab. */
    rememberPlace(location.pathname)

    const section = sections.find(s => s.to === location.pathname)
    document.title = section
      ? `${section.label} · Admin panel`
      : 'Admin panel · Scholarship Platform'

    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus()
  }, [location.pathname, sections])

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>

      {impersonation && <ImpersonationBanner onEnd={endImpersonation} />}

      <div className={`shell${impersonation ? ' with-banner' : ''}`}>
        {/* aria-label rather than a heading: the brand is decorative here and
            "Sections" is what a screen-reader user needs to hear when they jump
            to this landmark. */}
        <nav className="sidebar" aria-label="Sections">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">SP</span>
            <span className="brand-text">
              Scholarship Platform
              <small>Admin panel</small>
            </span>
          </div>

          <div className="nav">
            {groups.map((group, i) => (
              <div className="nav-group" key={group.label}>
                {/* aria-hidden, and the links are not wrapped in a nested list:
                    the heading is a visual grouping, and announcing "Decisions,
                    group, 3 items" before every link is more noise than help
                    when the link's own label already says where it goes. The
                    hairline for the collapsed rail is this element's border, so
                    it is drawn even when the words are not readable. */}
                {i > 0 && <span className="nav-rule" aria-hidden="true" />}
                <div className="nav-group-label" aria-hidden="true">{group.label}</div>

                {group.sections.map(s => {
                  const count = s.to === '/organisations' ? pendingOrganisations
                    : s.to === '/data-requests' ? openDataRequests
                      : s.to === '/grievances' ? overdueGrievances
                        : 0
                  return (
                    /* title, so a pointer resting on a collapsed glyph gets the
                       label from the platform even before the rail widens. */
                    <NavLink key={s.to} to={s.to} title={s.label}>
                      <span className="nav-icon"><s.Icon /></span>
                      <span className="nav-label">{s.label}</span>
                      {!!count && (
                        <span className="count">
                          <span className="count-n">{count}</span>
                          <span className="sr-only">{` ${countHint(s.to)}`}</span>
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="col">
          {/* The top bar is inside the content column, not across the whole
              shell, so the widening rail overlays it like everything else
              rather than having to be laid out around. */}
          <header className="topbar">
            <div className="topbar-where">
              {sections.find(s => s.to === location.pathname)?.label ?? 'Admin panel'}
            </div>
            <NotificationBell
              pendingOrganisations={pendingOrganisations}
              openDataRequests={openDataRequests}
              overdueGrievances={overdueGrievances}
            />
            <AccountMenu onShortcuts={() => setHelpOpen(true)} />
          </header>

          {/* tabIndex -1 so the skip link and the route change above can move
              focus here, which is what makes both do anything for a
              screen-reader user rather than only scrolling the page. */}
          <main className="main" id="main" tabIndex={-1} ref={mainRef}>
            <Outlet />
          </main>
        </div>
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
        <strong>{roleLabel(impersonation.actingAs.role)}</strong>. Everything you
        do is recorded and will be disclosed to them.
      </span>
      <span className="spacer" />
      <button className="sm" onClick={onEnd}>End session</button>
    </div>
  )
}
