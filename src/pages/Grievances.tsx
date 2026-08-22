import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { humanise, relative, timestamp } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pager, Pill } from '../components/ui'
import { useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import type { Grievance, GrievanceHandler } from '../lib/types'

/* Grievances — the platform's half of FR-18.
 *
 * Table 3.1 makes "support, moderation, grievance resolution" the Platform
 * Staff role's job, and until now the only place a grievance could be handled
 * was the organisation it was about. That is the wrong party to rely on: a
 * student complaining that an NGO has sat on their application for two months
 * was, structurally, complaining to the NGO. The escalation path in the schema
 * assumed somebody above them was watching, and nobody could.
 *
 * The queue is therefore ordered by breach rather than by arrival. `due_at` has
 * been on the table since the beginning with a comment saying the admin panel
 * would queue against it; this is that.
 */

const STATUSES = ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'] as const

const RESOLUTIONS = [
  { value: 'IN_PROGRESS', label: 'Working on it' },
  { value: 'ESCALATED', label: 'Escalate' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Close without resolving' },
] as const

export default function Grievances() {
  const { can } = useAuth()
  const announce = useAnnounce()

  const [status, setStatus] = useState<string>('OPEN')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Grievance | null>(null)

  const query = useQuery<Grievance[]>(
    signal => api.get('/grievances', { status, page, page_size: 25 }, signal),
    [status, page],
  )

  const handlers = useQuery<GrievanceHandler[]>(
    signal => api.get('/admin/grievances/handlers', undefined, signal),
    [],
  )

  // Compliance officers read the trail and do not work the queue; Table 3.1
  // gives handling to the super admin and to support staff.
  const canHandle = can('PLATFORM_SUPER_ADMIN', 'PLATFORM_STAFF')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grievances</h1>
          <p>
            Complaints raised by students, across every organisation. Overdue
            and unresolved first — a grievance about an organisation cannot be
            left to that organisation to notice.
          </p>
        </div>
      </div>

      {!canHandle && (
        <div className="alert warn" role="status">
          Your role can read grievances but not act on them. Handling belongs to
          platform support staff.
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
                <option value="">All</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{humanise(s)}</option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {query.loading && !query.data && <Loading label="Loading grievances" />}
        {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

        {query.data && query.data.length === 0 && !query.stale && (
          <Empty
            title="Nothing open"
            hint={status === 'OPEN'
              ? 'No student is waiting on an answer.'
              : 'No grievances match this filter.'}
          />
        )}

        {query.data && query.data.length > 0 && (
          <div className={query.stale ? 'stale' : undefined} aria-busy={query.stale || undefined}>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  Grievances, overdue and unresolved first
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Subject</th>
                    <th scope="col">About</th>
                    <th scope="col">Raised</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map(g => (
                    <tr key={g.grievance_id}>
                      <th scope="row" className="mono nowrap">{g.reference_code}</th>
                      <td>
                        {g.subject}
                        <div className="faint" style={{ fontSize: 12 }}>
                          {humanise(g.category)}
                        </div>
                      </td>
                      <td className="truncate">
                        {g.organisation_name ?? <span className="faint">the platform</span>}
                      </td>
                      <td className="nowrap">
                        {relative(g.created_at)}
                        {g.overdue && (
                          <div><Pill tone="danger">Past due</Pill></div>
                        )}
                      </td>
                      <td>
                        <Pill tone={toneFor(g.status, g.overdue)}>{humanise(g.status)}</Pill>
                      </td>
                      <td className="actions">
                        <button className="sm" onClick={() => setOpen(g)}>
                          Open<span className="sr-only"> {g.reference_code}</span>
                        </button>
                      </td>
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

      <GrievanceDialog
        grievance={open}
        handlers={handlers.data ?? []}
        canHandle={canHandle}
        onClose={() => setOpen(null)}
        onDone={message => {
          setOpen(null)
          announce(message)
          query.reload()
        }}
      />
    </>
  )
}

function toneFor(status: string, overdue: boolean) {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'ok' as const
  if (status === 'ESCALATED' || overdue) return 'danger' as const
  return 'warn' as const
}

function GrievanceDialog({
  grievance, handlers, canHandle, onClose, onDone,
}: {
  grievance: Grievance | null
  handlers: GrievanceHandler[]
  canHandle: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [status, setStatus] = useState('RESOLVED')
  const [resolution, setResolution] = useState('')
  const [assignee, setAssignee] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The full conversation, fetched only once a grievance is opened: a list of
  // fifty tickets should not pull fifty message threads with it.
  const detail = useQuery<Grievance>(
    signal => grievance
      ? api.get(`/grievances/${grievance.grievance_id}`, undefined, signal)
      : Promise.resolve({ data: null as unknown as Grievance }),
    [grievance?.grievance_id ?? ''],
  )

  function close() {
    setResolution('')
    setAssignee('')
    setError(null)
    onClose()
  }

  async function assign() {
    if (!grievance) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/admin/grievances/${grievance.grievance_id}/assign`,
        { assigned_to: assignee || null })
      onDone(assignee
        ? `${grievance.reference_code} assigned.`
        : `${grievance.reference_code} returned to the pool.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function resolve() {
    if (!grievance) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/admin/grievances/${grievance.grievance_id}/resolve`,
        { status, resolution })
      onDone(`${grievance.reference_code} — ${humanise(status).toLowerCase()}. The student has been told.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const body = detail.data ?? grievance

  return (
    <Dialog
      open={!!grievance}
      title={grievance ? `${grievance.reference_code} — ${grievance.subject}` : ''}
      onClose={close}
      footer={
        <>
          <button onClick={close} disabled={busy}>Close</button>
          {canHandle && (
            <button
              className="primary"
              onClick={resolve}
              disabled={busy || resolution.trim().length < 10}
            >
              {busy ? 'Saving…' : 'Save answer'}
            </button>
          )}
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      {body && (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            {humanise(body.category)} · raised {relative(body.created_at)}
            {body.organisation_name && ` · about ${body.organisation_name}`}
            {body.due_at && ` · due ${timestamp(body.due_at)}`}
          </p>

          {/* The student's own words, first and unabridged. An operator
              deciding what to do needs the complaint, not a summary of it. */}
          <blockquote className="quote">{body.description}</blockquote>

          {detail.loading && <Loading label="Loading the conversation" />}

          {!!body.messages?.length && (
            <div className="thread">
              {body.messages.map(m => (
                <div key={m.message_id} className={`msg${m.is_internal ? ' internal' : ''}`}>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {m.is_internal ? 'Internal note' : m.author_self ? 'You' : 'Them'}
                    {' · '}{relative(m.created_at)}
                  </div>
                  {m.body}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {canHandle && (
        <>
          <div className="row" style={{ alignItems: 'flex-end', marginTop: '0.75rem' }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor="assignee">Handled by</label>
              <select id="assignee" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">Nobody — return to the pool</option>
                {handlers.map(h => (
                  <option key={h.user_id} value={h.user_id}>
                    {h.label} · {humanise(h.role)}
                  </option>
                ))}
              </select>
            </div>
            <button className="sm" onClick={assign} disabled={busy}>Assign</button>
          </div>

          <Field label="Outcome" required>
            {props => (
              <select {...props} value={status} onChange={e => setStatus(e.target.value)}>
                {RESOLUTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            )}
          </Field>

          <Field
            label="What are you telling them?"
            required
            hint="Sent to the student. Write it for them, not for the log."
            error={resolution && resolution.trim().length < 10
              ? 'Give at least ten characters.' : undefined}
          >
            {props => (
              <textarea
                {...props}
                value={resolution}
                onChange={e => setResolution(e.target.value)}
                placeholder="We have asked Sahyog Foundation to review your application this week and will write again on Friday."
              />
            )}
          </Field>
        </>
      )}
    </Dialog>
  )
}
