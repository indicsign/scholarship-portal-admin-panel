import { useState } from 'react'

import { Dialog } from './ui'

/* The temporary password, shown once, for the operator to pass on.
 *
 * # Why this screen exists
 *
 * Creating an account mints a temporary password, hashes it into the row and
 * mails the plaintext. The hash is one-way and the audit trail never records a
 * credential, so the plaintext exists for the length of one request. If the
 * recipient does not end up holding it, nobody does, and the account is dead —
 * the only way back is a reset, which needs the same mail path.
 *
 * That is not hypothetical. On 2026-09-05 two accounts were created, the mail
 * went out, and it carried no password: the id in the environment pointed at a
 * "your password has been changed" template with no password placeholder in it.
 * MSG91 reported success, the panel said "a temporary password has been
 * emailed", and both accounts were unusable.
 *
 * # Why it shows even when the mail was delivered
 *
 * Because that incident is proof that "delivered" and "the recipient has a
 * usable password" are different facts, and this platform can only observe the
 * first. The provider renders the template and does not report which
 * placeholders it filled, so a mail can be accepted, delivered, opened, and
 * still be useless — with nothing anywhere saying so.
 *
 * The disclosure is narrower than it looks. This is shown to the super admin who
 * created the account seconds ago and who can reset its password at will; what
 * changes is that the credential reaches a person instead of being destroyed.
 */
export default function TemporaryPassword({
  who, password, delivered, reason, onClose,
}: {
  who: string
  password: string
  /** Whether the mail was accepted by the provider. Not whether it was useful. */
  delivered: boolean
  /** The provider's own words, when it refused. */
  reason?: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 4000)
    } catch {
      /* Clipboard access is refused in some browsers and over plain HTTP.
       * Swallowed rather than surfaced: the password is on screen and
       * selectable, so the fallback is the thing people were going to do
       * anyway, and an error about the clipboard on this dialog reads as
       * something having gone wrong with the account. */
    }
  }

  return (
    <Dialog
      open
      title={`Temporary password for ${who}`}
      onClose={onClose}
      footer={<button className="primary" onClick={onClose}>I have saved it</button>}
    >
      {/* The warning first, because it governs everything below it. Somebody who
        * closes this dialog without reading has to have seen this line. */}
      <div className="alert warn" role="alert">
        <p>
          <strong>This is the only time it is shown.</strong> It is stored as a
          hash, so nobody — including this panel — can read it again. If you lose
          it, reset the password to issue a new one.
        </p>
      </div>

      {/* Real selectable text, in the same shape the email uses. Never an image
        * and never masked: it exists to be copied, and a dot-obscured field
        * would have to be revealed before it could be, which is friction with no
        * security in it on a dialog that already says what it holds. */}
      <div className="credential">
        <div className="credential-label">Temporary password</div>
        <div className="credential-value">{password}</div>
      </div>

      <div className="credential-actions">
        <button onClick={copy}>
          {copied ? 'Copied' : 'Copy to clipboard'}
          <span className="sr-only"> the temporary password for {who}</span>
        </button>
        {/* aria-live so a screen reader announces the change rather than leaving
            the button silently relabelled. */}
        <span className="faint" aria-live="polite">
          {copied ? 'Copied.' : ''}
        </span>
      </div>

      {delivered ? (
        <>
          <p>
            It was also emailed to {who}. Check with them before passing it on
            by hand — if the message arrived and carried a password, they do not
            need this.
          </p>
          {/* The specific failure that made this dialog necessary, named. An
              operator who has seen it once recognises it instantly, and one who
              has not now knows what to look for. */}
          <p className="faint">
            An email that arrives saying only that the password was
            <em> changed</em>, with no password in it, means the wrong template
            is registered. Pass this on by hand and tell whoever runs MSG91.
          </p>
        </>
      ) : (
        <>
          <p>
            <strong>Nothing was emailed.</strong> Pass this on yourself, in
            person or over a channel you trust. It lasts 24 hours, and they will
            be asked to choose their own password when they sign in.
          </p>
          {reason && (
            /* The provider's words, verbatim and set apart.
             *
             * Shown rather than translated because the two likely causes need
             * different people: "no MSG91 template is registered for
             * temp_password" is a variable somebody must set, and "IP is not
             * whitelisted" is MSG91's dashboard. Paraphrasing loses exactly the
             * detail that tells them apart. */
            <p className="faint">
              The mail could not be sent: <span className="mono">{reason}</span>
            </p>
          )}
        </>
      )}
    </Dialog>
  )
}
