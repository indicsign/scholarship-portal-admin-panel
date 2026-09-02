import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { count, date, humanise, money } from '../lib/format'
import { Empty, ErrorState, Field, Loading, Pager, Pill } from '../components/ui'
import SplitView, { DetailEmpty, QueueItem } from '../components/SplitView'
import { Stat } from '../components/charts'
import { useQuery } from '../lib/hooks'
import { useAnnounce, type Tone } from '../lib/announce'
import type {
  PendingStudent, StudentVerification, VaultDocument, VerificationCounts,
} from '../lib/types'

/* Verifying a student: their claims, and the evidence behind them.
 *
 * A student uploads a disability certificate and the portal tells them "waiting
 * to be verified". Nothing showed an operator that it was waiting — the only
 * route to the file was Users → find the student → Documents, which needs you to
 * already know the document exists.
 *
 * ---------------------------------------------------------------------------
 * Why the queue is students and not documents
 * ---------------------------------------------------------------------------
 *
 * A certificate is not checkable on its own. The percentage printed on the scan
 * has to be the percentage on the profile; the name has to be the same person;
 * the UDID has to match. A queue of documents asks somebody to decide one file
 * at a time about a person they cannot see, and the decision it invites is "is
 * this a real-looking certificate" rather than "is this THEIR certificate".
 *
 * So one row is one student, and the pane puts the claims beside the evidence.
 * It also matches how the work arrives: three documents uploaded in one sitting
 * are one person's afternoon, not three separate jobs.
 *
 * ---------------------------------------------------------------------------
 * The blue badge
 * ---------------------------------------------------------------------------
 *
 * A verified fact is marked, on the profile field and on the document alike, and
 * it reads from `verified_fields` — maintained by a trigger from
 * verification_record, so it says verified exactly when the vault does. It is
 * never inferred from a document existing, which is the distinction the whole
 * screen turns on: an uploaded certificate is a claim, and only an attestation
 * makes it a fact.
 *
 * Colour is not the only signal. Each badge carries the word "Verified" and a
 * tick, so it survives monochrome and colour vision deficiency.
 */

/* How an account's standing is coloured.
 *
 * Neutral for ACTIVE deliberately: the ordinary case should not carry a green
 * badge competing with the blue Verified marks beside it, which are the ones
 * this screen is about. The two that are not ordinary get a colour. */
const ACCOUNT_TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'danger'> = {
  ACTIVE: 'neutral',
  PENDING_VERIFICATION: 'warn',
  SUSPENDED: 'warn',
  DEACTIVATED: 'danger',
}

const DOC_TYPES = [
  { value: '', label: 'Every kind' },
  { value: 'DISABILITY_CERTIFICATE', label: 'Disability certificate' },
  { value: 'UDID_CARD', label: 'UDID card' },
  { value: 'INCOME_CERTIFICATE', label: 'Income certificate' },
  { value: 'DOMICILE_CERTIFICATE', label: 'Domicile certificate' },
  { value: 'CASTE_CERTIFICATE', label: 'Caste certificate' },
  { value: 'MARKSHEET', label: 'Marksheet' },
  { value: 'PHOTOGRAPH', label: 'Photograph' },
] as const

