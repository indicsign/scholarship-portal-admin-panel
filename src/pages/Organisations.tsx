import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { date, humanise } from '../lib/format'
import { Empty, ErrorState, Field, Loading, Pager, StatusPill } from '../components/ui'
import SplitView, { DetailEmpty, QueueItem } from '../components/SplitView'
import { useQuery } from '../lib/hooks'
import { useAnnounce, type Tone } from '../lib/announce'
import type { Organisation } from '../lib/types'

/* The organisation approval queue.
 *
 * Table 4.1 puts this first in the admin panel's brief, and section 3.3 says
 * why it matters: an approved organisation gains sight of applicants' disability
 * certificates. Approving one is the act that admits a new party to sensitive
 * personal data, so the screen is built to make the decision deliberate rather
 * than quick.
 *
 * Deliberate now means the whole organisation is on screen while the decision is
 * made. It used to mean a seven-column table where the registration number sat
 * on the row, and a modal that restated the same four fields once the operator
 * had already chosen Approve or Reject — so the check happened before the
 * subject was fully in view, and the confirmation step was a second reading of
 * what had just been read. The queue on the left now carries the name, where it
 * is and how long it has waited; everything the decision rests on is in the pane
 * beside it, and the buttons are underneath that rather than at the far end of a
 * table row.
 *
 * The reason box stays inline for the same reason. Rejecting and suspending both
 * require one, and it belongs next to the thing being rejected.
 */

const STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED', 'REJECTED'] as const

