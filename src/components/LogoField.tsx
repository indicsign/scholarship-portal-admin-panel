import { useEffect, useRef, useState } from 'react'

import * as api from '../lib/api'
import { errorDetail } from '../lib/api'
import { useAuthedImage } from '../lib/hooks'
import { Field } from './ui'

/* A sponsor's mark: upload it, replace it, describe it, take it off.
 *
 * One component for organisations and for curated listings, because the two
 * differ only in which address the file is posted to — and the panel should not
 * grow two upload widgets that drift apart in what they refuse.
 *
 * There is no separate "replace". Choosing a new file when one is already set
 * posts to the same endpoint, and the server swaps the row over and deletes what
 * it replaced. A caller that had to know which of the two it was doing would
 * only be able to get it wrong.
 *
 * --- the two modes ---------------------------------------------------------
 *
 * LIVE, for a row that exists: the file is posted the moment it is chosen, and
 * the preview is the served URL rather than a local copy of the file. That is
 * deliberate — what is on screen afterwards is what the server actually stored
 * and will show a student, not an optimistic render of what the browser was
 * handed. `v` busts the cache, because the response carries a week-long
 * max-age and a replaced logo would otherwise keep showing the old picture
 * until the operator cleared their cache and concluded nothing had worked.
 *
 * STAGED, for the New listing form: there is no row yet, so there is no address
 * to post to. The file is held by the caller and sent once the listing has been
 * created and has an id. The preview is a local object URL — the only honest
 * option, since the server has never seen the file.
 *
 * The mode is chosen by which callback is passed, so a caller cannot ask for
 * both and get an upload it did not expect.
 */

interface Common {
  alt?: string
  /* What the server will use if the box is left empty — the sponsor's name.
     Shown as the placeholder so the default is visible rather than folklore. */
  defaultAlt?: string
  disabled?: boolean
}

interface LiveProps extends Common {
  /** Where the file is posted and deleted, e.g. /admin/scholarships/{id}/logo */
  endpoint: string
  /** Where it is served from, e.g. /public/scholarships/{id}/logo */
  publicPath: string
  hasLogo: boolean
  /* Called after a successful upload or removal, with whether a logo is
     present afterwards. The argument is not decoration: without it a
     caller cannot tell the two apart, and the obvious workaround —
     raising a flag on any change — can never lower it again. */
  onChange: (present: boolean) => void
  onStage?: never
  staged?: never
}

interface StagedProps extends Common {
  /** Hands the caller the chosen file, or null when it is cleared. */
  onStage: (file: File | null, alt: string) => void
  staged: File | null
  endpoint?: never
  publicPath?: never
  hasLogo?: never
  onChange?: never
}

export default function LogoField(props: LiveProps | StagedProps) {
  const { alt, defaultAlt, disabled } = props
  const staging = props.onStage !== undefined

  const fileRef = useRef<HTMLInputElement>(null)
  const [altText, setAltText] = useState(alt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  /* Bumped after every write so the preview refetches. The address is otherwise
     identical and the browser would serve its cached copy. */
  const [version, setVersion] = useState(0)

  /* A local preview of a staged file. Revoked when it is replaced or the
     component goes away: an object URL pins the file in memory until it is, and
     an operator who tries six logos before settling would pin all six. */
  const [objectURL, setObjectURL] = useState<string | null>(null)
  useEffect(() => () => { if (objectURL) URL.revokeObjectURL(objectURL) }, [objectURL])

  /* Fetched with the token rather than handed to the element as a plain URL.
     An <img> sends no Authorization header, so a logo on an unpublished listing
     is requested anonymously and correctly refused — which is indistinguishable
     from an upload that failed. */
  const liveSrc = useAuthedImage(
    !staging && props.hasLogo ? props.publicPath! : null,
    version,
  )
  const preview = staging ? objectURL : liveSrc

  /* The alt text travels with the file in staged mode, so the caller always
     holds the pair rather than having to reach back in for one of them. */
  function stageAlt(next: string) {
    setAltText(next)
    if (props.onStage) props.onStage(props.staged ?? null, next)
  }

  async function choose(file: File) {
    /* No gate on the alt text. It used to be required here, which made Upload a
       button that did nothing when the box above it was empty — and the answer
       was almost always the sponsor's name, which the form already holds. The
       server fills it in from there when this is blank. */
    setError(null)

    if (props.onStage) {
      if (objectURL) URL.revokeObjectURL(objectURL)
      setObjectURL(URL.createObjectURL(file))
      props.onStage(file, altText.trim())
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('alt', altText.trim())
      await api.upload(props.endpoint!, form)
      setVersion(v => v + 1)
      props.onChange!(true)
    } catch (err) {
      setError(errorDetail(err, 'The logo could not be saved.'))
    } finally {
      setBusy(false)
      /* Cleared so that choosing the same file again still fires a change
         event, which it does not while the input still holds it. */
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove() {
    setError(null)

    if (props.onStage) {
      if (objectURL) URL.revokeObjectURL(objectURL)
      setObjectURL(null)
      props.onStage(null, altText)
      setConfirming(false)
      return
    }

    setBusy(true)
    try {
      await api.del(props.endpoint!)
      setVersion(v => v + 1)
      setConfirming(false)
      props.onChange!(false)
    } catch (err) {
      setError(errorDetail(err, 'The logo could not be removed.'))
    } finally {
      setBusy(false)
    }
  }

  const present = staging ? !!props.staged : !!props.hasLogo

  return (
    <div className="rule">
      {error && <div className="alert danger" role="alert">{error}</div>}

      <div className="row" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
        <div className="logo-preview">
          {preview
            ? <img src={preview} alt={altText || defaultAlt || 'The sponsor’s logo'} />
            : <span className="faint" style={{ fontSize: 11 }}>No logo</span>}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Field
            label="What the logo shows"
            hint={defaultAlt
              ? `Left empty, the sponsor's name is used. Set this only if the mark says something else.`
              : 'Read aloud to anyone who cannot see the picture.'}
          >
            {p => (
              <input
                {...p}
                value={altText}
                onChange={e => (staging ? stageAlt(e.target.value) : setAltText(e.target.value))}
                disabled={disabled || busy}
                placeholder={defaultAlt}
              />
            )}
          </Field>

          <div className="row">
            {/* The native input is hidden and driven by the button: an unstyled
                file input cannot be made to match the rest of the panel, and its
                default label ("No file chosen") says nothing useful. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) choose(file)
              }}
            />
            <button
              className="sm"
              disabled={disabled || busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? 'Saving…' : present ? 'Replace' : 'Choose a logo'}
            </button>

            {present && !confirming && (
              <button
                className="sm subtle"
                disabled={disabled || busy}
                onClick={() => setConfirming(true)}
              >
                Remove
              </button>
            )}

            {confirming && (
              <>
                <button className="sm" disabled={busy} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button className="sm danger" disabled={busy} onClick={remove}>
                  Remove the logo
                </button>
              </>
            )}
          </div>

          <p className="faint" style={{ fontSize: 12, margin: '0.4rem 0 0' }}>
            PNG or JPG, at least 64 pixels square, up to 2000 and under 5 MB.
            An SVG is markup rather than a picture, so we do not serve one.
            {staging && ' It is uploaded when you save the listing.'}
          </p>
        </div>
      </div>
    </div>
  )
}
