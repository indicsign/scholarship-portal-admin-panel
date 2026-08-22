import { useState } from 'react'

import * as api from '../lib/api'
import { date } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pill } from '../components/ui'
import { useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import type { Slide, SlideState } from '../lib/types'

/* The announcements on the landing page.
 *
 * The public site's copy is otherwise compiled into the frontend, which means
 * anything time-bound could not be said at all: that post-matric applications
 * close on the 30th, that a UDID camp is running in Patna on Saturday, that the
 * helpline is shut over Diwali. None of that survives a release cycle, so in
 * practice it was said on somebody's personal WhatsApp instead, where it reached
 * nobody who needed it.
 *
 * All three platform roles can write here — super admin, support staff and the
 * compliance officer — which is wider than the message templates next door, and
 * deliberately so. A template edit reaches every student the platform ever
 * writes to and cannot be recalled once sent; a slide is wrong on one page for
 * as long as it takes somebody to notice, and is fixed by editing it back. What
 * sets the bar is the cost of a mistake, not the seniority of the screen.
 *
 * ---------------------------------------------------------------------------
 * The two controls that are not the same control
 * ---------------------------------------------------------------------------
 *
 * "Published" is whether this is finished. The dates are when it applies. They
 * are separate because the failure mode is the same one every notice board has:
 * an announcement about Saturday, published on Tuesday, still on the site the
 * following month because nobody came back to switch it off. A public page
 * telling students about an event that already happened is worse than one that
 * says nothing — it is the platform proving nobody is looking after it. So the
 * end date does the switching off, and the list says plainly which slides are
 * actually on the site rather than only which are ticked.
 */

export default function Slides() {
  const announce = useAnnounce()
  const [editing, setEditing] = useState<Slide | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Slide | null>(null)

  const query = useQuery<Slide[]>(
    signal => api.get('/admin/slides', undefined, signal),
    [],
  )

  const slides = query.data ?? []
  const liveCount = slides.filter(s => s.live).length

  if (query.loading && !query.data) return <Loading label="Loading slides" />
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Slides</h1>
          <p>
            The rotating band on the public landing page. Changes appear within a
            minute — there is no deploy and no review step, so read it twice.{' '}
            {liveCount === 0
              ? 'None of these is showing; the band is running on its built-in lead panel alone.'
              : `${liveCount} showing on the site now, after the built-in lead panel.`}
          </p>
        </div>
        <button className="primary" onClick={() => setEditing('new')}>New slide</button>
      </div>

      {slides.length === 0 ? (
        <Empty
          title="No slides yet"
          hint="The landing page still shows the band, on the lead panel that is compiled into the site — the proposition, which does not expire. Anything published here rotates behind it."
        />
      ) : (
        <div className="stack">
          {slides.map(s => (
            <div className="card" key={s.slide_id}>
              <header>
                <h2>{s.headline_en}</h2>
                <div className="row">
                  <StateOfSlide slide={s} />
                  <span className="muted" style={{ fontSize: 12 }}>Order {s.position}</span>
                  <button className="sm" onClick={() => setEditing(s)}>
                    Edit<span className="sr-only"> {s.headline_en}</span>
                  </button>
                  <button className="sm danger" onClick={() => setDeleting(s)}>
                    Delete<span className="sr-only"> {s.headline_en}</span>
                  </button>
                </div>
              </header>

              <div style={{ padding: '0.75rem' }}>
                {s.image_url && (
                  // The operator's own check that the right picture is on the
                  // right slide, and that its description matches it. Shown at
                  // the size the panel can spare rather than the size it will
                  // be on the site — this is an inventory, not a preview.
                  <figure className="slide-thumb">
                    <img
                      src={s.image_url}
                      alt={s.image_alt_en ?? ''}
                      width={s.image_width}
                      height={s.image_height}
                    />
                    <figcaption className="faint">{s.image_alt_en}</figcaption>
                  </figure>
                )}

                {s.body_en && <p className="msg-body">{s.body_en}</p>}

                {s.headline_hi ? (
                  <>
                    <p className="msg-subject" lang="hi">{s.headline_hi}</p>
                    {s.body_hi && <p className="msg-body" lang="hi">{s.body_hi}</p>}
                  </>
                ) : (
                  <p className="faint" style={{ fontSize: 12, margin: '0.5rem 0 0' }}>
                    No Hindi version — students reading in Hindi see the English text.
                  </p>
                )}

                {s.link_url && (
                  <p className="muted" style={{ fontSize: 12, margin: '0.5rem 0 0' }}>
                    Button: <strong>{s.link_label_en}</strong> → <span className="mono">{s.link_url}</span>
                  </p>
                )}

                {s.video_url && (
                  <p className="muted" style={{ fontSize: 12, margin: '0.5rem 0 0' }}>
                    Video: <span className="mono">{s.video_url}</span>
                  </p>
                )}

                <p className="faint" style={{ fontSize: 12, margin: '0.5rem 0 0' }}>
                  {s.live_from ? `Shows from ${date(s.live_from)}. ` : ''}
                  {s.live_until ? `Stops on ${date(s.live_until)}.` : 'No end date.'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Keyed and mounted only while open, so the fields are initialised from
          the slide itself rather than copied in by an effect. A dialog reopened
          still holding the last one's draft is a way to overwrite a change
          nobody saw. */}
      {editing && (
        <EditDialog
          key={editing === 'new' ? 'new' : editing.slide_id}
          slide={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={message => {
            setEditing(null)
            announce(message)
            query.reload()
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          slide={deleting}
          onClose={() => setDeleting(null)}
          onDone={message => {
            setDeleting(null)
            announce(message)
            query.reload()
          }}
        />
      )}
    </>
  )
}

/* What the operator actually needs to know, which "published" does not say: a
 * ticked slide whose end date has passed is not on the site, and a list of green
 * pills would give no clue why the landing page looks empty.
 *
 * The four states come from the API, computed against the database's clock. The
 * panel deliberately does no date arithmetic of its own — a browser in another
 * timezone would otherwise draw a different conclusion from the same row. */
const SLIDE_STATE: Record<SlideState, { tone: 'ok' | 'warn' | 'neutral' | 'accent'; label: string }> = {
  LIVE: { tone: 'ok', label: 'On the site' },
  DRAFT: { tone: 'warn', label: 'Draft' },
  SCHEDULED: { tone: 'accent', label: 'Scheduled' },
  FINISHED: { tone: 'neutral', label: 'Finished' },
}

function StateOfSlide({ slide }: { slide: Slide }) {
  const meta = SLIDE_STATE[slide.state] ?? SLIDE_STATE.DRAFT
  return <Pill tone={meta.tone}>{meta.label}</Pill>
}

/** A date column as the date input wants it, or blank. */
function asDateInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  // Local rather than toISOString: the column holds the start of a day in the
  // server's zone, and a UTC conversion would show an operator in Delhi the day
  // before the one they typed.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function EditDialog({
  slide, onClose, onDone,
}: {
  slide: Slide | null
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [headlineEN, setHeadlineEN] = useState(slide?.headline_en ?? '')
  const [headlineHI, setHeadlineHI] = useState(slide?.headline_hi ?? '')
  const [bodyEN, setBodyEN] = useState(slide?.body_en ?? '')
  const [bodyHI, setBodyHI] = useState(slide?.body_hi ?? '')
  const [linkURL, setLinkURL] = useState(slide?.link_url ?? '')
  const [labelEN, setLabelEN] = useState(slide?.link_label_en ?? '')
  const [labelHI, setLabelHI] = useState(slide?.link_label_hi ?? '')
  const [altEN, setAltEN] = useState(slide?.image_alt_en ?? '')
  const [altHI, setAltHI] = useState(slide?.image_alt_hi ?? '')
  const [videoURL, setVideoURL] = useState(slide?.video_url ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [imageURL, setImageURL] = useState(slide?.image_url ?? '')
  const [position, setPosition] = useState(String(slide?.position ?? 0))
  const [published, setPublished] = useState(slide?.is_published ?? false)
  const [from, setFrom] = useState(asDateInput(slide?.live_from))
  const [until, setUntil] = useState(asDateInput(slide?.live_until))

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  async function save() {
    setBusy(true)
    setError(null)
    setFields({})

    const body = {
      headline_en: headlineEN.trim(),
      headline_hi: headlineHI.trim(),
      body_en: bodyEN.trim(),
      body_hi: bodyHI.trim(),
      link_url: linkURL.trim(),
      link_label_en: labelEN.trim(),
      link_label_hi: labelHI.trim(),
      image_alt_en: altEN.trim(),
      image_alt_hi: altHI.trim(),
      video_url: videoURL.trim(),
      position: Number(position) || 0,
      is_published: published,
      live_from: from,
      live_until: until,
    }

    // A picture with nothing said about it is refused here rather than by the
    // API, so the operator is told before the words are saved and the file is
    // sent.
    if (file && !altEN.trim()) {
      setFields({ image_alt_en: 'Say what the picture shows, for anyone who cannot see it.' })
      setBusy(false)
      return
    }

    try {
      /* The words first, then the file.
       *
       * A new slide has no address to upload against until it exists, so the
       * order is forced for a create and kept for an edit — one path, and the
       * failure modes are the same either way. If the upload fails the slide is
       * still saved, and the message says so rather than implying the whole
       * thing was lost. */
      let id = slide?.slide_id
      if (id) {
        await api.request(`/admin/slides/${id}`, { method: 'PATCH', body })
      } else {
        const created = await api.post<Slide>('/admin/slides', body)
        id = created.data.slide_id
      }

      if (file && id) {
        const form = new FormData()
        form.append('file', file)
        form.append('image_alt_en', altEN.trim())
        form.append('image_alt_hi', altHI.trim())
        await api.upload(`/admin/slides/${id}/image`, form)
      }

      onDone(
        published
          ? `“${body.headline_en}” saved. It is on the landing page within a minute.`
          : `“${body.headline_en}” saved as a draft. Nothing is showing on the site.`,
      )
    } catch (err) {
      // The API returns a field-keyed error for the link pair and the dates,
      // and each belongs next to the box that caused it rather than in a banner.
      const returned = (err as { fields?: Record<string, string> })?.fields
      if (returned) setFields(returned)
      else setError(err instanceof Error ? err.message : 'The slide could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={slide ? 'Edit slide' : 'New slide'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="primary"
            onClick={save}
            disabled={busy || headlineEN.trim().length < 3}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      <Field label="Headline (English)" required error={fields.headline_en}>
        {props => (
          <input {...props} value={headlineEN} onChange={e => setHeadlineEN(e.target.value)} />
        )}
      </Field>

      <Field label="Headline (Hindi)" error={fields.headline_hi}>
        {props => (
          <input {...props} lang="hi" value={headlineHI} onChange={e => setHeadlineHI(e.target.value)} />
        )}
      </Field>

      <Field
        label="Text (English)"
        hint="One or two sentences. The band is read at a glance on a phone."
        error={fields.body_en}
      >
        {props => (
          <textarea {...props} rows={3} value={bodyEN} onChange={e => setBodyEN(e.target.value)} />
        )}
      </Field>

      <Field
        label="Text (Hindi)"
        hint="Left blank, a student reading in Hindi sees the English text."
        error={fields.body_hi}
      >
        {props => (
          <textarea {...props} lang="hi" rows={3} value={bodyHI} onChange={e => setBodyHI(e.target.value)} />
        )}
      </Field>

      {/* The picture, its description, and the video link. Grouped, because
          they are one decision: what this slide shows. */}
      {imageURL && (
        <div className="slide-thumb">
          <img src={imageURL} alt={altEN} />
          <p>
            <button
              type="button"
              className="sm danger"
              disabled={busy || !slide}
              onClick={async () => {
                if (!slide) return
                setBusy(true)
                try {
                  await api.del(`/admin/slides/${slide.slide_id}/image`)
                  setImageURL('')
                  setAltEN('')
                  setAltHI('')
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'The picture could not be removed.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Remove picture
            </button>
          </p>
        </div>
      )}

      <Field
        label={imageURL ? 'Replace the picture' : 'Picture'}
        hint="A JPG or a PNG, up to 500 KB. It is shown at the full width of the band, so a wide picture works better than a tall one."
        error={fields.file}
      >
        {props => (
          <input
            {...props}
            type="file"
            accept="image/jpeg,image/png"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
        )}
      </Field>

      {(file || imageURL) && (
        <>
          <Field
            label="Describe the picture (English)"
            required
            hint="What somebody would miss if they could not see it. Not the caption — that is the text above."
            error={fields.image_alt_en}
          >
            {props => (
              <input {...props} value={altEN} onChange={e => setAltEN(e.target.value)} />
            )}
          </Field>

          <Field label="Describe the picture (Hindi)" error={fields.image_alt_hi}>
            {props => (
              <input {...props} lang="hi" value={altHI} onChange={e => setAltHI(e.target.value)} />
            )}
          </Field>
        </>
      )}

      <Field
        label="Video link"
        hint="A full https:// address. The platform hosts no video — this opens the page it is on."
        error={fields.video_url}
      >
        {props => (
          <input {...props} value={videoURL} onChange={e => setVideoURL(e.target.value)} placeholder="https://" />
        )}
      </Field>

      <div className="grid cols-2">
        <Field
          label="Button goes to"
          hint="A path on this site, like /check, or a full https:// address."
          error={fields.link_url}
        >
          {props => (
            <input {...props} value={linkURL} onChange={e => setLinkURL(e.target.value)} placeholder="/check" />
          )}
        </Field>

        <Field label="Button label (English)" error={fields.link_label_en}>
          {props => (
            <input {...props} value={labelEN} onChange={e => setLabelEN(e.target.value)} />
          )}
        </Field>
      </div>

      <Field label="Button label (Hindi)" error={fields.link_label_hi}>
        {props => (
          <input {...props} lang="hi" value={labelHI} onChange={e => setLabelHI(e.target.value)} />
        )}
      </Field>

      <div className="grid cols-2">
        <Field
          label="Shows from"
          hint="Leave blank to start as soon as it is published."
          error={fields.live_from}
        >
          {props => (
            <input {...props} type="date" value={from} onChange={e => setFrom(e.target.value)} />
          )}
        </Field>

        <Field
          label="Stops on"
          hint="Gone at the start of this day. Leave blank to keep showing until somebody removes it."
          error={fields.live_until}
        >
          {props => (
            <input {...props} type="date" value={until} onChange={e => setUntil(e.target.value)} />
          )}
        </Field>
      </div>

      <Field
        label="Order"
        hint="Lowest first. Two slides sharing a number fall back to whichever was written first."
        error={fields.position}
      >
        {props => (
          <input
            {...props}
            type="number"
            min={0}
            max={999}
            value={position}
            onChange={e => setPosition(e.target.value)}
          />
        )}
      </Field>

      <Field label="Publish this slide">
        {props => (
          <div className="row">
            <input
              {...props}
              type="checkbox"
              style={{ width: 'auto', minHeight: 0 }}
              checked={published}
              onChange={e => setPublished(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Off, it stays here as a draft and the public site never sees it. On,
              it appears within a minute — and stops on its end date without
              anybody coming back for it.
            </span>
          </div>
        )}
      </Field>
    </Dialog>
  )
}

/* Deleting asks first, and says what it costs.
 *
 * Not because the row is gone — it is kept, so that a grievance six months from
 * now about what the site said is still answerable — but because the operator's
 * mental model is that Delete is final, and the honest thing is to confirm at
 * the strength they expect. */
function DeleteDialog({
  slide, onClose, onDone,
}: {
  slide: Slide
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await api.del(`/admin/slides/${slide.slide_id}`)
      onDone(`“${slide.headline_en}” removed from the landing page.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The slide could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Delete this slide?"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary danger" onClick={remove} disabled={busy}>
            {busy ? 'Removing…' : 'Delete'}
          </button>
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      <p><strong>{slide.headline_en}</strong></p>
      <p className="muted" style={{ fontSize: 13 }}>
        {slide.live
          ? 'It is on the landing page now and will be gone within a minute.'
          : 'It is not showing on the site.'}{' '}
        The wording is kept in the record, so a question later about what the site
        said can still be answered — but it cannot be brought back from this
        screen.
      </p>
    </Dialog>
  )
}
