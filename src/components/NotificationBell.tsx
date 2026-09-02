import { useNavigate } from 'react-router-dom'

import Popover from './Popover'
import { IconBell } from './icons'
import { QUEUES, type QueueCounts } from '../lib/queues'

/* Work waiting on the operator.
 *
 * These are the same counts the sidebar badges show, and that repetition is
 * deliberate rather than an oversight: the sidebar is an icon rail until a
 * pointer reaches it, so the badges are visible as dots and not as numbers. The
 * bell is where the numbers live, and it says outright that it is showing the
 * same thing so nobody reconciles two figures that cannot disagree.
 *
 * The queues themselves are declared in lib/queues.ts. They used to be listed
 * here as well as in Layout, which meant a fourth queue had to be added to both
 * and worded the same way in both — and the way that fails is a badge that never
 * leaves zero on the one screen whose purpose is being noticed.
 *
 * It is not a notification feed. A feed answers "what happened while I was
 * away" and needs a per-user table, a read/unread flag and a write wherever
 * those events occur. None of that exists, and a bell that quietly showed a few
 * queue counts while implying a history would be the wrong kind of lie.
 */

export default function NotificationBell({ counts = {} }: { counts?: QueueCounts }) {
  const navigate = useNavigate()

  const items = QUEUES
    .map(q => ({ ...q, count: counts[q.key] ?? 0 }))
    .filter(i => i.count > 0)

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
                    <small className="muted">{i.why}</small>
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
