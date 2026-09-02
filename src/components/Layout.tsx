import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../lib/auth-context'
import { rememberPlace } from '../lib/place'
import { ErrorBoundary } from './ErrorBoundary'
import { roleLabel } from '../lib/roles'
import type { Role } from '../lib/types'
import AccountMenu from './AccountMenu'
import NotificationBell from './NotificationBell'
import { queueFor, type QueueCounts } from '../lib/queues'
import { Dialog } from './ui'
import {
  IconAudit, IconDashboard, IconEcosystem, IconGrievances,
  IconMessages, IconOrganisations, IconScholarships, IconSlides, IconSupport,
  IconVerifications,
  IconUsers,
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
 *   Published    copy that reaches people who are not in this room. The
 *                scholarships themselves are NOT here: deciding what the
 *                catalogue contains is a decision, so it sits above.
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
  /* Who sees it. Undefined means everybody with platform scope.
   *
   * A list rather than the boolean this used to be, because two of the entries
   * below belong to neither "the super admin" nor "everybody": Table 3.1 makes
   * audit review and data requests the compliance officer's responsibility, and
   * a boolean can only get one of those two wrong. */
  roles?: Role[]
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
      /* No roles: everybody lands here. What it renders differs — the super
         admin gets the platform's figures, everybody else gets the queue of
         what is waiting on them. See Dashboard.tsx. */
      { to: '/dashboard', label: 'Dashboard', key: 'd', Icon: IconDashboard },
      // The aggregate meant to leave the building, so it belongs to whoever
      // answers for the platform.
      { to: '/ecosystem', label: 'Ecosystem', key: 'e', Icon: IconEcosystem, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    label: 'Decisions',
    sections: [
      /* First, and it is both the catalogue and the review queue now.
       *
       * It was two screens — a catalogue under Published, and a review queue
       * here — which meant approving a scheme and then looking at it were
       * different places. Reviewing IS deciding what the catalogue contains, so
       * they are one screen, and it sits here because the deciding is what has
       * somebody waiting on it. */
      { to: '/scholarships', label: 'Scholarships', key: 'c', Icon: IconScholarships },
      /* Second. A document here blocks one student; an unreviewed scheme blocks
         every student who would match it, which is why it sits below.
         Called Students rather than Verifications because that is what it now
         is: the queue is its default tab, and the other two are the only place
         a student's claims and their evidence appear side by side — which is
         where you go once the queue no longer holds them. */
      { to: '/verifications', label: 'Students', key: 'f', Icon: IconVerifications },
      { to: '/organisations', label: 'Organisations', key: 'o', Icon: IconOrganisations },
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
      /* Compliance as well as the super admin: Table 3.1 assigns audit review
         to the compliance officer, and a compliance function that cannot read
         the log is not enforcing anything. */
      { to: '/audit', label: 'Audit trail', key: 'a', Icon: IconAudit,
        roles: ['SUPER_ADMIN', 'COMPLIANCE'] },
      // Signing in as somebody else. The narrowest door in the panel.
      { to: '/support', label: 'Support access', key: 's', Icon: IconSupport,
        roles: ['SUPER_ADMIN'] },
      /* Three roles, three different screens behind one link. The super admin
         administers platform accounts; an administrator manages tenant members
         and students; a staff member reads the same two lists. Nobody else has
         any business here — a compliance officer looks an account up through
         Support access, which is audited as a support action. */
      { to: '/users', label: 'User management', key: 'u', Icon: IconUsers,
        roles: ['SUPER_ADMIN', 'ADMIN', 'STAFF'] },
    ],
  },
]

interface Props {
  /* Keyed by queue rather than one prop per queue. Three positional props and a
   * route→prop ternary was how this worked, and adding the fourth queue is what
   * showed the shape up: see lib/queues.ts. */
  counts?: QueueCounts
}

export default function Layout({ counts = {} }: Props) {
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
  /* Read out once, so the memo below depends on the role rather than on the
     whole context object — the filter reads it twice and the two readings must
     not be able to disagree. */
  const role = context?.role

  const groups = useMemo(
    () => GROUPS
      .map(g => ({
        ...g,
        /* No list means everybody with platform scope. A list means those
           roles and nobody else — and a group whose every section is filtered
           out disappears with them, below, rather than leaving a heading over
           nothing. */
        sections: g.sections.filter(s => !s.roles || (!!role && s.roles.includes(role))),
      }))
      .filter(g => g.sections.length > 0),
    [role],
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
                  const queue = queueFor(s.to)
                  const count = queue ? counts[queue.key] ?? 0 : 0
                  return (
                    /* title, so a pointer resting on a collapsed glyph gets the
                       label from the platform even before the rail widens. */
                    <NavLink key={s.to} to={s.to} title={s.label}>
                      <span className="nav-icon"><s.Icon /></span>
                      <span className="nav-label">{s.label}</span>
                      {!!count && (
                        <span className="count">
                          <span className="count-n">{count}</span>
                          <span className="sr-only">{` ${queue?.hint ?? ""}`}</span>
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
            <NotificationBell counts={counts} />
            <AccountMenu onShortcuts={() => setHelpOpen(true)} />
          </header>

          {/* tabIndex -1 so the skip link and the route change above can move
              focus here, which is what makes both do anything for a
              screen-reader user rather than only scrolling the page. */}
          <main className="main" id="main" tabIndex={-1} ref={mainRef}>
            {/* Inside <main>, so a screen that fails to render loses the page
                and keeps the shell: the nav is still there to leave by. Keyed
                on the path so moving to another screen clears the error. */}
            <ErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
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
