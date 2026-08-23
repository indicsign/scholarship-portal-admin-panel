import { useState } from 'react'

import * as api from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { date, humanise } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pill, StatusPill } from '../components/ui'
import { useDebounced, useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import { PLATFORM_ROLES } from '../lib/roles'
import type { PlatformUser, Role } from '../lib/types'

/* User management.
 *
 * Split into three because the three are governed differently, not because a
 * long list wanted breaking up:
 *
 *   Platform       people who run the platform. Created here, and the only
 *                  place platform scope is granted.
 *   Organisations  people who act for a tenant. The role belongs to the
 *                  membership, so it is always paired with an organisation.
 *   Students       people the platform exists for. Never created here — a
 *                  student registers themselves and builds a profile — so this
 *                  tab reads and suspends, and offers no way to add one.
 *
 * Only the super admin reaches any of it. Platform staff and compliance officers
 * find an account from Support access and cannot change what it may do. That is
 * refused in the route guard, in the identity service, and by the policy on
 * platform_role in the database.
 *
 * Nothing here deletes. Remove deactivates: an account is named by every
 * application it filed and every entry in the audit trail, and dropping the row
 * would either fail on those references or take the history with it. Erasing a
 * person is a data request, which answers a legal right rather than an
 * administrator's convenience.
 */

/* The platform creates an organisation's administrator and nobody else.
 *
 * Case workers, verifiers, reviewers and finance officers are added by that
 * administrator from their own People screen — which knows the organisation's
 * type and so offers only the roles it can hold, and which keeps who-does-what
 * inside a tenant a decision made inside that tenant. Offering the other six
 * here would mean the platform staffing somebody else's organisation, and doing
 * it through a typed-in name with no way to narrow the roles to the type.
 *
 * One consequence worth knowing: a membership is UNIQUE (user_id,
 * organisation_id), so naming somebody who is already a member moves them to
 * administrator rather than adding a second role.
 */
const ORG_ROLES: Role[] = [
  'NGO_ADMIN', 'CORPORATE_ADMIN', 'GOVT_DEPARTMENT_ADMIN',
]

type Tab = 'platform' | 'organisation' | 'student'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'platform', label: 'Platform', hint: 'Super admins, staff and compliance officers.' },
  { id: 'organisation', label: 'Organisations', hint: 'People acting for an NGO, a company or a department.' },
  { id: 'student', label: 'Students', hint: 'Applicants. They register themselves.' },
]

