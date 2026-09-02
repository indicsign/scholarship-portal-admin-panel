import { useEffect, useRef } from 'react'

/* A work queue beside the item you are working on.
 *
 * The shape every decision screen in this panel wants and none of them had. The
 * three queues — organisations awaiting approval, data requests against a
 * statutory clock, grievances past their promise — were each a seven-column
 * table plus a modal, and the two halves of that were fighting each other:
 *
 *   Everything needed to decide had to be on the row, because the modal only
 *   opened after the operator had already chosen to act. So the row grew to
 *   seven columns and the table grew to the width of the monitor.
 *
 *   And then the modal restated the name, the type, the registration number and
 *   the contact address anyway — because a decision needs its subject in front
 *   of it. The duplication was the schema telling us where the detail belonged.
 *
 * Here the list carries three things and the pane carries everything, so a name
 * and its Approve button are one glance apart rather than an arm's length, and
 * working down a queue is select-decide-select rather than open-read-act-close
 * -find-your-place.
 *
 * Two panes are only rendered together when there is room for both. Below the
 * breakpoint this swaps: the list, or the detail with a control back to it.
 * Stacking them instead would put the detail an entire queue's scroll below the
 * row it belongs to, which is the same as not having it.
 */
export default function SplitView({
  list, detail, showDetailOnNarrow, onBack, backLabel = 'Back to the list',
}: {
  list: React.ReactNode
  detail: React.ReactNode
  /** True once something is selected, which is what swaps the panes when narrow. */
  showDetailOnNarrow: boolean
  onBack: () => void
  backLabel?: string
}) {
  return (
    <div className="split">
      {/* Both panes stay in the DOM at wide sizes. At narrow sizes only one is
          rendered — hiding the other with CSS would leave a screen-reader user
          walking through a queue they cannot see, and would keep its scroll
          position and focus alive underneath the detail. */}
      <div
        className="card split-list"
        data-narrow-hidden={showDetailOnNarrow || undefined}
      >
        {list}
      </div>

      <div className="card detail" data-narrow-hidden={!showDetailOnNarrow || undefined}>
        <div className="detail-back-row">
          <button className="sm detail-back" onClick={onBack}>{backLabel}</button>
        </div>
        {detail}
      </div>
    </div>
  )
}

/* One row in the queue.
 *
 * A button, not a row with a click handler: it is the thing you activate to
 * change the pane, so it should be reachable by Tab, activated by Space and
 * Enter, and announced as a control — all of which a <div onClick> gives up and
 * then has to reimplement badly.
 */
export function QueueItem({
  name, sub, side, lead, selected, onSelect,
}: {
  name: React.ReactNode
  sub?: React.ReactNode
  /** A status pill or a waiting time — the one thing worth scanning down. */
  side?: React.ReactNode
  /* Something identifying at the start of the row — a sponsor's mark. Optional,
     and the row keeps its two-column shape without one: an empty gutter on
     every queue that has no marks would indent them all for nothing. */
  lead?: React.ReactNode
  selected: boolean
  onSelect: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)

  /* Keep the selected row visible. Selection moves without a click — after a
   * decision the queue reloads and the next item is chosen for you — and a
   * selection you cannot see is worse than none. `nearest` so an item already
   * on screen is left where it is rather than yanked to the middle. */
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <li>
      <button
        ref={ref}
        className={lead ? 'has-lead' : undefined}
        aria-current={selected || undefined}
        onClick={onSelect}
      >
        {lead && <span className="queue-lead">{lead}</span>}
        <span className="queue-name">{name}</span>
        {side && <span className="queue-side">{side}</span>}
        {sub && <span className="queue-sub">{sub}</span>}
      </button>
    </li>
  )
}

/* The empty right-hand pane.
 *
 * Says which list to pick from rather than sitting blank. A blank pane beside a
 * populated queue reads as something that failed to load.
 */
export function DetailEmpty({ hint }: { hint: string }) {
  return (
    <div className="detail-body">
      <p className="muted" style={{ margin: 0 }}>{hint}</p>
    </div>
  )
}
