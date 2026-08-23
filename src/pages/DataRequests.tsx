import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { date, relative } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pager, Pill } from '../components/ui'
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

type Action =
  | { kind: 'erase'; request: DataRequest }
  | { kind: 'reject'; request: DataRequest }

export default function DataRequests() {
  const { can } = useAuth()
  const announce = useAnnounce()

  const [status, setStatus] = useState<string>('RECEIVED')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<Action | null>(null)

  const query = useQuery<DataRequest[]>(
    signal => api.get('/admin/data-requests', { status, type, page, page_size: 25 }, signal),
    [status, type, page],
  )

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

      <div className="card">
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

        {query.data && query.data.length === 0 && !query.stale && (
          <Empty
            title="Nothing waiting"
            hint={status === 'RECEIVED'
              ? 'No student is waiting on a decision about their data.'
              : 'No requests match these filters.'}
          />
        )}

        {query.data && query.data.length > 0 && (
          <div className={query.stale ? 'stale' : undefined} aria-busy={query.stale || undefined}>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  Data requests, open first and oldest within them
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Asked</th>
                    <th scope="col">Waiting</th>
                    <th scope="col">Status</th>
                    {canAct && <th scope="col"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.map(r => {
                    const open = r.status === 'RECEIVED' || r.status === 'IN_PROGRESS'
                    const blocked = (r.blockers?.length ?? 0) > 0
                    const overdue = open && r.waiting_days >= OVERDUE_DAYS

                    return (
                      <tr key={r.request_id}>
                        <th scope="row" style={{ fontWeight: 600 }}>
                          {r.student_name}
                          <div className="faint" style={{ fontWeight: 400, fontSize: 12 }}>
                            {r.contact ?? '—'}
                          </div>
                        </th>
                        <td>
                          <Pill tone={r.request_type === 'ERASURE' ? 'danger' : 'neutral'}>
                            {r.request_type === 'ERASURE' ? 'Erasure' : 'Export'}
                          </Pill>
                        </td>
                        <td className="nowrap">{date(r.requested_at)}</td>
                        <td className="nowrap">
                          {open ? (
                            <>
                              {r.waiting_days} day{r.waiting_days === 1 ? '' : 's'}
                              {overdue && (
                                <div>
                                  <Pill tone="danger">Overdue</Pill>
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="faint">
                              {r.completed_at ? relative(r.completed_at) : '—'}
                            </span>
                          )}
                        </td>
                        <td>
                          <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill>
                          {blocked && (
                            // Stated on the row rather than discovered on
                            // clicking: an operator working a queue should be
                            // able to see what is actionable without opening
                            // each one to find out.
                            <div className="faint" style={{ fontSize: 12 }}>
                              Blocked — {r.blockers?.join('; ')}
                            </div>
                          )}
                          {r.rejection_reason && (
                            <div className="faint" style={{ fontSize: 12 }}>
                              {r.rejection_reason}
                            </div>
                          )}
                        </td>
                        {canAct && (
                          <td className="actions">
                            {open && r.request_type === 'ERASURE' && (
                              <div className="row" style={{ justifyContent: 'flex-end' }}>
                                <button
                                  className="sm danger"
                                  disabled={blocked}
                                  title={blocked ? r.blockers?.join('; ') : undefined}
                                  onClick={() => setAction({ kind: 'erase', request: r })}
                                >
                                  Erase<span className="sr-only"> {r.student_name}'s data</span>
                                </button>
                                <button
                                  className="sm"
                                  onClick={() => setAction({ kind: 'reject', request: r })}
                                >
                                  Decline<span className="sr-only"> {r.student_name}'s request</span>
                                </button>
                              </div>
                            )}
                            {open && r.request_type === 'EXPORT' && (
                              <span className="faint" style={{ fontSize: 12 }}>
                                Assembled automatically
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {query.meta && (
              <Pager
                page={query.meta.page}
                pageSize={query.meta.page_size}
                total={query.meta.total}
                hasMore={query.meta.has_more}
                onPage={setPage}
              />
            )}
          </div>
        )}
      </div>

      <ActionDialog
        action={action}
        onClose={() => setAction(null)}
        onDone={(message, tone) => {
          setAction(null)
          announce(message, tone)
          query.reload()
        }}
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

function ActionDialog({
  action, onClose, onDone,
}: {
  action: Action | null
  onClose: () => void
  onDone: (message: string, tone: 'ok' | 'warn' | 'danger') => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const r = action?.request
  const erasing = action?.kind === 'erase'

  function close() {
    setReason('')
    setConfirmed(false)
    setError(null)
    onClose()
  }

  async function run() {
    if (!action || !r) return
    setBusy(true)
    setError(null)

    try {
      if (action.kind === 'erase') {
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
      setReason('')
      setConfirmed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!action}
      title={erasing ? 'Erase this student’s data' : 'Decline this request'}
      onClose={close}
      footer={
        <>
          <button onClick={close} disabled={busy}>Cancel</button>
          <button
            className="danger"
            onClick={run}
            disabled={busy || (erasing ? !confirmed : reason.trim().length < 10)}
          >
            {busy ? 'Working…' : erasing ? 'Erase permanently' : 'Decline request'}
          </button>
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      {r && (
        <p style={{ marginTop: 0 }}>
          <strong>{r.student_name}</strong>
          <br />
          <span className="muted">
            {r.contact ?? 'no contact on file'} · asked {relative(r.requested_at)}
          </span>
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
      ) : (
        <Field
          label="Why is this being declined?"
          required
          hint="Sent to the student. Write the grounds they would need in order to challenge it."
          error={reason && reason.trim().length < 10 ? 'Give at least ten characters.' : undefined}
        >
          {props => (
            <textarea
              {...props}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="An application is still being considered, so the record must be kept until it is decided."
            />
          )}
        </Field>
      )}
    </Dialog>
  )
}