export default function Users() {
  const { context } = useAuth()
  const announce = useAnnounce()
  const [tab, setTab] = useState<Tab>('platform')
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PlatformUser | null>(null)

  const query = useQuery<PlatformUser[]>(
    signal => api.get('/admin/accounts', { q: search, kind: tab, limit: 50 }, signal),
    [search, tab],
  )

  // Guarded here as well as on the route. A super admin whose role is revoked
  // mid-session keeps a token that still claims it until it expires, and this is
  // better than a screen full of 403s.
  if (context?.role !== 'PLATFORM_SUPER_ADMIN') {
    return (
      <div className="card">
        <Empty
          title="Only the super admin manages users"
          hint="You can look an account up from Support access."
        />
      </div>
    )
  }

  const current = TABS.find(t => t.id === tab)!

  async function act(u: PlatformUser, what: 'suspend' | 'reinstate' | 'remove') {
    const who = u.email ?? u.phone ?? 'that account'
    try {
      if (what === 'remove') {
        await api.del(`/admin/accounts/${u.user_id}`)
        announce(`${who} is deactivated. Every role and session is gone.`, 'warn')
      } else {
        await api.patch(`/admin/accounts/${u.user_id}`, {
          status: what === 'suspend' ? 'SUSPENDED' : 'ACTIVE',
        })
        announce(
          what === 'suspend' ? `${who} is suspended and signed out.` : `${who} can sign in again.`,
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
          <h1>User management</h1>
          <p>{current.hint}</p>
        </div>
        {/* Students are not created here. They register, verify a contact
          * channel and build a profile — an account made from this side would
          * have no profile and the portal would have nowhere to send them. */}
        {tab !== 'student' && (
          <button className="primary" onClick={() => setAdding(true)}>
            {tab === 'platform' ? 'Add to platform' : 'Add an organisation admin'}
          </button>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Kind of user">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => { setTab(t.id); setEditing(null) }}
          >
            {t.label}
          </button>
        ))}
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

        {query.loading && !query.data && <Loading label="Loading users" />}
        {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}
        {query.data && query.data.length === 0 && (
          <Empty
            title={search ? 'Nothing matches that' : `No ${current.label.toLowerCase()} users`}
            hint={search ? 'Try part of an email address.' : undefined}
          />
        )}

        {!!query.data?.length && (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">{current.label} users</caption>
              <thead>
                <tr>
                  <th scope="col">Name or contact</th>
                  <th scope="col">Role</th>
                  {tab === 'organisation' && <th scope="col">Organisation</th>}
                  <th scope="col">Status</th>
                  <th scope="col">Last signed in</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {query.data.map(u => {
                  const dead = u.status === 'DEACTIVATED'
                  const roles = u.roles.filter(r =>
                    tab === 'platform' ? !r.organisation_id
                      : tab === 'organisation' ? r.organisation_id
                        : true)
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
                        {roles.length === 0 ? (
                          <span className="faint">{tab === 'student' ? 'Student' : 'None'}</span>
                        ) : (
                          <div className="pill-row">
                            {roles.map(r => (
                              <Pill
                                key={`${r.role}:${r.organisation_id ?? 'platform'}`}
                                tone={r.organisation_id ? 'neutral' : 'accent'}
                              >
                                {humanise(r.role)}
                              </Pill>
                            ))}
                          </div>
                        )}
                      </td>
                      {tab === 'organisation' && (
                        <td>
                          {roles.map(r => r.organisation_name).filter(Boolean).join(', ') || '—'}
                        </td>
                      )}
                      <td><StatusPill status={u.status} /></td>
                      <td className="nowrap">
                        {u.last_login_at ? date(u.last_login_at)
                          : <span className="faint">never</span>}
                      </td>
                      <td className="actions">
                        {/* Roles are editable on the platform tab only. An
                          * organisation's own administrator manages who does
                          * what inside it, from their People screen — reaching
                          * across into a tenant from here would put the platform
                          * inside the boundary the whole system exists to hold. */}
                        {tab === 'platform' && (
                          <button className="sm" onClick={() => setEditing(u)} disabled={dead}>
                            Roles<span className="sr-only"> for {u.email ?? u.phone}</span>
                          </button>
                        )}
                        {u.status === 'SUSPENDED' ? (
                          <button className="sm" onClick={() => act(u, 'reinstate')}>
                            Reinstate<span className="sr-only"> {u.email ?? u.phone}</span>
                          </button>
                        ) : (
                          <button className="sm" onClick={() => act(u, 'suspend')} disabled={dead}>
                            Suspend<span className="sr-only"> {u.email ?? u.phone}</span>
                          </button>
                        )}
                        <button className="sm danger" onClick={() => act(u, 'remove')} disabled={dead}>
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

      {adding && (
        <AddDialog
          kind={tab === 'platform' ? 'platform' : 'organisation'}
          onClose={() => setAdding(false)}
          onDone={msg => {
            setAdding(false)
            announce(msg, 'ok')
            query.reload()
          }}
        />
      )}

      {editing && (
        <RolesDialog
          user={editing}
          onClose={() => setEditing(null)}
          onChanged={msg => { announce(msg, 'ok'); query.reload() }}
          onDone={() => setEditing(null)}
        />
      )}
    </>
  )
}

/* Adding a user.
 *
 * One role, not a set. An account that needs several is created and then granted
 * the rest, so each grant is its own line in the audit trail rather than a list
 * buried inside one.
 */
function AddDialog({
  kind, onClose, onDone,
}: {
  kind: 'platform' | 'organisation'
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [org, setOrg] = useState('')
  const [role, setRole] = useState<Role>(kind === 'platform' ? 'PLATFORM_STAFF' : 'NGO_CASE_WORKER')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Typed, not chosen from a list, so nothing here knows the organisation's
  // type until the server resolves the name. The three admin roles are offered
  // and the service refuses a mismatch by name — "a NGO organisation cannot
  // hold that role" — rather than letting the database trigger surface as an
  // internal error.
  const roles = kind === 'platform' ? PLATFORM_ROLES : ORG_ROLES
  const ready = !!email && (kind === 'platform' || (!!org.trim() && !!role))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/accounts', {
        email,
        phone: phone || undefined,
        role,
        organisation: kind === 'organisation' ? org.trim() : undefined,
      })
      onDone(`${email} added as ${humanise(role).toLowerCase()}. A temporary password has been emailed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={kind === 'platform'
        ? 'Add someone to the platform'
        : 'Add an organisation administrator'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy || !ready}>
            {busy ? 'Saving…' : 'Create the account'}
          </button>
        </>
      }
    >
      {error && <div className="alert danger" role="alert">{error}</div>}

      {role === 'PLATFORM_SUPER_ADMIN' && (
        <div className="alert warn">
          <p>
            A super admin can manage every account on the platform, including
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

      {kind === 'organisation' && (
        <Field
          label="Organisation"
          required
          hint="Its name, exactly as it appears on the Organisations screen. An identifier works too."
        >
          {props => (
            <input
              {...props}
              type="text"
              autoComplete="off"
              value={org}
              onChange={e => setOrg(e.target.value)}
              placeholder="Sahyog Foundation"
            />
          )}
        </Field>
      )}

      <Field
        label="Role"
        required
        hint={kind === 'organisation'
          ? 'Administrators only. They add their own staff from their People screen.'
          : undefined}
      >
        {props => (
          <select
            {...props}
            value={role}
            onChange={e => setRole(e.target.value as Role)}
          >
            {roles.map(r => <option key={r} value={r}>{humanise(r)}</option>)}
          </select>
        )}
      </Field>
    </Dialog>
  )
}

/* Granting and revoking platform scope on an existing account. */
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
          Only an active account can hold a platform role. Reinstate it first.
        </p>
      )}

      <h3>Organisations</h3>
      {organisational.length === 0 ? (
        <p className="faint">Not a member of any organisation.</p>
      ) : (
        <ul className="plain">
          {organisational.map(r => (
            <li key={r.membership_id}>{humanise(r.role)} · {r.organisation_name}</li>
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
