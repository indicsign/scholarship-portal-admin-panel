import { useState } from 'react'

import * as api from '../lib/api'
import { errorDetail } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { Dialog, Field } from './ui'

/* Your own username and password.
 *
 * The panel had nowhere to change either. A password could only be replaced on
 * the way in from an invitation, and a username could only be claimed there —
 * so anybody past that step was stuck with both, and "change it in settings" was
 * advice about a screen that did not exist.
 *
 * One dialog rather than a settings page, because there are two things on it and
 * a page would be a door onto a short list. The theme select stays in the
 * account menu for the same reason it always did.
 *
 * The two halves save independently. They are unrelated changes with different
 * risks — one of them signs every other session out — and a single Save would
 * mean a failed password change discarding a perfectly good username.
 */
export default function AccountSettings({ onClose }: { onClose: () => void }) {
  const { account } = useAuth()

  const [username, setUsername] = useState(account?.username ?? '')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameDone, setNameDone] = useState<string | null>(null)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwDone, setPwDone] = useState<string | null>(null)

  /* Migration 0012's rule, checked here so the answer arrives before a round
     trip rather than instead of the server checking it. */
  const HANDLE = /^[a-z][a-z0-9._-]{2,31}$/
  const badName = username.length > 0 && !HANDLE.test(username)
  const nameReady = HANDLE.test(username) && username !== account?.username

  const tooShort = next.length > 0 && next.length < 12
  const mismatch = again.length > 0 && next !== again
  const pwReady = current.length > 0 && next.length >= 12 && next === again

  async function saveName() {
    setSavingName(true)
    setNameError(null)
    setNameDone(null)
    try {
      await api.post('/auth/username', { username })
      setNameDone('Saved. You can sign in with this or with your email address.')
    } catch (err) {
      setNameError(errorDetail(err, 'It could not be saved.'))
    } finally {
      setSavingName(false)
    }
  }

  async function savePassword() {
    setSavingPw(true)
    setPwError(null)
    setPwDone(null)
    try {
      await api.post('/auth/password', { current_password: current, new_password: next })
      setCurrent('')
      setNext('')
      setAgain('')
      setPwDone('Changed. Every other session has been signed out; this one continues.')
    } catch (err) {
      setPwError(errorDetail(err, 'It could not be changed.'))
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <Dialog
      open
      title="Your account"
      onClose={onClose}
      footer={<button onClick={onClose}>Close</button>}
    >
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Signed in as {account?.email ?? account?.phone}. That address always
        works for signing in, whatever else you set here.
      </p>

      <h3 className="sub-head">Username</h3>

      {nameError && <div className="alert danger" role="alert">{nameError}</div>}
      {nameDone && <div className="alert ok" role="status">{nameDone}</div>}

      <Field
        label="Username"
        hint="Three to thirty-two characters, starting with a letter. A second way to sign in — your email address keeps working."
        error={badName
          ? 'Start with a letter, then letters, numbers, dots, dashes or underscores.'
          : undefined}
      >
        {props => (
          <input
            {...props}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            /* Lower-cased as it is typed rather than refused after: the column is
               citext, so "Admin" and "admin" are the same name and rejecting the
               capital would be pedantry about a distinction the database does not
               make. */
            onChange={e => setUsername(e.target.value.toLowerCase().trim())}
            placeholder="your.name"
          />
        )}
      </Field>

      <button className="sm" onClick={saveName} disabled={savingName || !nameReady}>
        {savingName ? 'Saving…' : account?.username ? 'Change username' : 'Set username'}
      </button>

      <h3 className="sub-head">Password</h3>

      {pwError && <div className="alert danger" role="alert">{pwError}</div>}
      {pwDone && <div className="alert ok" role="status">{pwDone}</div>}

      {/* The current one is asked for here and not on the first-password screen,
          and the difference is the point: there, the temporary password had just
          been presented along with a code from this account's own mailbox. Here
          the session may have been open for hours on a machine somebody else can
          reach, so the password is what proves it is still you. */}
      <Field label="Current password" required>
        {props => (
          <input
            {...props}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
          />
        )}
      </Field>

      <Field
        label="New password"
        required
        hint="At least twelve characters."
        error={tooShort ? 'Twelve characters or more.' : undefined}
      >
        {props => (
          <input
            {...props}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={e => setNext(e.target.value)}
          />
        )}
      </Field>

      <Field
        label="New password again"
        required
        error={mismatch ? 'These two do not match.' : undefined}
      >
        {props => (
          <input
            {...props}
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={e => setAgain(e.target.value)}
          />
        )}
      </Field>

      <button className="sm" onClick={savePassword} disabled={savingPw || !pwReady}>
        {savingPw ? 'Changing…' : 'Change password'}
      </button>

      <p className="faint" style={{ fontSize: 12, margin: '0.5rem 0 0' }}>
        Changing your password signs out every other session. This one keeps
        working.
      </p>
    </Dialog>
  )
}
