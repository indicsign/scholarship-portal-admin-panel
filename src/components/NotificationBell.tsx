import { useNavigate } from 'react-router-dom'

import Popover from './Popover'
import { IconBell } from './icons'

/* Work waiting on the operator.
 *
 * These are the same two counts the sidebar badges show, and that repetition is
 * deliberate rather than an oversight: the sidebar is an icon rail until a
 * pointer reaches it, so the badges are visible as dots and not as numbers. The
 * bell is where the numbers live, and it says outright that it is showing the
 * same thing so nobody reconciles two figures that cannot disagree.
 *
 * It is not a notification feed. A feed answers "what happened while I was
 * away" and needs a per-user table, a read/unread flag and a write wherever
 * those events occur. None of that exists, and a bell that quietly showed two
 * queue counts while implying a history would be the wrong kind of lie.
 */

type Item = {
  count: number
  to: string
  label: string
  /** Read out after the count, so the announcement is a sentence. */
  hint: string
}

export default function NotificationBell({
  pendingOrganisations = 0, openDataRequests = 0, overdueGrievances = 0,
}: {
  pendingOrganisations?: number
  openDataRequests?: number
  overdueGrievances?: number
}) {
  const navigate = useNavigate()

  const items: Item[] = [
    {
      count: pendingOrganisations, to: '/organisations',
      label: 'Organisations awaiting approval',
      hint: 'An approved organisation can read applicants’ disability certificates.',
    },
    {
      count: openDataRequests, to: '/data-requests',
      label: 'Data requests awaiting a decision',
      hint: 'Each one answers a legal right and carries a deadline.',
    },
    {
      count: overdueGrievances, to: '/grievances',
      label: 'Grievances past due',
      hint: 'Unresolved past the date the student was promised.',
    },
  ].filter(i => i.count > 0)

  const total = items.reduce((n, i) => n + i.count, 0)

  return (
    <Popover
      label={total ? `Waiting on you: ${total} item${total === 1 ? '' : 's'}` : 'Nothing waiting on you'}
      badge={
        <>
          <IconBell />
          {/* aria-hidden because the trigger's accessible name already carries
              the number as a sentence; announced here too it reads as a bare
              digit after it. */}
          {!!total && <span className="topbar-count" aria-hidden="true">{total}</span>}
        </>
      }
    >
      {close => (
        <>
          <div className="popover-head">
            <div className="popover-title">Waiting on you</div>
          </div>

          {!items.length ? (
            <div className="popover-section">
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Nothing needs a decision right now.
              </p>
            </div>
          ) : (
            <div className="popover-section">
              {items.map(i => (
                <button
                  key={i.to}
                  className="popover-item wrap"
                  onClick={() => { close(); navigate(i.to) }}
                >
                  <span className="popover-item-count">{i.count}</span>
                  <span>
                    {i.label}
                    <small className="muted">{i.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="popover-foot muted">
            The same counts as the badges in the sidebar.
          </div>
        </>
      )}
    </Popover>
  )
}
