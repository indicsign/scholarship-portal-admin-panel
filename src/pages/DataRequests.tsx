import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { date, relative } from '../lib/format'
import { Empty, ErrorState, Field, Loading, Pager, Pill } from '../components/ui'
import SplitView, { DetailEmpty, QueueItem } from '../components/SplitView'
import { useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import type { DataRequest, ErasureResult } from '../lib/types'

/* Data requests — the operator's half of FR-20.
 *
 * The platform already let a student ask to be erased. What it did with the
 * request was mark the profile invisible to organisations and stop: the
 * certificate, the income figures and the bank details stayed in the database,
 * and nothing anywhere showed anybody that a request had been made. A right
 * offered and not fulfilled is a worse position than one not offered, because
 * the student has been told it is done.
 *
 * This screen is the fulfilment. Three things about it are deliberate.
 *
 * The waiting time is the most prominent thing on every row, because a data
 * request runs against a statutory clock and "how long has this been sitting"
 * is the only question that decides what to do next.
 *
 * Erasure states what survives before it is carried out, not after. The
 * platform promised the student, at the moment they asked, that financial
 * records and audit entries would be kept — so the operator confirming it sees
 * the same sentence the student was given, and can repeat it to them honestly.
 *
 * And a refusal needs grounds typed out. A request declined without a readable
 * reason is one the student cannot challenge, which makes the right decorative.
 *
 * The request sits beside the queue rather than behind a modal. Erasure keeps
 * both of its steps — choosing it, then ticking that this is the right person —
 * because an irreversible act should not be one click from a list. What changed
 * is that the student's name, contact and waiting time stay on screen while the
 * box is ticked, instead of being restated inside a dialog that had covered them
 * up.
 */

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'RECEIVED', label: 'Waiting' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REJECTED', label: 'Declined' },
] as const

/* The point at which a request stops being a queue item and starts being a
 * problem. Well inside the statutory period, so that it surfaces while there
 * is still time to act rather than once the deadline has passed. */
const OVERDUE_DAYS = 21

