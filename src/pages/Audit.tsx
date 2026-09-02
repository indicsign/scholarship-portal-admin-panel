import { Fragment, useState } from 'react'

import * as api from '../lib/api'
import { humanise, relative, timestamp } from '../lib/format'
import { Empty, ErrorState, Loading, Pager, Pill } from '../components/ui'
import { useQuery } from '../lib/hooks'
import type { AuditEntry } from '../lib/types'

/* The audit trail.
 *
 * Table 3.1 assigns audit review to the Compliance Officer, and FR-10 requires
 * every state transition and every privileged read to be permanently logged and
 * attributable. This is where that is read.
 *
 * The screen opens on everything. It used to open on refusals alone, reasoning
 * that a successful login is the overwhelming majority of rows and a denied one
 * is what people come here for — true of why the Outcome filter exists, and not
 * a reason to hide the rest before anybody has asked. A trail that opens
 * pre-filtered shows an empty table whenever the chosen slice is empty, with
 * nothing to say that a filter rather than an absence of activity produced it,
 * and "what did this operator do on Tuesday" is not answerable from it without
 * first noticing the filter and clearing it.
 */

const OUTCOMES = ['DENIED', 'SUCCESS', 'ERROR'] as const

export default function Audit() {
  const [outcome, setOutcome] = useState<string>('')
  const [action, setAction] = useState('')
  const [subjectType, setSubjectType] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const actions = useQuery<string[]>(
    signal => api.get('/admin/audit/actions', undefined, signal),
    [],
  )

  const query = useQuery<AuditEntry[]>(
    signal => api.get('/admin/audit', {
      outcome, action, subject_type: subjectType, page, page_size: 50,
    }, signal),
    [outcome, action, subjectType, page],
  )

  function reset(fn: () => void) {
    fn()
    setPage(1)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit trail</h1>
          <p>
            Append-only, enforced by the database. The last 30 days by default.
            Entries cannot be edited or deleted — a correction is a new entry.
          </p>
        </div>
      </div>

      <div className="card">
        <header>
          <div className="filters">
            <div className="field">
              <label htmlFor="f-outcome">Outcome</label>
              <select
                id="f-outcome"
                value={outcome}
                onChange={e => reset(() => setOutcome(e.target.value))}
              >
                <option value="">All</option>
                {OUTCOMES.map(o => <option key={o} value={o}>{humanise(o)}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-action">Action</label>
              <select
                id="f-action"
                value={action}
                onChange={e => reset(() => setAction(e.target.value))}
              >
                <option value="">All</option>
                {(actions.data ?? []).map(a => (
                  <option key={a} value={a}>{humanise(a)}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-subject">Subject</label>
              <input
                id="f-subject"
                data-primary-filter
                value={subjectType}
                onChange={e => reset(() => setSubjectType(e.target.value))}
                placeholder="application, document…"
              />
            </div>

            {(outcome || action || subjectType) && (
              <button
                className="subtle sm"
                onClick={() => reset(() => {
                  setOutcome(''); setAction(''); setSubjectType('')
                })}
              >
                Clear filters
              </button>
            )}
          </div>
        </header>

        {query.loading && !query.data && <Loading label="Loading the audit trail" />}
        {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

        {query.data && query.data.length === 0 && !query.stale && (
          <Empty
            title="No entries"
            hint={outcome === 'DENIED'
              ? 'Nothing has been refused in this window. That is the result you want.'
              : 'No entries match these filters.'}
          />
        )}

        {query.data && query.data.length > 0 && (
          // Kept on screen, under a progress bar, while the next filter's
          // rows are fetched.
          <div className={query.stale ? 'stale' : undefined} aria-busy={query.stale || undefined}>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Audit entries, most recent first</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Outcome</th>
                    <th scope="col"><span className="sr-only">Detail</span></th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map(e => {
                    const open = expanded === e.audit_id
                    const hasDetail = e.metadata && Object.keys(e.metadata).length > 0

                    return (
                      // Keyed on the Fragment, which is what the map returns.
                      // A key on the <tr> inside it does not satisfy React and
                      // leaves the detail row free to reconcile against the
                      // wrong entry when the filters change under it.
                      <Fragment key={e.audit_id}>
                        <tr>
                          <td className="mono nowrap">
                            {timestamp(e.created_at)}
                            <div className="faint" style={{ fontSize: 11 }}>
                              {relative(e.created_at)}
                            </div>
                          </td>
                          <td>
                            <div>{e.actor_role ? humanise(e.actor_role) : <span className="faint">system</span>}</div>
                            <div className="faint truncate" style={{ fontSize: 12 }}>
                              {e.actor_organisation ?? e.actor_email ?? '—'}
                            </div>
                            {e.impersonated && (
                              // Without this, an action taken during a support
                              // session reads as the user's own.
                              <Pill tone="warn">via support</Pill>
                            )}
                          </td>
                          <td className="nowrap">{humanise(e.action)}</td>
                          <td>
                            {humanise(e.subject_type)}
                            {e.subject_id && (
                              <div className="faint mono" style={{ fontSize: 11 }}>
                                {e.subject_id.slice(0, 8)}
                              </div>
                            )}
                          </td>
                          <td>
                            <Pill tone={e.outcome === 'DENIED' ? 'danger' : e.outcome === 'ERROR' ? 'warn' : 'ok'}>
                              {humanise(e.outcome)}
                            </Pill>
                          </td>
                          <td className="actions">
                            {hasDetail && (
                              <button
                                className="subtle sm"
                                aria-expanded={open}
                                onClick={() => setExpanded(open ? null : e.audit_id)}
                              >
                                {open ? 'Hide' : 'Detail'}
                                <span className="sr-only"> for {humanise(e.action)} at {timestamp(e.created_at)}</span>
                              </button>
                            )}
                          </td>
                        </tr>

                        {open && (
                          <tr>
                            <td colSpan={6} style={{ background: 'var(--surface-sunken)' }}>
                              <dl style={{ margin: 0, display: 'grid', gap: '0.25rem' }}>
                                {Object.entries(e.metadata ?? {}).map(([k, v]) => (
                                  <div key={k} className="row" style={{ gap: '0.5rem' }}>
                                    <dt className="muted" style={{ minWidth: '10rem', fontSize: 12 }}>
                                      {humanise(k)}
                                    </dt>
                                    <dd className="mono" style={{ margin: 0, fontSize: 12 }}>
                                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                    </dd>
                                  </div>
                                ))}
                                {e.request_id && (
                                  <div className="row" style={{ gap: '0.5rem' }}>
                                    <dt className="muted" style={{ minWidth: '10rem', fontSize: 12 }}>Request</dt>
                                    <dd className="mono" style={{ margin: 0, fontSize: 12 }}>{e.request_id}</dd>
                                  </div>
                                )}
                                {e.ip_address && (
                                  <div className="row" style={{ gap: '0.5rem' }}>
                                    <dt className="muted" style={{ minWidth: '10rem', fontSize: 12 }}>Address</dt>
                                    <dd className="mono" style={{ margin: 0, fontSize: 12 }}>{e.ip_address}</dd>
                                  </div>
                                )}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
    </>
  )
}