export default function Verifications() {
  const { can } = useAuth()
  const announce = useAnnounce()

  const [docType, setDocType] = useState('')
  /* Which set of students. `waiting` is the queue and the default; the other two
     are the lookup — a verified student leaves the queue, and this screen is the
     only place their claims and their evidence appear together, so it has to
     stay reachable afterwards. */
  const [state, setState] = useState<'waiting' | 'verified' | 'all'>('waiting')
  const [page, setPage] = useState(1)
  const [wantID, setWantID] = useState<string | null>(null)

  const query = useQuery<PendingStudent[]>(
    signal => api.get('/admin/verifications', {
      doc_type: docType, state, page, page_size: 25,
    }, signal),
    [docType, state, page],
  )

  const counts = useQuery<VerificationCounts>(
    signal => api.get('/admin/verifications/counts', undefined, signal),
    [],
  )

  const rows = query.data ?? []
  /* Derived while rendering rather than stored and corrected by an effect: the
     list is refetched after every decision and a cleared student leaves it, so
     the pane can never be stranded on somebody the list no longer holds. */
  const selected = rows.find(s => s.profile_id === wantID) ?? rows[0] ?? null
  const opened = !!wantID

  const canDecide = can('SUPER_ADMIN') || can('ADMIN')

  function reload() {
    query.reload()
    counts.reload()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Students</h1>
          <p>
            {state === 'waiting'
              ? 'Students are told their documents are “waiting to be verified”. '
                + 'Until one is, their profile is shown to every scheme as a maybe '
                + 'rather than a match.'
              : 'Everything a student has told us, beside the documents backing '
                + 'it. A blue badge marks what somebody has checked.'}
          </p>
        </div>
      </div>

      {counts.data && (
        <div className="grid cols-4" style={{ marginBottom: '0.75rem' }}>
          <Stat
            label="Waiting"
            value={count(counts.data.waiting)}
            sub={counts.data.waiting > 0
              ? 'Documents nobody has decided yet'
              : 'Nothing is waiting'}
            hero
          />
          <Stat
            label="Waiting over a week"
            value={count(counts.data.overdue)}
            sub={counts.data.overdue > 0
              ? 'Past the week a student should have to wait'
              : 'Everything waiting is inside a week'}
          />
          <Stat
            label="Verified"
            value={count(counts.data.verified)}
            sub="Live attestations, reusable by every scheme"
          />
          <Stat
            label="Lapsing within a month"
            value={count(counts.data.expiring_soon)}
            sub="Will need checking again"
          />
        </div>
      )}

      <SplitView
        showDetailOnNarrow={opened}
        onBack={() => setWantID(null)}
        backLabel="Back to the queue"
        list={
          <>
            <header style={{ display: 'block' }}>
              {/* Which students, then which of their documents. Tabs for the
                  first because it changes what the screen is FOR — a queue to
                  work, or a roll to search — and a select would hide that. */}
              <div className="tabs" role="tablist" aria-label="Which students">
                {([
                  ['waiting', 'Waiting on us'],
                  ['verified', 'Verified'],
                  ['all', 'All students'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={state === key}
                    className={state === key ? 'tab active' : 'tab'}
                    onClick={() => { setState(key); setPage(1); setWantID(null) }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="filters">
                <div className="field">
                  <label htmlFor="filter-doctype">Kind</label>
                  <select
                    id="filter-doctype"
                    data-primary-filter
                    value={docType}
                    onChange={e => { setDocType(e.target.value); setPage(1) }}
                  >
                    {DOC_TYPES.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </header>

            {query.loading && !query.data && <Loading label="Loading the queue" />}
            {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

            {/* An empty queue is the good outcome here, so it does not read as
                a filter that matched nothing. */}
            {query.data && rows.length === 0 && !query.stale && (
              <Empty
                title={state === 'waiting' ? 'Nothing waiting' : 'Nobody here'}
                hint={state === 'waiting'
                  ? (docType === ''
                    ? 'Every uploaded document has been decided.'
                    : 'Nothing of this kind is waiting. Try “Every kind”.')
                  : state === 'verified'
                    ? 'Nothing has been verified yet. Anything waiting is under the first tab.'
                    : 'No students have registered yet.'}
              />
            )}

            {rows.length > 0 && (
              <div
                className={`split-scroll${query.stale ? ' stale' : ''}`}
                aria-busy={query.stale || undefined}
              >
                <ul className="queue">
                  {rows.map(s => (
                    <QueueItem
                      key={s.profile_id}
                      name={s.student_name}
                      sub={[
                        s.doc_types.length > 0
                          ? s.doc_types.map(humanise).join(', ')
                          : 'no documents',
                        // Only meaningful while something is waiting. Under the
                        // other tabs it would be an age since nothing.
                        s.waiting_count > 0
                          ? (s.waiting_days === 0
                            ? 'uploaded today'
                            : `waiting ${count(s.waiting_days)} day${s.waiting_days === 1 ? '' : 's'}`)
                          : '',
                        s.previously_rejected ? 'had one refused before' : '',
                        // Only when it is not the ordinary case. A row saying
                        // "active" on every student is a word nobody reads.
                        s.account_status !== 'ACTIVE'
                          ? humanise(s.account_status).toLowerCase() : '',
                      ].filter(Boolean).join(' · ')}
                      side={
                        /* What the row is FOR, which differs by tab. Waiting
                           says how much work; otherwise it says how much of them
                           is attested, which is what a lookup is asking. */
                        s.waiting_count > 0 ? (
                          <Pill tone={s.waiting_days >= 7 ? 'warn' : 'neutral'}>
                            {s.waiting_count === 1
                              ? '1 waiting'
                              : `${count(s.waiting_count)} waiting`}
                          </Pill>
                        ) : s.verified_count > 0 ? (
                          <Pill tone="ok">
                            {s.verified_count === s.document_count
                              ? 'All verified'
                              : `${count(s.verified_count)} of ${count(s.document_count)}`}
                          </Pill>
                        ) : (
                          <Pill tone="neutral">Nothing uploaded</Pill>
                        )
                      }
                      selected={s.profile_id === selected?.profile_id}
                      onSelect={() => setWantID(s.profile_id)}
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
              key={selected.profile_id}
              student={selected}
              canDecide={canDecide}
              canAdminister={can('SUPER_ADMIN')}
              onDone={(message, tone) => { announce(message, tone); reload() }}
            />
          ) : (
            <DetailEmpty hint="Choose a student to read their details and documents." />
          )
        }
      />
    </>
  )
}

/* --- the blue badge --------------------------------------------------------- */

/* Marks a fact somebody has attested to.
 *
 * The tick and the word both matter. Colour alone would put the entire
 * distinction between "they claim 83%" and "somebody checked they are 83%" into
 * a hue, which is exactly what WCAG 1.4.1 forbids and what a monochrome print of
 * this screen would lose.
 */
function VerifiedBadge({ what }: { what?: string }) {
  return (
    <span className="verified-badge">
      <svg viewBox="0 0 16 16" aria-hidden="true" width="12" height="12">
        <path
          d="M2 8.5l4 4 8-9"
          fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      Verified
      {what && <span className="sr-only"> {what}</span>}
    </span>
  )
}

/* --- one student ------------------------------------------------------------ */

function Detail({
  student, canDecide, canAdminister, onDone,
}: {
  student: PendingStudent
  canDecide: boolean
  /* Suspending or closing somebody's account is narrower than deciding their
     documents: a verification is about a file, and this is about a person's
     access to the platform. Super admin alone, matching User management. */
  canAdminister: boolean
  onDone: (message: string, tone: Tone) => void
}) {
  /* Claims and evidence in one request. Two would render one before the other
     and invite a decision made on half of it. */
  const detail = useQuery<StudentVerification>(
    signal => api.get(`/admin/verifications/${student.profile_id}`, undefined, signal),
    [student.profile_id],
  )

  const p = detail.data?.profile
  const docs = detail.data?.documents ?? []
  const verified = new Set(p?.verified_fields ?? [])

  /* Which document is open. Defaults to the first one still waiting, because
     that is what the operator came for; a student with two verified documents
     and one pending should land on the pending one. */
  const pending = docs.filter(d => !d.verification)
  const [openID, setOpenID] = useState<string | null>(null)
  const shown = docs.find(d => d.document_id === openID)
    ?? pending[0] ?? docs[0] ?? null

  return (
    <>
      <header>
        <div>
          <h2 className="detail-title">{student.student_name}</h2>
          <p className="detail-sub">
            {student.contact ?? 'no contact recorded'}
            {p ? ` · profile ${p.completeness_score}% complete` : ''}
          </p>
        </div>
        {/* The account's standing, not the queue's. A suspended student whose
            documents are all verified is the case this exists for: the pane
            would otherwise look entirely settled. */}
        <Pill tone={ACCOUNT_TONE[student.account_status] ?? 'neutral'}>
          {humanise(student.account_status)}
        </Pill>
      </header>

      <div className="detail-body">
        {detail.loading && !detail.data && <Loading label="Loading the student" />}
        {detail.error
          ? <ErrorState error={detail.error} onRetry={detail.reload} />
          : null}

        {p && (
          <>
            {/* Claims first, then the evidence, and in that order deliberately:
                the question is whether the document supports the claim, so the
                claim has to be read first. */}
            <h3 className="detail-heading">What they have told us</h3>
            <dl className="detail-fields">
              <Claim label="Name" value={p.full_name}
                field="full_name" verified={verified} />
              <Claim label="Disability" value={p.disability_type && humanise(p.disability_type)}
                field="disability_type" verified={verified} />
              <Claim label="Percentage" value={p.disability_percent != null ? `${p.disability_percent}%` : undefined}
                field="disability_percent" verified={verified} />
              <Claim label="UDID" value={p.udid_number}
                field="udid_number" verified={verified} />
              <Claim label="Born" value={p.date_of_birth && date(p.date_of_birth)}
                field="date_of_birth" verified={verified} />
              <Claim label="Studying" value={[p.course_level && humanise(p.course_level), p.course_name].filter(Boolean).join(' · ') || undefined}
                field="course_level" verified={verified} />
              {/* institution_name, not institution_id: the value shown is what
                  the student typed, and both fields are substantiated by the
                  same bonafide certificate (migration 0036), so the badge is
                  the same either way. Naming the field the value came from is
                  what keeps it that way if they ever diverge. */}
              <Claim label="Institution" value={p.institution_name}
                field="institution_name" verified={verified} />
              <Claim label="Last marks" value={p.academic_percentage != null ? `${p.academic_percentage}%` : undefined}
                field="academic_percentage" verified={verified} />
              <Claim label="Family income" value={p.annual_family_income != null ? money(p.annual_family_income) : undefined}
                field="annual_family_income" verified={verified} />
              <Claim label="Category" value={p.social_category && humanise(p.social_category)}
                field="social_category" verified={verified} />
              <Claim label="Where" value={[p.district, p.state_code].filter(Boolean).join(', ') || undefined}
                field="state_code" verified={verified} />
            </dl>

            <h3 className="detail-heading">
              Their documents
              {docs.length > 0 && (
                <span className="faint" style={{ fontWeight: 400, textTransform: 'none' }}>
                  {' '}— {count(pending.length)} of {count(docs.length)} waiting
                </span>
              )}
            </h3>

            {docs.length === 0 ? (
              <p className="muted">They have not uploaded anything yet.</p>
            ) : (
              <>
                {/* Tabs rather than a list of previews. One document is being
                    read at a time and each preview is most of the pane, so
                    stacking them would bury the decision controls below three
                    screens of scan. */}
                <div className="tabs" role="tablist" aria-label="Their documents">
                  {docs.map(d => (
                    <button
                      key={d.document_id}
                      role="tab"
                      aria-selected={d.document_id === shown?.document_id}
                      className={d.document_id === shown?.document_id ? 'tab active' : 'tab'}
                      onClick={() => setOpenID(d.document_id)}
                    >
                      {humanise(d.doc_type)}
                      {d.verification?.status === 'VERIFIED' && (
                        <span className="tab-tick" aria-hidden="true">✓</span>
                      )}
                      {!d.verification && <span className="tab-count">waiting</span>}
                    </button>
                  ))}
                </div>

                {shown && (
                  <DocumentPane
                    key={shown.document_id}
                    doc={shown}
                    canDecide={canDecide}
                    onDone={onDone}
                    onChanged={detail.reload}
                  />
                )}
              </>
            )}

            {/* The account, last.
                Below the documents because it is a different subject: everything
                above is about what this student has proved, and this is about
                whether they may use the platform at all. Putting it beside the
                verify controls would invite closing an account by reflex while
                deciding a certificate. */}
            {canAdminister && (
              <AccountActions student={student} onDone={onDone} />
            )}
          </>
        )}
      </div>
    </>
  )
}

/* Suspending, restoring and closing a student's account.
 *
 * The same three endpoints User management uses — this is not a second way to do
 * it, it is the same act reachable from where the student is being looked at.
 * The alternative was copying a phone number out of this screen and searching
 * for it in another, which is how the wrong account gets suspended.
 *
 * Two steps for each, as everywhere else in this panel: the first names the
 * consequence and the second commits it, so nothing that signs somebody out is
 * one click from a list.
 */
function AccountActions({
  student, onDone,
}: {
  student: PendingStudent
  onDone: (message: string, tone: Tone) => void
}) {
  const [pending, setPending] = useState<'suspend' | 'reinstate' | 'remove' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = student.account_status
  const who = student.student_name

  async function confirm() {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      if (pending === 'remove') {
        await api.del(`/admin/accounts/${student.user_id}`)
        onDone(`${who}'s account is closed. Every session is gone.`, 'warn')
      } else {
        await api.patch(`/admin/accounts/${student.user_id}`, {
          status: pending === 'suspend' ? 'SUSPENDED' : 'ACTIVE',
        })
        onDone(
          pending === 'suspend'
            ? `${who} is suspended and signed out. Their documents and verifications are untouched.`
            : `${who} can sign in again.`,
          pending === 'suspend' ? 'warn' : 'ok',
        )
      }
      setPending(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const BLURB = {
    suspend: 'They are signed out and cannot sign in. Nothing they have uploaded '
      + 'or had verified is affected, and it can be undone.',
    reinstate: 'They can sign in again. Everything they had is where they left it.',
    remove: 'The account is closed and every session ends. There is no delete — '
      + 'applications and audit entries name this student and the references have '
      + 'to keep resolving.',
  } as const

  return (
    <>
      <h3 className="detail-heading">Their account</h3>

      {error && <div className="alert danger" role="alert">{error}</div>}

      {pending ? (
        <>
          <div className={`alert ${pending === 'remove' ? 'danger' : 'warn'}`}>
            <p>{BLURB[pending]}</p>
          </div>
          <div className="detail-actions">
            <button onClick={() => { setPending(null); setError(null) }} disabled={busy}>
              Cancel
            </button>
            <button
              className={pending === 'reinstate' ? 'primary' : 'danger'}
              onClick={confirm}
              disabled={busy}
            >
              {busy ? 'Saving…'
                : pending === 'suspend' ? `Suspend ${who}`
                  : pending === 'reinstate' ? `Reactivate ${who}`
                    : `Close ${who}'s account`}
            </button>
          </div>
        </>
      ) : (
        <div className="detail-actions">
          {status === 'ACTIVE' ? (
            <>
              <button onClick={() => setPending('suspend')}>Suspend</button>
              <button className="danger" onClick={() => setPending('remove')}>
                Close the account
              </button>
            </>
          ) : (
            <>
              {/* One control back, whichever way they left. Deactivation and
                  suspension are different acts and both end here, so offering
                  two buttons would ask the operator to remember which. */}
              <button className="primary" onClick={() => setPending('reinstate')}>
                {status === 'DEACTIVATED' ? 'Reopen the account' : 'Reactivate'}
              </button>
              {status === 'SUSPENDED' && (
                <button className="danger" onClick={() => setPending('remove')}>
                  Close the account
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

/* One profile field, marked when an attestation stands behind it.
 *
 * Absent values render as an em dash rather than being hidden: an operator
 * checking a certificate against a profile needs to see that the profile says
 * nothing about the income, which is different from the row not existing.
 */
function Claim({
  label, value, field, verified,
}: {
  label: string
  value?: string
  field: string
  verified: Set<string>
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {value ?? <span className="faint">—</span>}
        {value && verified.has(field) && <VerifiedBadge what={label} />}
      </dd>
    </>
  )
}

/* --- one document, previewed and decided ------------------------------------ */

function defaultValidUntil(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

function DocumentPane({
  doc, canDecide, onDone, onChanged,
}: {
  doc: VaultDocument
  canDecide: boolean
  onDone: (message: string, tone: Tone) => void
  onChanged: () => void
}) {
  const [evidence, setEvidence] = useState('')
  const [validUntil, setValidUntil] = useState(defaultValidUntil)
  const [reason, setReason] = useState('')
  const [choice, setChoice] = useState<'verify' | 'reject' | 'revoke' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* The file, fetched as soon as the tab is opened. Not behind a button and not
     in a new tab: the whole task is to look at it and then decide, so a click
     between the two is a click on every document, and a separate window puts the
     evidence and the form recording the decision in different places. */
  const file = useQuery<{ url: string }>(
    signal => api.get(`/documents/${doc.document_id}/download`,
      { purpose: 'verification' }, signal),
    [doc.document_id],
  )

  const isImage = doc.mime_type.startsWith('image/')
  const isPDF = doc.mime_type === 'application/pdf'
  const v = doc.verification

  async function decide(approve: boolean) {
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/verifications', {
        document_id: doc.document_id,
        approve,
        evidence_considered: evidence,
        valid_until: validUntil,
        rejection_reason: approve ? undefined : reason,
      })
      onDone(
        approve
          ? `${humanise(doc.doc_type)} verified. Their profile now counts it as confirmed.`
          : `${humanise(doc.doc_type)} refused. They have been told why and can upload another.`,
        approve ? 'ok' : 'warn',
      )
      setChoice(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The decision could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!v) return
    setBusy(true)
    setError(null)
    try {
      await api.del(`/admin/verifications/${v.verification_id}`, { reason })
      onDone(
        `Verification withdrawn. Their profile no longer counts ${humanise(doc.doc_type).toLowerCase()} as confirmed.`,
        'warn',
      )
      setChoice(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be withdrawn.')
    } finally {
      setBusy(false)
    }
  }

  const evidenceReady = evidence.trim().length >= 10
  const ready = choice === 'verify' ? evidenceReady && !!validUntil
    : choice === 'reject' ? evidenceReady && reason.trim().length > 0
      : reason.trim().length >= 5

  return (
    <>
      <div className="doc-preview">
        {file.loading && !file.data && <Loading label="Loading the document" />}
        {file.error ? <ErrorState error={file.error} onRetry={file.reload} /> : null}

        {file.data && isImage && (
          /* alt says what the image IS, not what it shows: nobody can caption an
             unread certificate, and this is the honest description. */
          <img src={file.data.url} alt={`${humanise(doc.doc_type)}, as uploaded`} />
        )}
        {file.data && isPDF && (
          /* An iframe rather than <embed>: it takes a title, which is the only
             way a screen-reader user learns what the frame holds. */
          <iframe src={file.data.url} title={`${humanise(doc.doc_type)}, as uploaded`} />
        )}
        {file.data && !isImage && !isPDF && (
          <p className="muted">
            This is a {doc.mime_type} file, which cannot be shown here.{' '}
            <a href={file.data.url} target="_blank" rel="noopener noreferrer">
              Open it in a new tab
            </a>.
          </p>
        )}
      </div>

      <p className="faint" style={{ fontSize: 11, margin: '0 0 0.5rem' }}>
        {doc.original_name} · {Math.round(doc.size_bytes / 1024)} KB ·
        {' '}uploaded {date(doc.uploaded_at)}
      </p>

      {error && <div className="alert danger" role="alert">{error}</div>}

      {/* Already decided. Shown rather than hidden, because an operator opening
          a verified document wants to know who said so and on what evidence —
          that is the reuse the shared vault exists for. */}
      {v && v.status === 'VERIFIED' && (
        <div className="alert ok" role="note">
          <p>
            <VerifiedBadge /> on {date(v.issued_at)}
            {v.verified_by_organisation ? ` by ${v.verified_by_organisation}` : ' by the platform'},
            valid until {date(v.valid_until)}.
          </p>
          <blockquote className="review-note"><p>{v.evidence_considered}</p></blockquote>
        </div>
      )}
      {v && v.status === 'REJECTED' && (
        <div className="alert warn" role="note">
          <p><strong>Refused</strong> on {date(v.issued_at)}.</p>
          {v.rejection_reason && (
            <blockquote className="review-note"><p>{v.rejection_reason}</p></blockquote>
          )}
        </div>
      )}

      {!canDecide ? (
        <p className="muted">
          You can read this but not decide it. Verifying a document changes how
          every scheme sees the student.
        </p>
      ) : choice === null ? (
        <div className="detail-actions">
          {!v ? (
            <>
              <button className="primary" onClick={() => setChoice('verify')}>Verify</button>
              <button className="danger" onClick={() => setChoice('reject')}>Refuse</button>
            </>
          ) : v.status === 'VERIFIED' ? (
            <button className="danger" onClick={() => setChoice('revoke')}>
              Withdraw this verification
            </button>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              Refused. The student can upload a replacement, which arrives here as
              a new document.
            </span>
          )}
        </div>
      ) : (
        <div className="decide">
          <h3>
            {choice === 'verify' ? 'Verify this document'
              : choice === 'reject' ? 'Refuse this document'
                : 'Withdraw this verification'}
          </h3>

          {choice !== 'revoke' && (
            <Field
              label="What did you check?"
              hint="Named so another organisation can decide whether to check it again, which is what makes one attestation serve every scheme. At least ten characters."
              required
            >
              {props => (
                <textarea
                  {...props}
                  rows={3}
                  value={evidence}
                  onChange={e => setEvidence(e.target.value)}
                  maxLength={2000}
                  placeholder="e.g. UDID matches the profile; issuing authority and seal legible; percentage reads 83%, as claimed."
                  autoFocus
                />
              )}
            </Field>
          )}

          {choice === 'verify' && (
            <Field
              label="Valid until"
              hint="Mandatory. A certificate that never expires is a fraud vector; use the document's own validity where it states one."
              required
            >
              {props => (
                <input {...props} type="date" value={validUntil}
                  onChange={e => setValidUntil(e.target.value)} />
              )}
            </Field>
          )}

          {choice !== 'verify' && (
            <Field
              label={choice === 'reject' ? 'Why not?' : 'Why is it being withdrawn?'}
              hint={choice === 'reject'
                ? 'Shown to the student word for word. It is the only thing telling them what to fix, so name the problem.'
                : 'Recorded against the attestation. Schemes may have relied on it, so the record says why it no longer stands.'}
              required
            >
              {props => (
                <textarea
                  {...props}
                  rows={3}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  maxLength={1000}
                  autoFocus={choice === 'revoke'}
                  placeholder={choice === 'reject'
                    ? 'e.g. The percentage is not legible in this scan. Please upload a clearer photograph of the same certificate.'
                    : 'e.g. The issuing authority has since withdrawn this certificate.'}
                />
              )}
            </Field>
          )}

          <div className="detail-actions">
            <button
              className={choice === 'verify' ? 'primary' : 'danger'}
              disabled={busy || !ready}
              onClick={() => (choice === 'revoke' ? revoke() : decide(choice === 'verify'))}
            >
              {busy ? 'Recording…'
                : choice === 'verify' ? 'Verify'
                  : choice === 'reject' ? 'Refuse and tell them why'
                    : 'Withdraw'}
            </button>
            <button onClick={() => { setChoice(null); setError(null) }} disabled={busy}>
              Cancel
            </button>
            {!ready && (
              <span className="muted" style={{ fontSize: 12 }}>
                {choice !== 'revoke' && !evidenceReady
                  ? 'Say what you checked.'
                  : choice === 'verify' ? 'Set an expiry.' : 'Give a reason.'}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