export default function DataRequests() {
  const { can } = useAuth()
  const announce = useAnnounce()

  const [status, setStatus] = useState<string>('RECEIVED')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  /* The request last clicked. An id, not the row: holding the row would pin a
   * waiting-day count and a blocker list that the next reload makes stale. */
  const [wantID, setWantID] = useState<string | null>(null)

  const query = useQuery<DataRequest[]>(
    signal => api.get('/admin/data-requests', { status, type, page, page_size: 25 }, signal),
    [status, type, page],
  )

  const rows = query.data ?? []

  /* Derived while rendering, so the pane cannot show a request the list no
   * longer holds — erasing one drops it out of the Waiting filter — and the next
   * request is up as soon as this one is dealt with. */
  const selected = rows.find(r => r.request_id === wantID) ?? rows[0] ?? null
  const selectedID = selected?.request_id ?? null
  const opened = !!wantID

  // Erasing and declining are Super Admin only, matching the route guard.
  // Support staff and compliance officers read the queue and cannot act on it,
  // so the controls are absent rather than present and failing.
  const canAct = can('SUPER_ADMIN')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Data requests</h1>
          <p>
            Exports and erasures asked for by students under their right to
            their own data. Exports are assembled automatically; an erasure
            waits here for a person, because it cannot be undone.
          </p>
        </div>
      </div>

      {!canAct && (
        <div className="alert warn" role="status">
          Your role can read this queue but cannot act on it. Erasing or
          declining a request is the platform administrator's decision.
        </div>
      )}

      <SplitView
        showDetailOnNarrow={opened}
        onBack={() => setWantID(null)}
        backLabel="Back to the queue"
        list={
          <>
            <header>
              <div className="filters">
                <div className="field">
                  <label htmlFor="f-status">Status</label>
                  <select
                    id="f-status"
                    data-primary-filter
                    value={status}
                    onChange={e => { setStatus(e.target.value); setPage(1) }}
                  >
                    {STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="f-type">Kind</label>
                  <select
                    id="f-type"
                    value={type}
                    onChange={e => { setType(e.target.value); setPage(1) }}
                  >
                    <option value="">All</option>
                    <option value="ERASURE">Erasure</option>
                    <option value="EXPORT">Export</option>
                  </select>
                </div>
              </div>
            </header>

            {query.loading && !query.data && <Loading label="Loading data requests" />}
            {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

            {query.data && rows.length === 0 && !query.stale && (
              <Empty
                title="Nothing waiting"
                hint={status === 'RECEIVED'
                  ? 'No student is waiting on a decision about their data.'
                  : 'No requests match these filters.'}
              />
            )}

            {rows.length > 0 && (
              <div
                className={`split-scroll${query.stale ? ' stale' : ''}`}
                aria-busy={query.stale || undefined}
              >
                <ul className="queue">
                  {rows.map(r => {
                    const open = r.status === 'RECEIVED' || r.status === 'IN_PROGRESS'
                    const overdue = open && r.waiting_days >= OVERDUE_DAYS

                    return (
                      <QueueItem
                        key={r.request_id}
                        name={r.student_name}
                        sub={[
                          r.request_type === 'ERASURE' ? 'Erasure' : 'Export',
                          open
                            ? `waiting ${r.waiting_days} day${r.waiting_days === 1 ? '' : 's'}`
                            : r.completed_at ? relative(r.completed_at) : statusLabel(r.status),
                        ].join(' · ')}
                        /* The clock, not the status. A data request runs against
                           a statutory deadline, so "has this been sitting too
                           long" is the one thing worth scanning the column for;
                           the status is in the pane. */
                        side={overdue
                          ? <Pill tone="danger">Overdue</Pill>
                          : <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>}
                        selected={r.request_id === selectedID}
                        onSelect={() => setWantID(r.request_id)}
                      />
                    )
                  })}
                </ul>
              </div>
            )}

            {query.meta && rows.length > 0 && (
              <Pager
                page={query.meta.page}
                pageSize={query.meta.page_size}
                total={query.meta.total}
                hasMore={query.meta.has_more}
                onPage={setPage}
              />
            )}
          </>
        }
        detail={
          selected ? (
            <Detail
              key={selected.request_id}
              request={selected}
              canAct={canAct}
              onDone={(message, tone) => {
                announce(message, tone)
                query.reload()
              }}
            />
          ) : (
            <DetailEmpty hint="Choose a request from the queue to see what it asks for." />
          )
        }
      />
    </>
  )
}

function statusTone(s: DataRequest['status']) {
  if (s === 'COMPLETED') return 'ok' as const
  if (s === 'REJECTED') return 'neutral' as const
  return 'warn' as const
}

function statusLabel(s: DataRequest['status']) {
  return s === 'RECEIVED' ? 'Waiting'
    : s === 'IN_PROGRESS' ? 'In progress'
      : s === 'COMPLETED' ? 'Completed'
        : 'Declined'
}

/* One request, and what may be done about it.
 *
 * Keyed on the request id by the caller, so choosing a different student
 * discards a ticked confirmation box and a half-typed refusal. A confirmation
 * carried from one erasure to another is the mistake with no undo.
 */
function Detail({
  request: r, canAct, onDone,
}: {
  request: DataRequest
  canAct: boolean
  onDone: (message: string, tone: 'ok' | 'warn' | 'danger') => void
}) {
  const [kind, setKind] = useState<'erase' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const erasing = kind === 'erase'
  const open = r.status === 'RECEIVED' || r.status === 'IN_PROGRESS'
  const blocked = (r.blockers?.length ?? 0) > 0
  const overdue = open && r.waiting_days >= OVERDUE_DAYS

  function reset() {
    setKind(null)
    setReason('')
    setConfirmed(false)
  }

  async function run() {
    if (!kind) return
    setBusy(true)
    setError(null)

    try {
      if (kind === 'erase') {
        const res = await api.post<ErasureResult>(
          `/admin/data-requests/${r.request_id}/erase`)
        onDone(
          `${r.student_name}'s data has been erased. `
          + `${res.data.documents_deleted} document`
          + `${res.data.documents_deleted === 1 ? '' : 's'} removed.`,
          'ok',
        )
      } else {
        await api.post(`/admin/data-requests/${r.request_id}/reject`, { reason })
        onDone(`Request from ${r.student_name} declined. They will be told why.`, 'warn')
      }
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header>
        <div>
          <h2 className="detail-title">{r.student_name}</h2>
          <p className="detail-sub">
            {r.request_type === 'ERASURE' ? 'Erasure' : 'Export'}
            {' · asked '}{relative(r.requested_at)}
            {' · '}{r.contact ?? 'no contact on file'}
          </p>
        </div>
        {overdue
          ? <Pill tone="danger">Overdue</Pill>
          : <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>}
      </header>

      <div className="detail-body">
        {error && <div className="alert danger" role="alert">{error}</div>}

        <dl className="detail-fields">
          <dt>Asked on</dt>
          <dd>{date(r.requested_at)}</dd>

          <dt>{open ? 'Waiting' : 'Closed'}</dt>
          <dd>
            {open
              ? `${r.waiting_days} day${r.waiting_days === 1 ? '' : 's'}`
              : r.completed_at ? relative(r.completed_at) : '—'}
          </dd>

          {r.rejection_reason && (
            <>
              <dt>Declined because</dt>
              <dd>{r.rejection_reason}</dd>
            </>
          )}
        </dl>

        {/* Stated where the decision is made. An erasure that cannot proceed has
            a reason, and the operator should read it before reaching for a
            button that is going to be disabled anyway. */}
        {blocked && (
          <div className="alert warn" style={{ marginTop: '0.75rem' }}>
            <p>
              This cannot be erased yet — {r.blockers?.join('; ')}
            </p>
          </div>
        )}

        {open && r.request_type === 'EXPORT' && (
          <p className="muted" style={{ fontSize: 13 }}>
            Exports are assembled automatically. There is nothing to decide here.
          </p>
        )}

      {erasing ? (
        <>
          <div className="alert danger">
            <p>This cannot be undone, and no backup restore is offered for it.</p>
          </div>

          {/* The same two lists the student was given when they asked. An
              operator who can repeat them accurately is the difference between
              answering a follow-up call and guessing on it. */}
          <p style={{ marginBottom: '0.25rem' }}><strong>What will be erased</strong></p>
          <ul className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            <li>Name, disability, education, income and address</li>
            <li>Every uploaded document and its verification</li>
            <li>Bank details, guardians, notifications and grievances</li>
            <li>The profile snapshot each application froze at submission</li>
            <li>Their sign-in credentials — the account can no longer be used</li>
          </ul>

          <p style={{ marginBottom: '0.25rem' }}><strong>What will be kept, and why</strong></p>
          <ul className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            <li>Sanction and disbursement records, held as a financial record</li>
            <li>Audit entries showing who accessed their data, as evidence the log is complete</li>
          </ul>

          <Field label="I have checked this is the right person" required>
            {props => (
              <div className="row">
                <input
                  {...props}
                  type="checkbox"
                  style={{ width: 'auto', minHeight: 0 }}
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>
                  Erase the record for {r?.student_name}
                </span>
              </div>
            )}
          </Field>
        </>
      ) : kind === 'reject' ? (
        <Field
          label="Why is this being declined?"
          required
          hint="Sent to the student. Write the grounds they would need in order to challenge it."
          error={reason && reason.trim().length < 10 ? 'Give at least ten characters.' : undefined}
        >
          {props => (
            <textarea
              {...props}
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="An application is still being considered, so the record must be kept until it is decided."
            />
          )}
        </Field>
      ) : null}
      </div>

      {canAct && open && r.request_type === 'ERASURE' && (
        <div className="detail-actions">
          {/* Still two steps. The first opens the consequences and the tick box,
              the second carries it out — an irreversible act should not be one
              click away from a list. */}
          {kind ? (
            <>
              <button onClick={reset} disabled={busy}>Cancel</button>
              <button
                className="danger"
                onClick={run}
                disabled={busy || (erasing ? !confirmed : reason.trim().length < 10)}
              >
                {busy ? 'Working…' : erasing ? 'Erase permanently' : 'Decline request'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setKind('reject')}>Decline</button>
              <button
                className="danger"
                disabled={blocked}
                title={blocked ? r.blockers?.join('; ') : undefined}
                onClick={() => setKind('erase')}
              >
                Erase
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
