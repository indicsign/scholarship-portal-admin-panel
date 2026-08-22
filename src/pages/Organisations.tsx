import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { date, humanise } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pager, StatusPill } from '../components/ui'
import { useQuery } from '../lib/hooks'
import { useAnnounce, type Tone } from '../lib/announce'
import type { Organisation } from '../lib/types'

/* The organisation approval queue.
 *
 * Table 4.1 puts this first in the admin panel's brief, and section 3.3 says
 * why it matters: an approved organisation gains sight of applicants' disability
 * certificates. Approving one is the act that admits a new party to sensitive
 * personal data, so the screen is built to make the decision deliberate rather
 * than quick — the registration number and contact address are on the row, and
 * both decisions open a dialog rather than firing on a single click.
 */

type Decision =
  | { kind: 'approve'; org: Organisation }
  | { kind: 'reject'; org: Organisation }
  | { kind: 'suspend'; org: Organisation }

const STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED', 'REJECTED'] as const

export default function Organisations() {
  const { can } = useAuth()
  const announce = useAnnounce()

  const [status, setStatus] = useState<string>('PENDING_APPROVAL')
  const [orgType, setOrgType] = useState('')
  const [page, setPage] = useState(1)
  const [decision, setDecision] = useState<Decision | null>(null)

  const query = useQuery<Organisation[]>(
    signal => api.get('/admin/organisations', {
      status, org_type: orgType, page, page_size: 25,
    }, signal),
    [status, orgType, page],
  )

  // Only the Super Admin admits or refuses an organisation (Table 3.1). Staff
  // and compliance officers see the queue but cannot act on it, so the controls
  // are absent rather than present-and-failing.
  const canDecide = can('PLATFORM_SUPER_ADMIN')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Organisations</h1>
          <p>
            Approving an organisation admits it to applicants' certificates and
            income records. Check the registration number against the register
            before deciding.
          </p>
        </div>
      </div>

      <div className="card">
        <header>
          <div className="filters">
            <div className="field">
              <label htmlFor="filter-status">Status</label>
              <select
                id="filter-status"
                data-primary-filter
                value={status}
                onChange={e => { setStatus(e.target.value); setPage(1) }}
              >
                <option value="">All</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{humanise(s)}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="filter-type">Type</label>
              <select
                id="filter-type"
                value={orgType}
                onChange={e => { setOrgType(e.target.value); setPage(1) }}
              >
                <option value="">All</option>
                <option value="NGO">NGO</option>
                <option value="CORPORATE">Corporate</option>
                <option value="GOVERNMENT">Government</option>
              </select>
            </div>
          </div>
        </header>

        {query.loading && !query.data && <Loading label="Loading organisations" />}
        {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

        {query.data && query.data.length === 0 && !query.stale && (
          <Empty
            title="Nothing here"
            hint={status === 'PENDING_APPROVAL'
              ? 'No organisations are waiting for a decision.'
              : 'No organisations match these filters.'}
          />
        )}

        {query.data && query.data.length > 0 && (
          // The previous filter's rows stay on screen while the next
          // request is in flight, under a progress bar and inert. Blanking the
          // table instead costs the operator their place every time they touch
          // a filter.
          <div className={query.stale ? 'stale' : undefined} aria-busy={query.stale || undefined}>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  Organisations, filtered by status and type
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Organisation</th>
                    <th scope="col">Type</th>
                    <th scope="col">Registration</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Applied</th>
                    <th scope="col">Status</th>
                    {canDecide && <th scope="col"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.map(org => (
                    <tr key={org.organisation_id}>
                      <th scope="row" style={{ fontWeight: 600 }}>
                        {org.name}
                        <div className="faint" style={{ fontWeight: 400, fontSize: 12 }}>
                          {[org.district, org.state_code].filter(Boolean).join(', ') || '—'}
                          {typeof org.member_count === 'number' && ` · ${org.member_count} members`}
                        </div>
                      </th>
                      <td>{humanise(org.org_type)}</td>
                      <td className="mono">{org.registration_number ?? '—'}</td>
                      <td className="truncate">{org.contact_email}</td>
                      <td className="nowrap">{date(org.created_at)}</td>
                      <td>
                        <StatusPill status={org.status} />
                        {org.rejection_reason && (
                          <div className="faint" style={{ fontSize: 12 }}>{org.rejection_reason}</div>
                        )}
                      </td>
                      {canDecide && (
                        <td className="actions">
                          {org.status === 'PENDING_APPROVAL' && (
                            <div className="row" style={{ justifyContent: 'flex-end' }}>
                              <button
                                className="sm primary"
                                onClick={() => setDecision({ kind: 'approve', org })}
                              >
                                Approve<span className="sr-only"> {org.name}</span>
                              </button>
                              <button
                                className="sm danger"
                                onClick={() => setDecision({ kind: 'reject', org })}
                              >
                                Reject<span className="sr-only"> {org.name}</span>
                              </button>
                            </div>
                          )}
                          {org.status === 'APPROVED' && (
                            <button
                              className="sm danger"
                              onClick={() => setDecision({ kind: 'suspend', org })}
                            >
                              Suspend<span className="sr-only"> {org.name}</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
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

      <DecisionDialog
        decision={decision}
        onClose={() => setDecision(null)}
        onDone={(message, tone) => {
          setDecision(null)
          announce(message, tone)
          query.reload()
        }}
      />
    </>
  )
}

function DecisionDialog({
  decision, onClose, onDone,
}: {
  decision: Decision | null
  onClose: () => void
  onDone: (message: string, tone: Tone) => void
}) {
  const [reason, setReason] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const org = decision?.org
  const needsReason = decision?.kind === 'reject' || decision?.kind === 'suspend'

  async function confirm() {
    if (!decision || !org) return
    setBusy(true)
    setError(null)

    try {
      const id = org.organisation_id
      if (decision.kind === 'approve') {
        await api.post(`/admin/organisations/${id}/approve`, {
          admin_email: adminEmail || undefined,
        })
        onDone(
          `${org.name} approved. An account was created for its administrator `
          + 'and a temporary password sent.',
          'ok',
        )
      } else if (decision.kind === 'reject') {
        await api.post(`/admin/organisations/${id}/reject`, { reason })
        onDone(`${org.name} rejected. The reason has been sent to them.`, 'warn')
      } else {
        await api.post(`/admin/organisations/${id}/suspend`, { reason })
        onDone(`${org.name} suspended. Its staff have been signed out.`, 'danger')
      }
      setReason('')
      setAdminEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Decision['kind'], string> = {
    approve: 'Approve organisation',
    reject: 'Reject application',
    suspend: 'Suspend organisation',
  }

  return (
    <Dialog
      open={!!decision}
      title={decision ? titles[decision.kind] : ''}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className={decision?.kind === 'approve' ? 'primary' : 'danger'}
            onClick={confirm}
            disabled={busy || (needsReason && reason.trim().length < 5)}
          >
            {busy ? 'Saving…' : decision ? titles[decision.kind] : ''}
          </button>
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      {org && (
        <p style={{ marginTop: 0 }}>
          <strong>{org.name}</strong>
          <br />
          <span className="muted">
            {humanise(org.org_type)} · {org.registration_number ?? 'no registration number'} ·{' '}
            {org.contact_email}
          </span>
        </p>
      )}

      {decision?.kind === 'approve' && (
        <>
          <div className="alert warn">
            <p>
              This organisation will be able to publish scholarships and to read
              the profile of any student who applies to one.
            </p>
          </div>
          <Field
            label="Administrator's email address"
            hint={`Leave blank to use the contact address on file (${org?.contact_email ?? ''}). An account is created and a temporary password sent.`}
          >
            {props => (
              <input
                {...props}
                type="email"
                autoComplete="off"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder={org?.contact_email}
              />
            )}
          </Field>
        </>
      )}

      {needsReason && (
        <Field
          label="Reason"
          required
          hint={decision?.kind === 'reject'
            ? 'Sent to the organisation so it knows what to correct.'
            : 'Recorded in the audit trail. Suspension signs out every member immediately.'}
          error={reason && reason.trim().length < 5 ? 'Give at least a few words.' : undefined}
        >
          {props => (
            <textarea {...props} value={reason} onChange={e => setReason(e.target.value)} />
          )}
        </Field>
      )}
    </Dialog>
  )
}
