import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { count, humanise, relative, timestamp } from '../lib/format'
import { roleLabel } from '../lib/roles'
import { Empty, ErrorState, Field, Loading, Pager, Pill } from '../components/ui'
import SplitView, { DetailEmpty, QueueItem } from '../components/SplitView'
import { Stat } from '../components/charts'
import { useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import type { Grievance, GrievanceCounts, GrievanceHandler } from '../lib/types'

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
 *
 * The complaint sits beside the queue rather than inside a modal. That mattered
 * more here than on any other screen: this detail is a conversation — the
 * student's own words, then every message since — and a thread in a modal is
 * read once and dismissed. Beside the list it stays open while the answer is
 * written, and moving to the next grievance does not mean closing this one.
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
  /* The reference last clicked, not the row object. Holding the row would pin a
   * copy that the next reload makes stale — an overdue flag that has since been
   * resolved, a status that has moved on. */
  const [wantID, setWantID] = useState<string | null>(null)

  const query = useQuery<Grievance[]>(
    signal => api.get('/grievances', { status, page, page_size: 25 }, signal),
    [status, page],
  )

  const handlers = useQuery<GrievanceHandler[]>(
    signal => api.get('/admin/grievances/handlers', undefined, signal),
    [],
  )

  const counts = useQuery<GrievanceCounts>(
    signal => api.get('/admin/grievances/counts', undefined, signal),
    [],
  )

  const rows = query.data ?? []

  /* Derived while rendering, so the pane can never show a grievance the list no
   * longer holds — resolving one drops it out of the OPEN filter. Falling back
   * to the first row also means the next complaint is up as soon as this one is
   * answered. */
  const selected = rows.find(g => g.grievance_id === wantID) ?? rows[0] ?? null
  const selectedID = selected?.grievance_id ?? null
  /* An actual click, which is what swaps the panes when only one fits. */
  const opened = !!wantID

  // Compliance officers read the trail and do not work the queue; Table 3.1
  // gives handling to the super admin and to support staff.
  const canHandle = can('SUPER_ADMIN', 'STAFF')

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

      {counts.data && (
        <div className="grid cols-4" style={{ marginBottom: '0.75rem' }}>
          <Stat
            label="Raised"
            value={count(counts.data.total)}
            sub="Every complaint students have brought, across all organisations"
          />
          <Stat
            label="Still live"
            value={count(counts.data.open + counts.data.escalated)}
            sub={counts.data.escalated > 0
              ? `${count(counts.data.escalated)} escalated past the ordinary queue`
              : 'Open, in progress, or waiting on the student'}
          />
          <Stat
            label="Overdue"
            value={count(counts.data.overdue)}
            sub={counts.data.overdue > 0
              ? 'Past the date the student was promised an answer'
              : 'Everything live is inside its promise'}
          />
          <Stat
            label="Settled"
            value={count(counts.data.resolved + counts.data.closed)}
            sub={`${count(counts.data.resolved)} resolved, ${count(counts.data.closed)} closed without action`}
          />
        </div>
      )}

      {!canHandle && (
        <div className="alert warn" role="status">
          Your role can read grievances but not act on them. Handling belongs to
          platform support staff.
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

            {query.data && rows.length === 0 && !query.stale && (
              <Empty
                title="Nothing open"
                hint={status === 'OPEN'
                  ? 'No student is waiting on an answer.'
                  : 'No grievances match this filter.'}
              />
            )}

            {rows.length > 0 && (
              <div
                className={`split-scroll${query.stale ? ' stale' : ''}`}
                aria-busy={query.stale || undefined}
              >
                <ul className="queue">
                  {rows.map(g => (
                    <QueueItem
                      key={g.grievance_id}
                      name={g.subject}
                      sub={[
                        g.reference_code,
                        humanise(g.category),
                        g.organisation_name ?? 'the platform',
                        relative(g.created_at),
                      ].join(' · ')}
                      /* Past due wins the slot when both apply. The status is in
                         the pane; which of these is breached is the only thing
                         worth scanning a column of fifty for. */
                      side={g.overdue
                        ? <Pill tone="danger">Past due</Pill>
                        : <Pill tone={toneFor(g.status, g.overdue)}>{humanise(g.status)}</Pill>}
                      selected={g.grievance_id === selectedID}
                      onSelect={() => setWantID(g.grievance_id)}
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
              key={selected.grievance_id}
              grievance={selected}
              handlers={handlers.data ?? []}
              canHandle={canHandle}
              onDone={message => {
                announce(message)
                query.reload()
                // Resolving one moves it from "still live" to "settled".
                counts.reload()
              }}
            />
          ) : (
            <DetailEmpty hint="Choose a grievance from the queue to read it." />
          )
        }
      />
    </>
  )
}

function toneFor(status: string, overdue: boolean) {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'ok' as const
  if (status === 'ESCALATED' || overdue) return 'danger' as const
  return 'warn' as const
}

/* One grievance, read and answered.
 *
 * Keyed on the grievance id by the caller, so moving to the next one discards a
 * half-written answer rather than carrying it across. An answer composed for one
 * student and sent to another is the failure this prevents.
 */
function Detail({
  grievance, handlers, canHandle, onDone,
}: {
  grievance: Grievance
  handlers: GrievanceHandler[]
  canHandle: boolean
  onDone: (message: string) => void
}) {
  const [status, setStatus] = useState('RESOLVED')
  const [resolution, setResolution] = useState('')
  const [assignee, setAssignee] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* The full conversation, fetched per grievance rather than with the list: a
   * page of twenty-five tickets should not pull twenty-five message threads with
   * it. The row already carries enough to render the header, so the pane is
   * useful before this arrives. */
  const detail = useQuery<Grievance>(
    signal => api.get(`/grievances/${grievance.grievance_id}`, undefined, signal),
    [grievance.grievance_id],
  )

  async function assign() {
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
    <>
      <header>
        <div>
          <h2 className="detail-title">{grievance.subject}</h2>
          <p className="detail-sub">
            <span className="mono">{grievance.reference_code}</span>
            {' · '}{humanise(body.category)}
            {' · raised '}{relative(body.created_at)}
            {body.organisation_name && ` · about ${body.organisation_name}`}
            {body.due_at && ` · due ${timestamp(body.due_at)}`}
          </p>
        </div>
        <Pill tone={toneFor(body.status, body.overdue)}>
          {body.overdue ? 'Past due' : humanise(body.status)}
        </Pill>
      </header>

      <div className="detail-body">
      {error && <div className="alert danger" role="alert">{error}</div>}

      {/* The student's own words, first and unabridged. An operator deciding
          what to do needs the complaint, not a summary of it. */}
      <blockquote className="quote" style={{ marginTop: 0 }}>{body.description}</blockquote>

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

      {canHandle && (
        <>
          <div className="row" style={{ alignItems: 'flex-end', marginTop: '0.75rem' }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor="assignee">Handled by</label>
              <select id="assignee" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">Nobody — return to the pool</option>
                {handlers.map(h => (
                  <option key={h.user_id} value={h.user_id}>
                    {h.label} · {roleLabel(h.role)}
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
      </div>

      {canHandle && (
        <div className="detail-actions">
          <button
            className="primary"
            onClick={resolve}
            disabled={busy || resolution.trim().length < 10}
          >
            {busy ? 'Saving…' : 'Send the answer'}
          </button>
        </div>
      )}
    </>
  )
}
