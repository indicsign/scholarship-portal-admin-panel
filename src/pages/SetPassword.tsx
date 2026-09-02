import { useState } from 'react'

import { useAuth } from '../lib/auth-context'
import { Field } from '../components/ui'

/* Choosing a password to replace the temporary one.
 *
 * Shown instead of the application, not alongside it. The session is real — the
 * token is installed and this form uses it — but the credential that opened it
 * arrived in an inbox and expires 24 hours after it was issued, so there is
 * nothing worth doing before replacing it.
 *
 * No current-password field. It was presented moments ago, along with a code
 * sent to this account's own mailbox, and asking somebody to re-type a string
 * out of an email to prove what they just proved is friction with no security in
 * it. The server enforces the narrow case this is allowed in: it refuses unless
 * the password in force is a temporary one, so this cannot become a way to
 * change any signed-in account's password without knowing it.
 */
export default function SetPassword() {
  const { setPassword, signOut, context, account } = useAuth()
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  /* Asked for only when the account has none. Somebody whose password an admin
     has just reset already signs in with one. */
  const needsUsername = !account?.username
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Checked here as well as on the server, because the mismatch is the one
  // error the client can be certain about and a round trip to be told you typed
  // two different things is a poor use of anybody's time.
  const tooShort = next.length > 0 && next.length < 12
  const mismatch = again.length > 0 && next !== again

  /* The same rule as migration 0012's CHECK and the server's validator: a
     leading letter so it can never be read as a mobile number, and no @ so it
     can never be read as an email address. Checked here so the answer arrives
     before a round trip, not instead of the server checking it. */
  const HANDLE = /^[a-z][a-z0-9._-]{2,31}$/
  const badUsername = username.length > 0 && !HANDLE.test(username)
  const usernameOk = !needsUsername || HANDLE.test(username)

  const ready = next.length >= 12 && next === again && usernameOk

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await setPassword(next, needsUsername ? username : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main" className="login">
      <div className="card">
        <h1>Choose your password</h1>
        <p>
          You signed in with a temporary password. It stops working 24 hours
          after it was issued, so choose one of your own now.
          {needsUsername && ' Pick a username while you are here — you will be able to sign in with either it or your email address.'}
          {context?.role && ' Nothing else is available until you do.'}
        </p>

        {error && <div className="alert danger" role="alert">{error}</div>}

        <form
          onSubmit={e => { e.preventDefault(); if (ready) void save() }}
        >
          {needsUsername && (
            <Field
              label="Username"
              required
              hint="Three to thirty-two characters, starting with a letter. Lower case, and dots, dashes or underscores are allowed."
              error={badUsername
                ? 'Start with a letter, then letters, numbers, dots, dashes or underscores.'
                : undefined}
            >
              {props => (
                <input
                  {...props}
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  /* Lower-cased as it is typed rather than refused afterwards:
                     the column is citext, so "Admin" and "admin" are the same
                     name, and rejecting the capital would be pedantry about a
                     distinction the database does not make. */
                  onChange={e => setUsername(e.target.value.toLowerCase().trim())}
                  placeholder="your.name"
                />
              )}
            </Field>
          )}
          <Field
            label="New password"
            required
            error={tooShort ? 'At least 12 characters.' : undefined}
            hint="At least 12 characters. Longer matters more than complicated."
          >
            {props => (
              <input
                {...props}
                type="password"
                autoComplete="new-password"
                autoFocus
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

          <button className="primary" type="submit" disabled={busy || !ready}>
            {busy ? 'Saving…' : 'Save it and continue'}
          </button>
        </form>

        <p className="faint">
          Signing in elsewhere with the temporary password will stop working once
          you save this. If somebody else read the invitation, that is what ends
          their access.
        </p>

        <button onClick={() => void signOut()} disabled={busy}>
          Sign out instead
        </button>
      </div>
    </main>
  )
}