export default function Organisations() {
  const { can } = useAuth()
  const announce = useAnnounce()

  const [status, setStatus] = useState<string>('PENDING_APPROVAL')
  const [orgType, setOrgType] = useState('')
  const [page, setPage] = useState(1)
  /* What the operator last clicked — an intent, not the answer. */
  const [wantID, setWantID] = useState<string | null>(null)

  const query = useQuery<Organisation[]>(
    signal => api.get('/admin/organisations', {
      status, org_type: orgType, page, page_size: 25,
    }, signal),
    [status, orgType, page],
  )

  const rows = query.data ?? []

  /* Derived while rendering rather than stored and then corrected.
   *
   * The list is refetched after every decision and whenever a filter changes, so
   * the organisation last clicked may no longer be in it — an approved one
   * leaves the pending queue. Resolving that here means the pane can never be
   * stranded showing something the list no longer contains, and that after a
   * decision the next item in the queue is already up.
   *
   * The alternative — an effect that watches the rows and calls setState to fix
   * a stale selection — is a render, then a second render to undo it, and one
   * frame in between where the two disagree. There is nothing to synchronise
   * here: the selection is a function of the rows and the click. */
  const selected = rows.find(o => o.organisation_id === wantID) ?? rows[0] ?? null
  const selectedID = selected?.organisation_id ?? null

  /* Whether the operator has actually opened something, which is what swaps the
   * panes when there is only room for one.
   *
   * Not `!!selected`: that falls back to the first row so the pane is never
   * empty on a wide screen, and keying the swap to it would send a phone
   * straight past the queue into a detail nobody asked for. */
  const opened = !!wantID

  // Only the Super Admin admits or refuses an organisation (Table 3.1). Staff
  // and compliance officers see the queue but cannot act on it, so the controls
  // are absent rather than present-and-failing.
  const canDecide = can('SUPER_ADMIN')

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

      <SplitView
        showDetailOnNarrow={opened}
        onBack={() => setWantID(null)}
        backLabel="Back to the queue"
        list={
          <>
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
                    <option value="PRIVATE">Private</option>
                  </select>
                </div>
              </div>
            </header>

            {query.loading && !query.data && <Loading label="Loading organisations" />}
            {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

            {query.data && rows.length === 0 && !query.stale && (
              <Empty
                title="Nothing here"
                hint={status === 'PENDING_APPROVAL'
                  ? 'No organisations are waiting for a decision.'
                  : 'No organisations match these filters.'}
              />
            )}

            {rows.length > 0 && (
              // The previous filter's rows stay on screen while the next request
              // is in flight, under a progress bar and inert. Blanking the list
              // instead costs the operator their place every time they touch a
              // filter.
              <div
                className={`split-scroll${query.stale ? ' stale' : ''}`}
                aria-busy={query.stale || undefined}
              >
                <ul className="queue">
                  {rows.map(org => (
                    <QueueItem
                      key={org.organisation_id}
                      name={org.name}
                      sub={[
                        humanise(org.org_type),
                        [org.district, org.state_code].filter(Boolean).join(', '),
                        `applied ${date(org.created_at)}`,
                      ].filter(Boolean).join(' · ')}
                      side={<StatusPill status={org.status} />}
                      selected={org.organisation_id === selectedID}
                      onSelect={() => setWantID(org.organisation_id)}
                    />
                  ))}
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
              key={selected.organisation_id}
              org={selected}
              canDecide={canDecide}
              onDone={(message, tone) => {
                announce(message, tone)
                query.reload()
              }}
            />
          ) : (
            <DetailEmpty hint="Choose an organisation from the queue to see its application." />
          )
        }
      />
    </>
  )
}

type Kind = 'approve' | 'reject' | 'suspend'

const LABELS: Record<Kind, string> = {
  approve: 'Approve',
  reject: 'Reject',
  suspend: 'Suspend',
}

/* One organisation, and the decision.
 *
 * Keyed on the organisation id by the caller, so selecting a different one
 * remounts this and every piece of half-entered state goes with it. Carrying a
 * typed rejection reason across a change of selection is how a reason written
 * for one organisation gets sent to another.
 */
function Detail({
  org, canDecide, onDone,
}: {
  org: Organisation
  canDecide: boolean
  onDone: (message: string, tone: Tone) => void
}) {
  const [kind, setKind] = useState<Kind | null>(null)
  const [reason, setReason] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsReason = kind === 'reject' || kind === 'suspend'
  const ready = !needsReason || reason.trim().length >= 5

  async function confirm() {
    if (!kind) return
    setBusy(true)
    setError(null)

    try {
      const id = org.organisation_id
      if (kind === 'approve') {
        await api.post(`/admin/organisations/${id}/approve`, {
          admin_email: adminEmail || undefined,
        })
        onDone(
          `${org.name} approved. An account was created for its administrator `
          + 'and a temporary password sent.',
          'ok',
        )
      } else if (kind === 'reject') {
        await api.post(`/admin/organisations/${id}/reject`, { reason })
        onDone(`${org.name} rejected. The reason has been sent to them.`, 'warn')
      } else {
        await api.post(`/admin/organisations/${id}/suspend`, { reason })
        onDone(`${org.name} suspended. Its staff have been signed out.`, 'danger')
      }
      setKind(null)
      setReason('')
      setAdminEmail('')
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
          <h2 className="detail-title">{org.name}</h2>
          <p className="detail-sub">
            {humanise(org.org_type)} · applied {date(org.created_at)}
          </p>
        </div>
        <StatusPill status={org.status} />
      </header>

      <div className="detail-body">
        {error && <div className="alert danger" role="alert">{error}</div>}

        <dl className="detail-fields">
          <dt>Registration</dt>
          <dd className="mono">{org.registration_number ?? '—'}</dd>

          <dt>Contact</dt>
          <dd>{org.contact_email}</dd>

          {org.contact_phone && (
            <>
              <dt>Phone</dt>
              <dd className="mono">{org.contact_phone}</dd>
            </>
          )}

          <dt>Where</dt>
          <dd>{[org.district, org.state_code].filter(Boolean).join(', ') || '—'}</dd>

          {typeof org.member_count === 'number' && (
            <>
              <dt>Members</dt>
              <dd>{org.member_count}</dd>
            </>
          )}

          {org.rejection_reason && (
            <>
              <dt>Reason on file</dt>
              <dd>{org.rejection_reason}</dd>
            </>
          )}
        </dl>

        {/* Stated where the decision is made, not in a modal after it. What an
            approval actually grants is the whole substance of the decision. */}
        {canDecide && org.status === 'PENDING_APPROVAL' && (
          <div className="alert warn" style={{ marginTop: '0.75rem' }}>
            <p>
              Approving lets this organisation publish scholarships and read the
              profile of any student who applies to one, including their
              disability certificate.
            </p>
          </div>
        )}

        {kind === 'approve' && (
          <Field
            label="Administrator's email address"
            hint={`Leave blank to use the contact address on file (${org.contact_email}). An account is created and a temporary password sent.`}
          >
            {props => (
              <input
                {...props}
                type="email"
                autoComplete="off"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder={org.contact_email}
              />
            )}
          </Field>
        )}

        {needsReason && (
          <Field
            label="Reason"
            required
            hint={kind === 'reject'
              ? 'Sent to the organisation so it knows what to correct.'
              : 'Recorded in the audit trail. Suspension signs out every member immediately.'}
            error={reason && reason.trim().length < 5 ? 'Give at least a few words.' : undefined}
          >
            {props => (
              <textarea
                {...props}
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            )}
          </Field>
        )}
      </div>

      {canDecide && (
        <div className="detail-actions">
          {/* Two steps still. The first names the decision and opens whatever it
              needs — a reason, an administrator's address — and the second
              commits it, so nothing irreversible is one click from a list. */}
          {kind ? (
            <>
              <button onClick={() => { setKind(null); setReason('') }} disabled={busy}>
                Cancel
              </button>
              <button
                className={kind === 'approve' ? 'primary' : 'danger'}
                onClick={confirm}
                disabled={busy || !ready}
              >
                {busy ? 'Saving…' : `${LABELS[kind]} ${org.name}`}
              </button>
            </>
          ) : (
            <>
              {org.status === 'PENDING_APPROVAL' && (
                <>
                  <button className="danger" onClick={() => setKind('reject')}>Reject</button>
                  <button className="primary" onClick={() => setKind('approve')}>Approve</button>
                </>
              )}
              {org.status === 'APPROVED' && (
                <button className="danger" onClick={() => setKind('suspend')}>Suspend</button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
