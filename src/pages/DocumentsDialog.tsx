/* Reviewing one student's documents.
 *
 * The act at the centre of this screen is an attestation: an operator says "I
 * looked at this certificate and it is what it claims to be", and every
 * organisation on the platform afterwards relies on that instead of asking the
 * student again. Section 9.2 treats it as the vault's whole value and its main
 * risk, and three things follow that shape this dialog:
 *
 *   Evidence is mandatory. IssueVerificationInput requires at least ten
 *   characters of it, because an attestation nobody can inspect is not reusable
 *   — a provider deciding whether to re-verify needs to know what was already
 *   checked. It is a text box, not a checkbox.
 *
 *   An approval expires. A certificate that never lapses is a fraud vector, so
 *   valid_until is required and there is no "forever".
 *
 *   A rejection is recorded, not discarded. It is as much a part of the
 *   history as an approval, and it is what tells the student to upload the
 *   document again — so the reason is written for them to read, not for an
 *   internal log.
 */

import { useState } from 'react'

import * as api from '../lib/api'
import { Dialog, ErrorState, Loading } from '../components/ui'
import { useQuery } from '../lib/hooks'
import { date, humanise } from '../lib/format'

/* The vault's shape, as this console needs it. Declared here rather than in
 * types.ts because the student portal owns this contract and the admin reads
 * only the parts it acts on. */
interface Verification {
  status: string
  valid_until: string
  is_live: boolean
}

interface Document {
  document_id: string
  doc_type: string
  original_name: string
  size_bytes: number
  uploaded_at: string
  verification?: Verification
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* A year from today.
 *
 * Offered rather than imposed: most attestations are re-checked annually, and
 * an operator who knows the certificate's own expiry should type that instead.
 * Nothing here defaults to "no expiry", because that is the case the rule
 * exists to prevent. */
function inAYear(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export function DocumentsDialog({
  profileID, who, onClose, onDone,
}: {
  profileID: string
  who: string
  onClose: () => void
  onDone: (message: string, tone?: 'ok' | 'warn') => void
}) {
  const query = useQuery<Document[]>(
    signal => api.get(`/org/profiles/${profileID}/documents`, undefined, signal),
    [profileID],
  )
  const docs = query.data ?? []

  return (
    <Dialog
      open
      wide
      title={`Documents — ${who}`}
      onClose={onClose}
      footer={<button onClick={onClose}>Close</button>}
    >
      {query.loading && !query.data && <Loading />}
      {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

      {query.data && docs.length === 0 && (
        <p className="muted">This student has not uploaded anything yet.</p>
      )}

      {docs.map(doc => (
        <DocumentRow
          key={doc.document_id}
          doc={doc}
          onDone={(m, t) => { onDone(m, t); query.reload() }}
        />
      ))}
    </Dialog>
  )
}

function DocumentRow({ doc, onDone }: {
  doc: Document
  onDone: (message: string, tone?: 'ok' | 'warn') => void
}) {
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null)
  const [evidence, setEvidence] = useState('')
  const [validUntil, setValidUntil] = useState(inAYear())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const v = doc.verification
  const live = v?.is_live && v.status === 'VERIFIED'

  async function look() {
    try {
      // The payload is never served from here. A signed URL, minted per look
      // and expiring in minutes, is the only way anything reaches the bucket —
      // and every one of these is written to the access log the student can
      // read, which is the point: they are entitled to know who opened their
      // certificate.
      const res = await api.get<{ url: string }>(
        `/documents/${doc.document_id}/download`, { purpose: 'verification' })
      /* A new tab, and here that is the right shape: this is a dialog over a
         user list, not a review pane, so there is nowhere to put a preview
         without the dialog becoming the Verifications screen. That screen
         renders the document in place; this one is the route for looking a
         specific person up.
         The tab now SHOWS the file rather than downloading it — the service
         used to attach a filename for every purpose except the literal "view",
         so this call, whose entire job is to look at the document, saved it to
         disk instead. */
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('That document could not be opened.')
    }
  }

  async function submit(approve: boolean) {
    setBusy(true)
    setError(null)
    try {
      await api.post('/org/verifications', {
        document_id: doc.document_id,
        approve,
        evidence_considered: evidence,
        valid_until: validUntil,
        rejection_reason: approve ? undefined : reason,
      })
      setOpen(null)
      setEvidence('')
      setReason('')
      onDone(
        approve
          ? `${humanise(doc.doc_type)} is verified until ${date(validUntil)}.`
          // Said as the student will experience it. The rejection is what asks
          // them for a new upload, so the operator should know that is what
          // they have just done.
          : `${humanise(doc.doc_type)} is rejected. The student has been asked to upload it again.`,
        approve ? 'ok' : 'warn',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const ready = evidence.trim().length >= 10 && !!validUntil
  const rejectReady = ready && reason.trim().length > 0

  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{humanise(doc.doc_type)}</strong>
          <div className="muted">
            {doc.original_name} · {megabytes(doc.size_bytes)}
          </div>
        </div>
        <span className={`pill ${live ? 'ok' : v?.status === 'REJECTED' ? 'danger' : ''}`}>
          {live ? `Verified until ${date(v!.valid_until)}`
            : v?.status === 'REJECTED' ? 'Rejected'
              : 'Waiting'}
        </span>
      </div>

      {error && <div className="alert danger" role="alert">{error}</div>}

      <div className="row" style={{ marginTop: '0.5rem' }}>
        <button className="sm" onClick={look}>Open the document</button>
        {!live && (
          <>
            <button className="sm" onClick={() => setOpen(open === 'approve' ? null : 'approve')}>
              Verify
            </button>
            <button className="sm danger" onClick={() => setOpen(open === 'reject' ? null : 'reject')}>
              Reject
            </button>
          </>
        )}
      </div>

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          <label className="field">
            <span>What did you check? (required)</span>
            <textarea
              value={evidence}
              onChange={e => setEvidence(e.target.value)}
              rows={2}
              placeholder="e.g. UDID number matches the national register; name and percentage match the profile"
            />
            <span className="hint">
              At least ten characters. Another organisation reads this to decide
              whether to check it again, so write what you actually looked at.
            </span>
          </label>

          <label className="field">
            <span>Valid until (required)</span>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
            <span className="hint">
              An attestation that never expires is a fraud vector. Use the
              certificate's own expiry where it has one.
            </span>
          </label>

          {open === 'reject' && (
            <label className="field">
              <span>Why is it rejected? (required)</span>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. The photograph is too blurred to read the UDID number. Please upload a clearer scan."
              />
              <span className="hint">
                The student reads this. It is what tells them what to upload
                instead, so write it to them rather than about them.
              </span>
            </label>
          )}

          <div className="row">
            <button onClick={() => setOpen(null)} disabled={busy}>Cancel</button>
            <button
              className={open === 'reject' ? 'danger' : 'primary'}
              disabled={busy || (open === 'reject' ? !rejectReady : !ready)}
              onClick={() => submit(open === 'approve')}
            >
              {busy ? 'Saving…' : open === 'approve' ? 'Verify this document' : 'Reject and ask again'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
