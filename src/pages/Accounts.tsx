import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { date, humanise } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pill, StatusPill } from '../components/ui'
import { useDebounced, useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import type { PlatformUser, Role } from '../lib/types'

/* Accounts across the whole platform.
 *
 * Only the super admin reaches this screen. Platform staff and compliance
 * officers can read accounts elsewhere — Support access finds one for a support
 * session — and neither may create one or change what it may do. Granting
 * authority is the single act in this system that is not delegable by everyone
 * who holds it, and it is refused in three places: the route guard, the identity
 * service, and the policy on platform_role in the database.
 *
 * Nothing here deletes. "Remove" deactivates: an account is named by every
 * application it filed and every entry in the audit trail, and removing the row
 * would either fail on those references or take the history with it. Erasing a
 * person is a data request, answering a legal right rather than an
 * administrator's convenience.
 */

const PLATFORM_ROLES: Role[] = ['PLATFORM_SUPER_ADMIN', 'PLATFORM_STAFF', 'COMPLIANCE_OFFICER']

export default function Accounts() {
  const { context } = useAuth()
  const announce = useAnnounce()
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PlatformUser | null>(null)

  const query = useQuery<PlatformUser[]>(
    signal => api.get('/admin/accounts', { q: search, limit: 50 }, signal),
    [search],
  )

  // Guarding the screen as well as the route. A super admin who loses the role
  // mid-session keeps a token that still says otherwise until it expires, and
  // this is what they should see rather than a wall of 403s.
  if (context?.role !== 'PLATFORM_SUPER_ADMIN') {
    return (
      <div className="card">
        <Empty
          title="Only the super admin administers accounts"
          hint="You can find an account from Support access."
        />
      </div>
    )
  }

  async function act(u: PlatformUser, what: 'suspend' | 'reinstate' | 'remove') {
    const who = u.email ?? u.phone ?? 'that account'
    try {
      if (what === 'remove') {
        await api.del(`/admin/accounts/${u.user_id}`)
        announce(`${who} has been deactivated. Its roles and sessions are gone.`, 'warn')
      } else {
        await api.patch(`/admin/accounts/${u.user_id}`, {
          status: what === 'suspend' ? 'SUSPENDED' : 'ACTIVE',
        })
        announce(
          what === 'suspend'
            ? `${who} is suspended and signed out.`
            : `${who} can sign in again.`,
          what === 'suspend' ? 'warn' : 'ok',
        )
      }
      query.reload()
    } catch (err) {
      announce(err instanceof Error ? err.message : 'It could not be saved.', 'danger')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p>
            Every account on the platform and what each one may do. Suspending
            somebody signs them out at once; deactivating also stands down every
            role they hold.
          </p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>Add an account</button>
      </div>

      <div className="card">
        <Field label="Search" hint="An email address or a mobile number.">
          {props => (
            <input
              {...props}
              type="search"
              data-primary-filter
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="anything@example.org"
            />
          )}
        </Field>

        {query.loading && !query.data && <Loading label="Loading accounts" />}
        {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}
        {query.data && query.data.length === 0 && (
          <Empty
            title={search ? 'Nothing matches that' : 'No accounts'}
            hint={search ? 'Try part of an email address.' : undefined}
          />
        )}

        {!!query.data?.length && (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Accounts on the platform</caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">What they may do</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last signed in</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {query.data.map(u => {
                  // No client-side "is this me" check: the session context
                  // carries a role, not a user id. The service refuses an
                  // operator suspending or deactivating their own account and
                  // says so plainly, which is the same protection without the
                  // client guessing at identity.
                  const dead = u.status === 'DEACTIVATED'
                  return (
                    <tr key={u.user_id}>
                      <th scope="row" style={{ fontWeight: 600 }}>
                        {u.email ?? u.phone ?? '—'}
                        {u.email && u.phone && (
                          <div className="faint" style={{ fontWeight: 400, fontSize: 12 }}>
                            {u.phone}
                          </div>
                        )}
                      </th>
                      <td>
                        {u.roles.length === 0 ? (
                          <span className="faint">Nothing — a student or an unused account</span>
                        ) : (
                          <div className="pill-row">
                            {u.roles.map(r => (
                              <Pill
                                key={`${r.role}:${r.organisation_id ?? 'platform'}`}
                                tone={r.organisation_id ? 'neutral' : 'accent'}
                              >
                                {humanise(r.role)}
                                {r.organisation_name ? ` · ${r.organisation_name}` : ''}
                              </Pill>
                            ))}
                          </div>
                        )}
                      </td>
                      <td><StatusPill status={u.status} /></td>
                      <td className="nowrap">
                        {u.last_login_at ? date(u.last_login_at) : <span className="faint">never</span>}
                      </td>
                      <td className="actions">
                        <button className="sm" onClick={() => setEditing(u)} disabled={dead}>
                          Roles<span className="sr-only"> for {u.email ?? u.phone}</span>
                        </button>
                        {u.status === 'SUSPENDED' ? (
                          <button className="sm" onClick={() => act(u, 'reinstate')}>
                            Reinstate<span className="sr-only"> {u.email ?? u.phone}</span>
                          </button>
                        ) : (
                          <button
                            className="sm"
                            onClick={() => act(u, 'suspend')}
                            disabled={dead}
                          >
                            Suspend<span className="sr-only"> {u.email ?? u.phone}</span>
                          </button>
                        )}
                        <button
                          className="sm danger"
                          onClick={() => act(u, 'remove')}
                          disabled={dead}
                        >
                          Remove<span className="sr-only"> {u.email ?? u.phone}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onDone={msg => {
            setCreating(false)
            announce(msg, 'ok')
            query.reload()
          }}
        />
      )}

      {editing && (
        <RolesDialog
          user={editing}
          onClose={() => setEditing(null)}
          onChanged={msg => {
            announce(msg, 'ok')
            query.reload()
          }}
          onDone={() => setEditing(null)}
        />
      )}
    </>
  )
}

/* Creating an account.
 *
 * One role, not a set. An account that needs several is created and then granted
 * the rest, so each grant is its own entry in the audit trail instead of a list
 * buried inside one.
 */
function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('PLATFORM_STAFF')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only platform roles are offered here. An organisational role needs an
  // organisation, and the person who knows which one is that organisation's own
  // administrator — who adds colleagues from their own People screen, where the
  // roles on offer are already the right ones for their type.
  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/accounts', { email, phone: phone || undefined, role })
      onDone(`${email} created as ${humanise(role).toLowerCase()}. A temporary password has been emailed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Add an account"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy || !email}>
            {busy ? 'Saving…' : 'Create it'}
          </button>
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      {role === 'PLATFORM_SUPER_ADMIN' && (
        <div className="alert warn">
          <p>
            A super admin can administer every account on the platform, including
            yours, and can grant this same role to anybody else.
          </p>
        </div>
      )}

      <Field label="Email address" required hint="Where the temporary password and every sign-in code go.">
        {props => (
          <input {...props} type="email" autoComplete="off" value={email}
            onChange={e => setEmail(e.target.value)} />
        )}
      </Field>

      <Field label="Mobile number" hint="Optional. Used for notices, not for signing in.">
        {props => (
          <input {...props} type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        )}
      </Field>

      <Field label="What may they do?" required>
        {props => (
          <select {...props} value={role} onChange={e => setRole(e.target.value as Role)}>
            {PLATFORM_ROLES.map(r => <option key={r} value={r}>{humanise(r)}</option>)}
          </select>
        )}
      </Field>

      <p className="faint">
        To give somebody a role inside an organisation, their organisation's own
        administrator adds them from People — only that screen knows which roles
        that type of organisation can hold.
      </p>
    </Dialog>
  )
}

/* Granting and revoking platform scope on an existing account.
 *
 * Organisational roles are shown but not editable here. They belong to a tenant,
 * and reaching across into one to change who does what there would put the
 * platform inside a boundary the whole system exists to hold.
 */
function RolesDialog({
  user, onClose, onChanged, onDone,
}: {
  user: PlatformUser
  onClose: () => void
  onChanged: (message: string) => void
  onDone: () => void
}) {
  const [role, setRole] = useState<Role>('PLATFORM_STAFF')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const who = user.email ?? user.phone ?? 'this account'
  const platform = user.roles.filter(r => !r.organisation_id)
  const organisational = user.roles.filter(r => r.organisation_id)
  const held = new Set(platform.map(r => r.role))
  const grantable = PLATFORM_ROLES.filter(r => !held.has(r))

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged(message)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={`What ${who} may do`}
      onClose={onClose}
      footer={<button onClick={onClose} disabled={busy}>Close</button>}
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      <h3>Platform</h3>
      {platform.length === 0 ? (
        <p className="faint">No platform role.</p>
      ) : (
        <ul className="plain">
          {platform.map(r => (
            <li key={r.role} className="row-between">
              <span>{humanise(r.role)}</span>
              <button
                className="sm danger"
                disabled={busy}
                onClick={() => run(
                  () => api.del(`/admin/accounts/${user.user_id}/platform-roles/${r.role}`),
                  `${humanise(r.role)} taken away from ${who}.`,
                )}
              >
                Revoke<span className="sr-only"> {humanise(r.role)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {grantable.length > 0 && user.status === 'ACTIVE' && (
        <>
          <Field label="Grant another platform role">
            {props => (
              <select {...props} value={role} onChange={e => setRole(e.target.value as Role)}>
                {grantable.map(r => <option key={r} value={r}>{humanise(r)}</option>)}
              </select>
            )}
          </Field>
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(
              () => api.post(`/admin/accounts/${user.user_id}/platform-roles`, { role }),
              `${who} is now ${humanise(role).toLowerCase()}.`,
            )}
          >
            {busy ? 'Saving…' : 'Grant it'}
          </button>
        </>
      )}

      {user.status !== 'ACTIVE' && (
        <p className="faint">
          Only an active account can be given a platform role. Reinstate it first.
        </p>
      )}

      <h3>Organisations</h3>
      {organisational.length === 0 ? (
        <p className="faint">Not a member of any organisation.</p>
      ) : (
        <ul className="plain">
          {organisational.map(r => (
            <li key={r.membership_id}>
              {humanise(r.role)} · {r.organisation_name}
            </li>
          ))}
        </ul>
      )}
      <p className="faint">
        Roles inside an organisation are managed by that organisation's own
        administrator, from their People screen.
      </p>
    </Dialog>
  )
}
