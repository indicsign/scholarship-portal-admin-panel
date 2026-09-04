import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

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
const RESEND_SECONDS = 30

const CODE_LENGTH = 6

export default function Login() {
  const { signIn, signOut, status, error } = useAuth()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [resent, setResent] = useState(false)
  /* The clock, not the countdown.
   *
   * secondsLeft is derived from this and the moment the code went out, rather
   * than being its own piece of state. Two reasons, and the second is the one
   * that matters: a stored countdown has to be seeded when the step appears,
   * which means setting state synchronously inside an effect — the thing
   * react-hooks/set-state-in-effect refuses, and refuses for good reason, since
   * it renders twice for one arrival. Derived, the only write happens inside
   * the interval callback, which is not during the effect. */
  const [now, setNow] = useState(() => Date.now())
  /* State rather than a ref, because the derivation below reads it during
     render and a ref read there is not allowed to be a dependency of what
     gets painted — react-hooks/refs. It is only ever written from an event
     handler, which is where a code actually goes out. */
  const [sentAt, setSentAt] = useState(0)

  const codeInput = useRef<HTMLInputElement | null>(null)
  const awaitingCode = status === 'mfa_required'

  /* Ticks only while the code step is on screen. Half-second so the number
   * never appears to skip, which it does at exactly 1000ms when a render lands
   * just after a boundary. */
  useEffect(() => {
    if (!awaitingCode) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [awaitingCode])

  /* Long enough that the email has a fair chance of arriving before the button
   * tempts anyone. Asking again invalidates the code already sent, so an early
   * press makes things worse in a way the operator cannot see. */
  const secondsLeft = sentAt === 0
    ? 0
    : Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000))

  /* Move to the boxes the moment they appear, so the digits can be typed
     straight from the email without hunting for the field. */
  useEffect(() => {
    if (awaitingCode) codeInput.current?.focus()
  }, [awaitingCode])

  // getModifierState reports the lock itself rather than guessing from the
  // case of the character, so it is right for a non-Latin keyboard layout too.
  function checkCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false)
  }

  /* Ask for another code by re-submitting the credentials the operator has
   * already given. There is no separate resend endpoint, and there does not
   * need to be: the same call that issued the first code issues the next one,
   * and a correct password re-sent does not count against the lockout that
   * guards wrong ones. */
  async function resend() {
    setBusy(true)
    setResent(false)
    setCode('')
    try {
      await signIn(identifier, password)
      setSentAt(Date.now())
      setNow(Date.now())
      setResent(true)
    } catch {
      /* the provider holds the message */
    } finally {
      setBusy(false)
    }
  }

  /* Back to the first step with the fields cleared.
   *
   * Without this a mistyped username is a dead end: the code goes to an address
   * the operator cannot read, the panel keeps asking for it, and the only way
   * out is knowing to reload the page. signOut swallows a failed logout call,
   * so this returns to step one either way. */
  async function useDifferentAccount() {
    setCode('')
    setResent(false)
    setPassword('')
    await signOut()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await signIn(identifier, password, awaitingCode ? code : undefined)
      // Step one succeeding means a code has just been sent, which is what the
      // countdown is measuring from. Stamped here rather than in an effect for
      // the reason given above.
      if (!awaitingCode) {
        setSentAt(Date.now())
        setNow(Date.now())
      }
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
          {/* The foundation's mark, above the panel it opens.
              
              alt is empty and the name is real text below: the artwork's own
              wordmark reads "Indic-ai", the line under it reads "Indic AI
              Foundation For Social Good", and giving the image alt text would
              have a screen reader announce the organisation twice under two
              slightly different names.
              
              The mark is the tree over the wordmark, not the full artwork —
              scripts/build-icons.py drops the "Foundation for social good"
              strapline baked into the source because at #d3d3d3 it is about
              1.6:1 on this card. It is the lede below instead, which is
              legible, selectable, and grows with the reader's font size. */}
          <img
            src="/logo-full.png"
            alt=""
            width="150"
            height="104"
            className="brand-logo"
          />

          {/* How far in, and how far to go.
              
              The second factor is not optional for any role that can reach this
              panel, so it is not an interruption — it is half the journey, and
              saying so up front is what stops the code screen reading as
              something having gone wrong. Two ticks and four words. */}
          <p className="auth-progress">
            <span className="ticks" aria-hidden="true">
              <span className="tick on" />
              <span className={`tick ${awaitingCode ? 'on' : ''}`} />
            </span>
            Step {awaitingCode ? 2 : 1} of 2 · {awaitingCode ? 'Your code' : 'Your password'}
          </p>

          <h1>Admin Panel</h1>
          <p className="lede">Indic AI Foundation For Social Good</p>

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
                  {/* Six boxes, one field.
                    
                      The boxes are decoration — spans showing where each digit
                      landed — and the control is a single transparent input
                      lying across all six. One input rather than six because
                      six inputs mean six tab stops, six things for a screen
                      reader to announce, and an autofill that fills only the
                      first; this way the browser still offers the code from
                      the email as one value, and a paste of all six digits
                      lands correctly.
                    
                      Why boxes at all, when a plain field held the same six
                      digits: position. An operator reading digits off a second
                      screen loses their place in "051415" and cannot tell
                      whether they have typed four or five. The boxes make the
                      count visible without anyone counting, and the next box
                      says where the following digit goes.
                    
                      The input's text is transparent rather than hidden —
                      opacity and visibility are what autofill heuristics read
                      to decide a field is not really on the page, and the
                      autofill is the point. Ported from the student portal so
                      that a six-digit code looks and behaves the same in both
                      places. */}
                  {props => (
                    <span className="code-boxes">
                      <span className="boxes" aria-hidden="true">
                        {Array.from({ length: CODE_LENGTH }, (_, i) => (
                          <span
                            key={i}
                            className={
                              'box' +
                              (code[i] ? ' filled' : '') +
                              // Clamped to the last box, not `i === code.length`.
                              //
                              // .next is the focus indicator for the whole
                              // control now that the group no longer draws a
                              // ring around all six boxes, and an unclamped
                              // index matches nothing once six digits are in —
                              // so the moment the code was complete, focus
                              // became invisible. Clamping keeps exactly one
                              // active box at every length.
                              (i === Math.min(code.length, CODE_LENGTH - 1) ? ' next' : '')
                            }
                          >
                            {code[i] ?? ''}
                          </span>
                        ))}
                      </span>

                      <input
                        {...props}
                        ref={codeInput}
                        // inputMode + autocomplete let a phone offer the code
                        // and a password manager fill it, which is the
                        // difference between one tap and reading digits across
                        // devices.
                        type="text"
                        name="one-time-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={CODE_LENGTH}
                        value={code}
                        onChange={e => setCode(
                          e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH),
                        )}
                      />
                    </span>
                  )}
                </Field>

                {/* Spoken as well as shown: pressing resend otherwise changes
                    nothing a screen reader can hear, and the second press that
                    follows invalidates the code from the first. */}
                <p className="auth-sent" role="status">
                  {resent ? 'Sent. A new code is on its way — the earlier one no longer works.' : ''}
                </p>

                <div className="auth-retry">
                  <span className="muted">No email yet?</span>
                  <button
                    type="button"
                    className="subtle sm"
                    onClick={resend}
                    disabled={busy || secondsLeft > 0}
                  >
                    {secondsLeft > 0 ? `Send another in ${secondsLeft}s` : 'Send another code'}
                  </button>
                </div>

                {/* The remedy for a mistyped username, on its own line.
                  
                    Not a third item in the row above: a padded button beside an
                    unpadded label starts its text an indent further in, and the
                    two rows then disagree about where the left edge is. As a
                    flush link it lines up with everything else in the card, and
                    it reads as the quieter of the two ways out — which it is,
                    since it throws away a password that was just accepted. */}
                <button
                  type="button"
                  className="link-quiet"
                  onClick={useDifferentAccount}
                  disabled={busy}
                >
                  Use a different account
                </button>
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
