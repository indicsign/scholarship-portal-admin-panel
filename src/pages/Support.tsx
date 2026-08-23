import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { isPlatformRole } from '../lib/roles'
import { humanise, relative } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pill } from '../components/ui'
import { useDebounced, useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import type { UserSummary } from '../lib/types'

/* Support access — impersonation.
 *
 * Section 7.2 permits this "for support purposes, always logged, and always
 * disclosed to the affected user afterwards". The server enforces all three;
 * this screen's job is to make the operator feel the weight of it rather than
 * treat it as a convenience.
 *
 * Hence: a reason is mandatory and typed out rather than picked from a list, the
 * consequences are stated before the button, and platform accounts are visibly
 * not offered — a support session must not be able to assume an identity with
 * more scope than the operator's own.
 */
export default function Support() {
  const { can, impersonation } = useAuth()
  const announce = useAnnounce()

  const [term, setTerm] = useState('')
  const search = useDebounced(term, 350)
  const [target, setTarget] = useState<UserSummary | null>(null)

  const canImpersonate = can('SUPER_ADMIN', 'STAFF')

  const query = useQuery<UserSummary[]>(
    signal => search.length >= 3
      ? api.get('/admin/users', { q: search }, signal)
      : Promise.resolve({ data: [] as UserSummary[] }),
    [search],
  )

  if (impersonation) {
    return (
      <>
        <div className="page-head"><h1>Support access</h1></div>
        <div className="alert warn" role="status">
          <p>
            You are already inside a support session. End it from the banner
            above before starting another.
          </p>
          <p>{impersonation.notice}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support access</h1>
          <p>
            Sign in as a user to help them with a problem you cannot reproduce.
            The session lasts fifteen minutes, every action is recorded against
            your name, and the user is told afterwards that it happened.
          </p>
        </div>
      </div>

      {!canImpersonate && (
        <div className="alert warn" role="status">
          Your role can review the audit trail but cannot start a support
          session. A platform administrator or support staff member can.
        </div>
      )}

      <div className="card">
        <header>
          <div className="filters" style={{ flex: 1 }}>
            {/* min(), not a bare 18rem: at a 320px viewport the main column
                has 272px, and an 18rem floor pushes the whole page sideways. */}
            <div className="field" style={{ flex: 1, minWidth: 'min(18rem, 100%)' }}>
              <label htmlFor="user-search">Find an account</label>
              <input
                id="user-search"
                type="search"
                data-primary-filter
                value={term}
                onChange={e => setTerm(e.target.value)}
                placeholder="Email address or mobile number"
                autoComplete="off"
                aria-describedby="user-search-hint"
              />
              <span className="hint" id="user-search-hint">
                At least three characters. There is deliberately no way to list
                every account.
              </span>
            </div>
          </div>
        </header>

        {search.length > 0 && search.length < 3 && (
          <Empty title="Keep typing" hint="Three characters or more." />
        )}

        {search.length >= 3 && query.loading && !query.data && <Loading label="Searching" />}
        {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

        {search.length >= 3 && query.data && query.data.length === 0 && !query.loading && (
          <Empty title="No matching account" hint="Check the spelling of the address or number." />
        )}

        {search.length >= 3 && query.data && query.data.length > 0 && (
          // The previous term's matches stay put while the next search runs,
          // so the list does not blink out between keystrokes. Gated on the
          // term still being long enough, or deleting back to two characters
          // would show "keep typing" over the top of the last term's results.
          <div className={query.stale ? 'stale' : undefined} aria-busy={query.stale || undefined}>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Matching accounts</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Roles</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last signed in</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map(u => {
                    const platform = u.roles.some(isPlatformRole)

                    return (
                      <tr key={u.user_id}>
                        <th scope="row" style={{ fontWeight: 500 }}>
                          {u.email ?? u.phone}
                          {u.email && u.phone && (
                            <div className="faint" style={{ fontWeight: 400, fontSize: 12 }}>{u.phone}</div>
                          )}
                        </th>
                        <td>
                          <div className="row" style={{ gap: '0.25rem' }}>
                            {u.roles.length === 0
                              ? <span className="faint">No role yet</span>
                              : u.roles.map(r => <Pill key={r}>{humanise(r)}</Pill>)}
                          </div>
                        </td>
                        <td>
                          <Pill tone={u.status === 'ACTIVE' ? 'ok' : 'warn'}>{humanise(u.status)}</Pill>
                        </td>
                        <td className="nowrap">
                          {u.last_login_at ? relative(u.last_login_at) : <span className="faint">never</span>}
                        </td>
                        <td className="actions">
                          {platform ? (
                            <span className="faint" style={{ fontSize: 12 }}>
                              Platform account — cannot be assumed
                            </span>
                          ) : (
                            <button
                              className="sm"
                              disabled={!canImpersonate || !u.impersonable}
                              onClick={() => setTarget(u)}
                            >
                              Act as<span className="sr-only"> {u.email ?? u.phone}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <StartDialog
        target={target}
        onClose={() => setTarget(null)}
        onStarted={who => {
          setTarget(null)
          announce(`Support session started as ${who}. Every action is being recorded.`, 'warn')
        }}
      />
    </>
  )
}

function StartDialog({
  target, onClose, onStarted,
}: {
  target: UserSummary | null
  onClose: () => void
  onStarted: (who: string) => void
}) {
  const { startImpersonation } = useAuth()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The server requires ten characters. Matching it here means the operator is
  // told before they submit rather than after.
  const tooShort = reason.trim().length < 10

  async function start() {
    if (!target) return
    setBusy(true)
    setError(null)

    try {
      await startImpersonation(target.user_id, reason.trim())
      onStarted(target.email ?? target.phone ?? 'the user')
      setReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The session could not be started.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!target}
      title="Start a support session"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={start} disabled={busy || tooShort}>
            {busy ? 'Starting…' : 'Start session'}
          </button>
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      <p style={{ marginTop: 0 }}>
        You will be signed in as <strong>{target?.email ?? target?.phone}</strong>.
      </p>

      <div className="alert warn">
        <p>The session ends automatically after fifteen minutes.</p>
        <p>Every action you take is recorded against your own name, not theirs.</p>
        <p>{target?.email ?? 'The user'} will be told that this happened, and why.</p>
      </div>

      <Field
        label="Why are you doing this?"
        required
        hint="Shown to the user in the notice they receive. Write it for them, not for the log."
        error={reason && tooShort ? 'Give at least ten characters.' : undefined}
      >
        {props => (
          <textarea
            {...props}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Helping with grievance GRV-2026-000123 — the applicant cannot see their approved application."
          />
        )}
      </Field>
    </Dialog>
  )
}
