import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { count, humanise } from '../lib/format'
import { Dialog, ErrorState, Field, Loading, Pill } from '../components/ui'
import { useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import type { NotificationTemplate } from '../lib/types'

/* The words the platform sends.
 *
 * Every message a student receives is rendered from one of these rows. Until
 * now they could only be changed by running SQL against production, which in
 * practice meant they were never changed — a phrase that reads badly through a
 * screen reader, or a Hindi translation that came back wrong, stayed wrong for
 * as long as the platform ran.
 *
 * The screen is built around the one hazard that matters. A template renders
 * with a fixed set of variables the sending code supplies; typing {{amount}}
 * into a message rendered without one produces a message with a hole in it,
 * delivered to a real person. So the placeholders a template may use are listed
 * beside the box, insertable with one click, and a save that introduces an
 * unfillable one is refused by the API with the offending name in the message.
 *
 * Hindi sits beside English rather than behind a tab. The platform launches in
 * both, the report treats neither as the translation of the other, and a
 * language you have to go looking for is the one that silently rots.
 */

export default function Messages() {
  const { can } = useAuth()
  const announce = useAnnounce()
  const [editing, setEditing] = useState<NotificationTemplate | null>(null)

  const query = useQuery<NotificationTemplate[]>(
    signal => api.get('/admin/templates', undefined, signal),
    [],
  )

  // A template edit reaches every student the next time anything is sent, so
  // it is the super admin's alone.
  const canEdit = can('PLATFORM_SUPER_ADMIN')

  if (query.loading && !query.data) return <Loading label="Loading messages" />
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p>
            The wording of every notification the platform sends, in English and
            Hindi. Changes take effect on the next message sent — there is no
            deploy and no review step, so read it twice.
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="alert warn" role="status">
          Your role can read these but not change them. Editing wording that
          reaches every student is the platform administrator's decision.
        </div>
      )}

      <div className="stack">
        {(query.data ?? []).map(t => (
          <div className="card" key={t.template_key}>
            <header>
              <h2>{humanise(t.template_key)}</h2>
              <div className="row">
                <Pill tone="neutral">{t.channel === 'IN_APP' ? 'In app' : t.channel}</Pill>
                {!t.is_active && <Pill tone="warn">Not sending</Pill>}
                {!t.used && (
                  // A row nothing sends is not worth an operator's time, and
                  // saying so is kinder than letting them edit it and wonder
                  // why nothing changed.
                  <Pill tone="warn">Nothing sends this</Pill>
                )}
                <span className="muted" style={{ fontSize: 12 }}>
                  {count(t.sent_count)} sent
                </span>
                {canEdit && (
                  <button className="sm" onClick={() => setEditing(t)}>
                    Edit<span className="sr-only"> {humanise(t.template_key)}</span>
                  </button>
                )}
              </div>
            </header>

            <div style={{ padding: '0.75rem' }}>
              {t.subject_en && <p className="msg-subject">{t.subject_en}</p>}
              <p className="msg-body">{t.body_en}</p>

              {t.body_hi ? (
                <>
                  {t.subject_hi && <p className="msg-subject" lang="hi">{t.subject_hi}</p>}
                  <p className="msg-body" lang="hi">{t.body_hi}</p>
                </>
              ) : (
                <p className="faint" style={{ fontSize: 12, margin: '0.5rem 0 0' }}>
                  No Hindi version — students reading in Hindi get the English one.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Keyed and mounted only while open, so each template's fields are
          initialised from the template itself rather than copied in by an
          effect. Reopening a dialog still showing the last one's draft is a
          way to overwrite a change nobody saw. */}
      {editing && (
        <EditDialog
          key={editing.template_key}
          template={editing}
          onClose={() => setEditing(null)}
          onDone={message => {
            setEditing(null)
            announce(message)
            query.reload()
          }}
        />
      )}
    </>
  )
}

function EditDialog({
  template, onClose, onDone,
}: {
  template: NotificationTemplate
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [subjectEN, setSubjectEN] = useState(template.subject_en ?? '')
  const [subjectHI, setSubjectHI] = useState(template.subject_hi ?? '')
  const [bodyEN, setBodyEN] = useState(template.body_en)
  const [bodyHI, setBodyHI] = useState(template.body_hi ?? '')
  const [active, setActive] = useState(template.is_active)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    setFieldError(null)

    try {
      await api.request(`/admin/templates/${template.template_key}`, {
        method: 'PUT',
        body: {
          subject_en: subjectEN, subject_hi: subjectHI,
          body_en: bodyEN, body_hi: bodyHI, is_active: active,
        },
      })
      onDone(`${humanise(template.template_key)} saved. It applies to the next message sent.`)
    } catch (err) {
      // The placeholder check comes back as a field error naming the variable,
      // which belongs next to the box rather than in a banner above it.
      const fields = (err as { fields?: Record<string, string> })?.fields
      if (fields?.body_en) setFieldError(fields.body_en)
      else setError(err instanceof Error ? err.message : 'The change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  /** Appends a placeholder to the English body, where the cursor usually is. */
  function insert(v: string) {
    setBodyEN(b => `${b}{{${v}}}`)
  }

  return (
    <Dialog
      open
      title={humanise(template.template_key)}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy || bodyEN.trim().length < 10}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      {!!template.variables.length && (
        <div className="placeholders">
          <span className="muted" style={{ fontSize: 12 }}>Available:</span>
          {template.variables.map(v => (
            <button key={v} type="button" className="subtle sm mono" onClick={() => insert(v)}>
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}

      {template.channel !== 'SMS' && (
        <Field label="Subject (English)">
          {props => (
            <input {...props} value={subjectEN} onChange={e => setSubjectEN(e.target.value)} />
          )}
        </Field>
      )}

      <Field label="Message (English)" required error={fieldError ?? undefined}>
        {props => (
          <textarea
            {...props}
            rows={4}
            value={bodyEN}
            onChange={e => setBodyEN(e.target.value)}
          />
        )}
      </Field>

      {template.channel !== 'SMS' && (
        <Field label="Subject (Hindi)">
          {props => (
            <input
              {...props}
              lang="hi"
              value={subjectHI}
              onChange={e => setSubjectHI(e.target.value)}
            />
          )}
        </Field>
      )}

      <Field
        label="Message (Hindi)"
        hint="Left blank, a student reading in Hindi receives the English text."
      >
        {props => (
          <textarea
            {...props}
            lang="hi"
            rows={4}
            value={bodyHI}
            onChange={e => setBodyHI(e.target.value)}
          />
        )}
      </Field>

      <Field label="Send this message">
        {props => (
          <div className="row">
            <input
              {...props}
              type="checkbox"
              style={{ width: 'auto', minHeight: 0 }}
              checked={active}
              onChange={e => setActive(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Turning this off stops the message entirely. The event still
              happens and is still logged; the student simply is not told.
            </span>
          </div>
        )}
      </Field>
    </Dialog>
  )
}
