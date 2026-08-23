import { useState, type FormEvent, type KeyboardEvent } from 'react'

import { useAuth } from '../lib/auth-context'
import { Field } from '../components/ui'

/* The sign-in screen.
 *
 * Two steps, because every role that can reach this panel is required to hold a
 * second factor (Table 3.3). The MFA step is presented as the normal next step
 * rather than as an interruption, and the password fields are not re-shown —
 * re-typing a password to correct a mistyped six-digit code is the kind of
 * friction that ends in the code being written on a sticky note.
 *
 * Two affordances on the password field are there for the same reason: the API
 * locks an account after a handful of wrong attempts, so every avoidable typo
 * is a real cost. Caps Lock is the commonest cause of one, and being unable to
 * see what you typed is the second — particularly for anyone typing a password
 * they were sent rather than one they chose.
 */
export default function Login() {
  const { signIn, status, error } = useAuth()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  const awaitingCode = status === 'mfa_required'

  // getModifierState reports the lock itself rather than guessing from the
  // case of the character, so it is right for a non-Latin keyboard layout too.
  function checkCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await signIn(identifier, password, awaitingCode ? code : undefined)
    } catch {
      // The provider holds the message; clearing the code lets the operator
      // retype without selecting the old one first.
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login" id="main">
      <div className="card">
        <div className="body">
          <h1>Admin panel</h1>
          <p className="lede">
            Scholarship Platform · platform operators only
          </p>

          {error && <div className="alert danger" role="alert">{error}</div>}

          <form onSubmit={submit} noValidate>
            {!awaitingCode ? (
              <>
                <Field
                  label="Username or email address"
                  hint="Whichever you were given. A mobile number works too."
                  required
                >
                  {props => (
                    <input
                      {...props}
                      // type="text", not "email": the field takes a username
                      // as readily as an address, and type="email" would have
                      // the browser reject the shorter one before it is sent.
                      type="text"
                      name="identifier"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                    />
                  )}
                </Field>

                {/* Deliberately not routed through Field's `error` slot: Caps
                    Lock being on is a warning about the keyboard, not a
                    judgement on the value, and marking the input aria-invalid
                    for it would tell a screen reader the password is wrong
                    before it has been tried. */}
                <Field label="Password" required>
                  {props => (
                    <div className="input-affix">
                      <input
                        {...props}
                        type={reveal ? 'text' : 'password'}
                        name="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyUp={checkCapsLock}
                        onKeyDown={checkCapsLock}
                        onBlur={() => setCapsLock(false)}
                      />
                      {/* type=button, or it submits the form on Enter.
                          The accessible name carries the state — "Show
                          password" becomes "Hide password" — rather than
                          aria-pressed on a fixed name. Both at once would
                          have a screen reader announce "hide password,
                          pressed", which reads as the opposite of what the
                          field is doing. */}
                      <button
                        type="button"
                        className="subtle sm affix"
                        onClick={() => setReveal(r => !r)}
                      >
                        {reveal ? 'Hide' : 'Show'}
                        <span className="sr-only"> password</span>
                      </button>

                      {capsLock && (
                        <p className="caps-warning" role="alert">
                          <span aria-hidden="true">⇪</span> Caps Lock is on.
                        </p>
                      )}
                    </div>
                  )}
                </Field>
              </>
            ) : (
              <>
                <div className="alert ok" role="status">
                  Password accepted. We have emailed you a sign-in code.
                </div>

                <Field
                  label="Sign-in code"
                  hint="Six digits, from the email we just sent you."
                  required
                >
                  {props => (
                    <input
                      {...props}
                      // inputMode + autocomplete let a phone offer the code and
                      // a password manager fill it, which is the difference
                      // between one tap and reading digits across devices.
                      type="text"
                      name="one-time-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoFocus
                      className="mono"
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    />
                  )}
                </Field>
              </>
            )}

            <button
              type="submit"
              className="primary"
              style={{ width: '100%' }}
              disabled={busy || (awaitingCode ? code.length !== 6 : !identifier || !password)}
            >
              {busy ? 'Checking…' : awaitingCode ? 'Verify and sign in' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
