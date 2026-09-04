import { useState } from 'react'

import * as api from '../lib/api'
import { DocumentsDialog } from './DocumentsDialog'
import { ApiError, errorDetail } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { date } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pill, StatusPill } from '../components/ui'
import { useDebounced, useQuery } from '../lib/hooks'
import { useAnnounce } from '../lib/announce'
import { PLATFORM_ROLES, PLATFORM_ROLE_GROUPS, roleLabel } from '../lib/roles'
import TemporaryPassword from '../components/TemporaryPassword'
import type { CreatedUser, PlatformUser, ResetResult, Role } from '../lib/types'

/* User management.
 *
 * Split into three because the three are governed differently, not because a
 * long list wanted breaking up:
 *
 *   Platform              people who run the platform. Created here, and the
 *                         only place platform scope is granted.
 *   Organisation members  people who act for a tenant. The role belongs to the
 *                         membership, so it is always paired with an
 *                         organisation. Named for the people rather than the
 *                         organisations because the sidebar's Organisations
 *                         section is the register of tenants, which is a
 *                         different screen answering a different question.
 *   Students              people the platform exists for. Never created here —
 *                         a student registers themselves and builds a profile —
 *                         so this tab reads and suspends, and offers no way to
 *                         add one.
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

/* The platform creates an organisation's first member and nobody else.
 *
 * Everyone after them is added by that person from their own People screen,
 * which keeps who-works-here a decision made inside the tenant rather than by
 * the platform staffing somebody else's organisation through a typed-in name.
 *
 * There is one role per kind of organisation, so this list is the four of them
 * and the choice is really the choice of organisation — which is why the
 * organisation-type select below sets it, and why picking one that disagrees
 * with the named organisation is refused by name rather than surfacing as a
 * database trigger.
 *
 * One consequence worth knowing: a membership is UNIQUE (user_id,
 * organisation_id), so naming somebody who is already a member changes their
 * organisation rather than adding a second membership.
 */
const ORG_ROLES: Role[] = ['NGO', 'CORPORATE', 'GOVT', 'PRIVATE']

/** The one role each organisation type can hold. */
const ADMIN_ROLE_FOR: Record<string, Role | undefined> = {
  NGO: 'NGO',
  CORPORATE: 'CORPORATE',
  GOVERNMENT: 'GOVT',
  PRIVATE: 'PRIVATE',
}

type Tab = 'platform' | 'organisation' | 'student'

/* empty is stated per tab rather than built from the label.
 *
 * It used to be `No ${label.toLowerCase()} users`, which worked while every
 * label was a noun that could take "users" after it. "Our team" cannot — "No
 * our team users" — and a label is a heading, not a fragment of a sentence
 * somewhere else. */
const TABS: { id: Tab; label: string; hint: string; empty: string }[] = [
  /* "Our team", not "Platform".
   *
   * The other two tabs are people outside the building; this is the only one
   * that is us, and the tab set reads as three categories of person either
   * way. "Platform" also collided with the platform-scope roles listed in the
   * hint, so the tab and its own contents were the same word. */
  { id: 'platform', label: 'Our team',
    hint: 'Super admins, staff and compliance officers.',
    empty: 'Nobody is on the team yet' },
  /* "Organisation members", not "Organisations". The sidebar has an
     Organisations section and it is a different thing — the register of tenants
     and the queue for approving them. This tab is the people who act for one,
     which is why it sits beside Our team and Students: all three are categories
     of person. */
  { id: 'organisation', label: 'Organisation members',
    hint: 'People acting for an NGO, a company, a department or a private body.',
    empty: 'No organisation members' },
  { id: 'student', label: 'Students', hint: 'Applicants. They register themselves.',
    empty: 'No students' },
]

export default function Users() {
  /* account as well as context, and only to recognise your own row.
   *
   * A Context is a role and never names the account holding it, which is fine
   * everywhere else on this screen and not here: the service refuses to
   * deactivate the caller's own account (DeactivateUser) and to revoke the
   * caller's own super admin role (RevokePlatformRole), so those two buttons
   * were doors that answer 409. Several people share a role and impersonation
   * borrows one, so the role alone cannot tell us whose row this is. */
  const { context, account } = useAuth()
  const announce = useAnnounce()
  const [tab, setTab] = useState<Tab>('platform')
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PlatformUser | null>(null)

  /* Who may see what, and who may change it.
   *
   * Ahead of the query, because activeTab below is in its dependency array and
   * that array is evaluated immediately — declaring it afterwards would be a
   * use-before-initialised error rather than untidiness.
   *
   * Guarded here as well as on the route and in the service. A role revoked
   * mid-session leaves a token that still claims it until it expires, and an
   * absent control is better than a screen of 403s.
   *
   * The platform tab is the super admin's alone: the server refuses that kind
   * for anybody else, so offering it would be a door that answers 403. An
   * administrator may act on the accounts they can see; a staff member reads
   * them. The service enforces the real rule from the account being written —
   * this only stops the panel offering what the API would refuse. */
  const superAdmin = context?.role === 'SUPER_ADMIN'
  const canManage = superAdmin || context?.role === 'ADMIN'

  const visibleTabs = superAdmin ? TABS : TABS.filter(t => t.id !== 'platform')

  /* 'platform' is the initial state, so a staff member would otherwise open by
     asking the server for the one list it refuses them. Derived rather than
     corrected by an effect, for the reason the queue screens give: a render,
     then a second render to undo it, with a frame where the two disagree. */
  const activeTab = visibleTabs.some(t => t.id === tab) ? tab : visibleTabs[0].id
  const current = visibleTabs.find(t => t.id === activeTab)!

  const query = useQuery<PlatformUser[]>(
    signal => api.get('/admin/accounts', { q: search, kind: activeTab, limit: 50 }, signal),
    [search, activeTab],
  )

  /* The student whose documents are open. Held by profile rather than by
     account: everything the vault knows is keyed on the profile, and an account
     that never became a student has none. */
  const [reviewing, setReviewing] = useState<PlatformUser | null>(null)

  /* A temporary password waiting to be read.
   *
   * Held here rather than inside the dialog that produced it, because the
   * AddDialog closes on success and its state goes with it. Losing this would
   * lose the only copy of the credential in existence — the row holds a hash and
   * the audit trail never records one. */
  const [credential, setCredential] = useState<{
    who: string
    password: string
    delivered: boolean
    reason?: string
  } | null>(null)

  async function act(
    u: PlatformUser,
    what: 'suspend' | 'reinstate' | 'remove' | 'signout' | 'reset' | 'reset-show',
  ) {
    const who = u.email ?? u.phone ?? 'that account'
    const wasDeactivated = u.status === 'DEACTIVATED'

    try {
      if (what === 'remove') {
        await api.del(`/admin/accounts/${u.user_id}`)
        announce(`${who} is deactivated. Every role and session is gone.`, 'warn')
      } else if (what === 'signout') {
        /* Sessions only, and never the password.
         *
         * This button used to call reset-password, which replaces the
         * credential and mails the new one — and for a while that mail could
         * not be sent at all, because MSG91 carried only the one-time-code
         * template. So every press destroyed an account: the password changed
         * and nobody was ever told the new one. It took the super admin twice
         * on 2026-09-04 before the pattern was visible.
         *
         * A reset template is registered now and the button below is back, but
         * this one stays and is still the right one nine times in ten: a shared
         * laptop, a device somebody no longer has, a session left open. It has
         * nothing to deliver, so it cannot half-succeed. */
        await api.post(`/admin/accounts/${u.user_id}/revoke-sessions`)
        announce(
          `${who} is signed out of every session. Their password is unchanged, `
          + 'so they can sign straight back in.',
          'ok',
        )
      } else if (what === 'reset' || what === 'reset-show') {
        /* The larger act: a new temporary password, emailed.
         *
         * The server sends the mail before it writes the password, so a failure
         * here means nothing changed and the account still signs in with what
         * it had — which is why the error is safe to show as-is rather than
         * hedged with "it may or may not have worked".
         *
         * Announced as "emailed", not "reset". What the operator needs to know
         * is that the credential now lives in somebody else's inbox and expires,
         * because the next question they get is "how long do I have". */
        /* Two ways, and the second is why an account is recoverable when
         * email is not working at all.
         *
         * `reset` mails it and changes nothing if the mail fails — the ordering
         * that stops a reset destroying the account it was run on.
         * `reset-show` does not mail it and hands it back once, for the operator
         * to deliver themselves. The server records which happened. */
        const res = await api.post<ResetResult>(
          `/admin/accounts/${u.user_id}/reset-password`,
          { delivery: what === 'reset-show' ? 'show' : 'email' },
        )

        if (res.data.reset.temporary_password) {
          setCredential({
            who,
            password: res.data.reset.temporary_password,
            delivered: false,
          })
        }
        announce(res.data.message, 'ok')
      } else {
        await api.patch(`/admin/accounts/${u.user_id}`, {
          status: what === 'suspend' ? 'SUSPENDED' : 'ACTIVE',
        })
        announce(
          what === 'suspend' ? `${who} is suspended and signed out.`
            /* Bringing back a deactivated account is not the same act as
               reinstating a suspended one, and saying so matters: deactivation
               revoked every role on the way out and this does not put them
               back, so somebody told only "can sign in again" would expect them
               to be able to work. */
            : wasDeactivated
              ? `${who} is active again — but their roles were revoked when the account was deactivated. Grant them again before they can do anything.`
              : `${who} can sign in again.`,
          what === 'suspend' ? 'warn' : 'ok',
        )
      }
      query.reload()
    } catch (err) {
      announce(errorDetail(err, 'It could not be saved.'), 'danger')
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
        {/* Creating an account is the super admin's, whichever kind it is: the
          * same route makes both, so offering it to an administrator would be a
          * way to create a platform account from the organisation tab. An
          * administrator gets a tenant's first member through approving the
          * organisation, which creates one for them. */}
        {superAdmin && activeTab !== 'student' && (
          <button className="primary" onClick={() => setAdding(true)}>
            {activeTab === 'platform' ? 'Add to our team' : 'Add an organisation admin'}
          </button>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Kind of user">
        {visibleTabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={activeTab === t.id ? 'tab active' : 'tab'}
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
            title={search ? 'Nothing matches that' : current.empty}
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
                  {activeTab === 'organisation' && <th scope="col">Organisation</th>}
                  <th scope="col">Status</th>
                  <th scope="col">Last signed in</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {query.data.map(u => {
                  const dead = u.status === 'DEACTIVATED'
                  /* Your own row. Suspend and Remove are absent on it, for the
                     reason the staff case gives above: the service refuses both
                     — "You cannot deactivate your own account." — and a button
                     that reports that back is a button that should not have
                     been there. Everything else stays: granting yourself a
                     second role is allowed, and so is being handed a password.

                     This is the panel half of the rule. The service is the
                     half that matters, and it also refuses to revoke the last
                     super admin from anybody, which is the case this cannot
                     see from one row. */
                  const isSelf = !!account && u.user_id === account.user_id
                  const roles = u.roles.filter(r =>
                    activeTab === 'platform' ? !r.organisation_id
                      : activeTab === 'organisation' ? r.organisation_id
                        : true)
                  return (
                    <tr key={u.user_id}>
                      {/* The name leads where there is one.

                          It used to be the email or, failing that, the phone
                          number — which for a student who registered by mobile
                          and never gave an address meant the row read "+9178…"
                          and nothing else. Four such rows are indistinguishable,
                          and each carries a Documents button whose contents are
                          somebody's disability certificate. The contact detail
                          stays underneath, because it is what an operator
                          searches by and what they read out on a support call. */}
                      <th scope="row" style={{ fontWeight: 600 }}>
                        {u.full_name ?? u.email ?? u.phone ?? '—'}
                        {(u.full_name || (u.email && u.phone)) && (
                          <div className="faint" style={{ fontWeight: 400, fontSize: 12 }}>
                            {[u.full_name && u.email, u.phone]
                              .filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </th>
                      <td>
                        {roles.length === 0 ? (
                          <span className="faint">{activeTab === 'student' ? 'Student' : 'None'}</span>
                        ) : (
                          <div className="pill-row">
                            {roles.map(r => (
                              <Pill
                                key={`${r.role}:${r.organisation_id ?? 'platform'}`}
                                tone={r.organisation_id ? 'neutral' : 'accent'}
                              >
                                {roleLabel(r.role)}
                              </Pill>
                            ))}
                          </div>
                        )}
                      </td>
                      {activeTab === 'organisation' && (
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
                        {/* Enabled on a deactivated account too. Deactivation
                          * revoked every role, so this is exactly where somebody
                          * bringing an account back needs to grant them again —
                          * disabling it made the revival useless. */}
                        {activeTab === 'platform' && (
                          <button className="sm" onClick={() => setEditing(u)}>
                            Roles<span className="sr-only"> for {u.email ?? u.phone}</span>
                          </button>
                        )}
                        {/* Only where there is a student profile behind the
                          * account. An operator cannot review documents that
                          * cannot exist, and a button that opens an empty
                          * dialog is worse than no button. */}
                        {u.profile_id && (
                          <button className="sm" onClick={() => setReviewing(u)}>
                            Documents
                            <span className="sr-only"> for {u.email ?? u.phone}</span>
                          </button>
                        )}
                        {/* Absent rather than disabled for a staff member. A
                          * greyed-out Suspend invites the question of how to
                          * enable it; nothing there says the answer is "not with
                          * this account". The service refuses it regardless, and
                          * refuses an administrator acting on a platform account
                          * whatever this renders. */}
                        {canManage && (
                          <>
                            {/* A shared or forgotten laptop, a device somebody no
                              * longer has, a session that should not still be
                              * open. Every session goes and the credential stays,
                              * so the account's owner is inconvenienced by one
                              * sign-in rather than locked out.
                              *
                              * Kept first, and kept distinct from the reset
                              * beside it, because it is the smaller act and the
                              * one wanted for every case above. A reset takes the
                              * account away from whoever holds it and depends on
                              * a mail arriving; this depends on nothing.
                              *
                              * Absent for a deactivated account, which has no
                              * sessions to end. */}
                            {!dead && (
                              <button className="sm" onClick={() => act(u, 'signout')}>
                                Sign out everywhere
                                <span className="sr-only">
                                  {' '}— ends every session for {u.email ?? u.phone},
                                  leaving their password unchanged
                                </span>
                              </button>
                            )}

                            {/* A forgotten password, and only that.
                              *
                              * This button was removed for a while, and the
                              * reason is worth keeping: the mail carrying the new
                              * password could not be sent at all, so pressing it
                              * replaced the credential and told nobody, which is
                              * how the platform lost its only super admin twice
                              * in one morning. MSG91 holds a reset template now,
                              * and the server sends before it writes — a mail
                              * that cannot be sent leaves the password alone.
                              *
                              * Absent for a deactivated account: it has no
                              * business being handed a credential, and the
                              * service refuses it. Absent for your own row too —
                              * the reset is delivered to the address on the
                              * account, so resetting your own signs you out and
                              * asks you to fetch a password out of your inbox to
                              * get back to a screen you were already on. Account
                              * settings is where to change your own.
                              *
                              * And absent without an email address, which a
                              * student who signed up by mobile has none of. The
                              * service refuses that case rather than setting a
                              * password nobody can ever learn, so the button
                              * would be a door that answers 409. */}
                            {!dead && !isSelf && u.email && (
                              <button className="sm" onClick={() => act(u, 'reset')}>
                                Reset password
                                <span className="sr-only">
                                  {' '}— emails {u.email} a temporary password
                                  lasting 24 hours and signs out every session
                                </span>
                              </button>
                            )}

                            {/* The same act, delivered by hand.
                              *
                              * This is the way back into an account when email
                              * is not working — which is not a hypothetical
                              * here. On 2026-09-05 every invitation and reset
                              * was delivered carrying no password at all,
                              * because the registered template was a
                              * "your password has been changed" notice, and two
                              * accounts had no route back in at all.
                              *
                              * Beside the emailed button rather than replacing
                              * it, and second, because emailing is still the
                              * right default: it puts the credential in the
                              * account's own inbox rather than on a screen and
                              * in somebody's memory. This one is for when that
                              * has demonstrably failed.
                              *
                              * Super admin only, in the panel and in the
                              * service. Emailing sends the password where only
                              * its owner can read it, which is what makes it
                              * safe for an administrator; reading it out turns
                              * "reset somebody's password" into "take somebody's
                              * account". */}
                            {!dead && !isSelf && superAdmin && (
                              <button className="sm" onClick={() => act(u, 'reset-show')}>
                                Reset &amp; show
                                <span className="sr-only">
                                  {' '}— sets a new temporary password for
                                  {' '}{u.email ?? u.phone} and shows it here
                                  instead of emailing it
                                </span>
                              </button>
                            )}

                            {/* Reinstate covers both ways back: a suspended
                              * account resumes with what it had, a deactivated
                              * one comes back with its roles still revoked. The
                              * announcement says which happened. */}
                            {u.status === 'SUSPENDED' || dead ? (
                              <button className="sm" onClick={() => act(u, 'reinstate')}>
                                {dead ? 'Bring back' : 'Reinstate'}
                                <span className="sr-only"> {u.email ?? u.phone}</span>
                              </button>
                            ) : !isSelf && (
                              <button className="sm" onClick={() => act(u, 'suspend')}>
                                Suspend<span className="sr-only"> {u.email ?? u.phone}</span>
                              </button>
                            )}

                            {/* Nothing to remove from an account already
                              * deactivated; the service refuses a second one.
                              * Nor from your own, which it also refuses. */}
                            {!dead && !isSelf && (
                              <button className="sm danger" onClick={() => act(u, 'remove')}>
                                Remove<span className="sr-only"> {u.email ?? u.phone}</span>
                              </button>
                            )}
                          </>
                        )}
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
          kind={activeTab === 'platform' ? 'platform' : 'organisation'}
          onClose={() => setAdding(false)}
          onCredential={setCredential}
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

      {credential && (
        <TemporaryPassword
          who={credential.who}
          password={credential.password}
          delivered={credential.delivered}
          reason={credential.reason}
          onClose={() => setCredential(null)}
        />
      )}

      {reviewing?.profile_id && (
        <DocumentsDialog
          profileID={reviewing.profile_id}
          who={reviewing.email ?? reviewing.phone ?? 'this student'}
          onClose={() => setReviewing(null)}
          onDone={(msg, tone) => announce(msg, tone ?? 'ok')}
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
  kind, onClose, onDone, onCredential,
}: {
  kind: 'platform' | 'organisation'
  onClose: () => void
  onDone: (message: string) => void
  /* Raised to the page rather than shown here, because this dialog unmounts on
     success and the password would go with it. */
  onCredential: (c: {
    who: string; password: string; delivered: boolean; reason?: string
  }) => void
}) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [org, setOrg] = useState('')
  // Empty means "it must already exist". Choosing a type says "create it if it
  // does not", which is the only way to add an organisation that has not
  // registered itself — and the super admin choosing it is the approval.
  const [orgType, setOrgType] = useState('')
  const [role, setRole] = useState<Role>(kind === 'platform' ? 'STAFF' : 'NGO')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The API answers a validation failure with a message *and* a map of which
  // field failed and why. Showing only the message leaves "some of the details
  // need attention" on screen with nothing saying which detail, which is no
  // better than saying nothing.
  const [fields, setFields] = useState<Record<string, string>>({})

  // Typed, not chosen from a list, so nothing here knows the organisation's
  // type until the server resolves the name. All four roles are offered and the
  // service names the one that fits — "this organisation's members hold the NGO
  // role" — rather than letting the database trigger surface as an internal
  // error.
  const roles = kind === 'platform' ? PLATFORM_ROLES : ORG_ROLES
  const ready = !!email && (kind === 'platform' || (!!org.trim() && !!role))

  async function save() {
    setBusy(true)
    setError(null)
    setFields({})
    try {
      const res = await api.post<CreatedUser>('/admin/accounts', {
        email,
        phone: phone || undefined,
        role,
        organisation: kind === 'organisation' ? org.trim() : undefined,
        organisation_type: kind === 'organisation' && orgType ? orgType : undefined,
      })

      /* What actually happened, rather than what usually happens.
       *
       * This line used to read "A temporary password has been emailed", printed
       * unconditionally the moment the account was created and before anything
       * was known about the send. It was wrong twice over on 2026-09-05: the
       * mail was delivered and carried no password, and the panel said so
       * confidently while two accounts sat unusable.
       *
       * `sent` is false for an address that already had an account — no password
       * is minted for one, and telling its owner their password had changed
       * would be a lie in the other direction. */
      const { invitation } = res.data
      const who = `${email} added as ${roleLabel(role).toLowerCase()}.`

      if (!invitation.sent) {
        onDone(`${who} They already had an account, so they keep the password `
          + 'they sign in with.')
      } else if (invitation.delivered) {
        onDone(`${who} A temporary password has been emailed — check the copy `
          + 'below before passing it on.')
      } else {
        onDone(`${who} The email could not be sent, so pass the password below `
          + 'on yourself.')
      }

      if (invitation.temporary_password) {
        onCredential({
          who: email,
          password: invitation.temporary_password,
          delivered: invitation.delivered,
          reason: invitation.reason,
        })
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields)
      setError(err instanceof Error ? err.message : 'It could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      /* "our team" rather than "the platform".
       *
       * The platform is the thing these people run; it is not the thing they
       * join. Every other account on this screen belongs to somebody outside
       * the building — a publisher's staff, a student — and this tab is the
       * only one that is us, which is worth saying in the words rather than
       * leaving to the tab label. */
      title={kind === 'platform'
        ? 'Add someone to our team'
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

      {kind === 'organisation' && orgType && org.trim() && (
        <div className="alert warn">
          <p>
            No approved organisation is named “{org.trim()}”, so it will be
            created as {orgType === 'GOVERNMENT' ? 'a government department'
              : orgType === 'CORPORATE' ? 'a company'
              : orgType === 'PRIVATE' ? 'a private organisation'
              : 'an NGO'} and approved, with this person as its first member.
            They then add everybody else.
          </p>
        </div>
      )}

      {role === 'SUPER_ADMIN' && (
        <div className="alert warn">
          <p>
            A super admin can manage every account on the platform, including
            yours, and can grant this same role to anybody else.
          </p>
        </div>
      )}

      <Field
        label="Email address"
        required
        error={fields.email}
        hint="Where the temporary password and every sign-in code go."
      >
        {props => (
          <input {...props} type="email" autoComplete="off" value={email}
            onChange={e => setEmail(e.target.value)} />
        )}
      </Field>

      <Field
        label="Mobile number"
        error={fields.phone}
        hint="Optional. An Indian mobile number, used for notices, not for signing in."
      >
        {props => (
          <input {...props} type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        )}
      </Field>

      {kind === 'organisation' && (
        <Field
          label="Organisation"
          required
          error={fields.organisation}
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

      {kind === 'organisation' && (
        <Field
          label="If it does not exist yet, create it as"
          error={fields.organisation_type}
          hint="Leave blank to require an organisation that is already approved."
        >
          {props => (
            <select
              {...props}
              value={orgType}
              onChange={e => {
                setOrgType(e.target.value)
                // The admin role is decided by the type, so keep the two in
                // step rather than letting a mismatch be submitted.
                const forType = ADMIN_ROLE_FOR[e.target.value]
                if (forType) setRole(forType)
              }}
            >
              <option value="">It already exists</option>
              <option value="NGO">NGO</option>
              <option value="CORPORATE">Corporate</option>
              <option value="GOVERNMENT">Government department</option>
              <option value="PRIVATE">Private organisation</option>
            </select>
          )}
        </Field>
      )}

      <Field
        label="Role"
        required
        error={fields.role}
        hint={kind === 'organisation'
          ? 'Set by the kind of organisation. They add everybody else themselves.'
          : undefined}
      >
        {/* Grouped for a platform account, flat for an organisation — which
            offers exactly one role, and an <optgroup> around a single option is
            a heading explaining nothing.

            roleLabel, not humanise: humanise leaves any all-caps word of five
            letters or fewer alone on the assumption it is an acronym, so this
            list read ADMIN, STAFF and GOVT while the table beside it read
            Admin, Staff and Government. roles.ts says as much in the comment
            over ROLE_LABELS; these two selects were the callers that never got
            the message. */}
        {props => (
          <select
            {...props}
            value={role}
            onChange={e => setRole(e.target.value as Role)}
          >
            {kind === 'platform'
              ? PLATFORM_ROLE_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.roles.map(r => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </optgroup>
              ))
              : roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
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
  const { account } = useAuth()
  const [role, setRole] = useState<Role>('STAFF')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const who = user.email ?? user.phone ?? 'this account'
  /* Revoking your own super admin is refused by the service, so it is not
   * offered. Granting is untouched — adding a second super admin is exactly how
   * you are meant to hand the role on before giving up your own, and the
   * service refuses to leave the platform without one either way. */
  const isSelf = !!account && user.user_id === account.user_id
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
              <span>{roleLabel(r.role)}</span>
              {isSelf && r.role === 'SUPER_ADMIN' ? (
                /* Said rather than left blank. An empty space where every other
                   row has a button reads as a rendering fault, and the reason
                   is the useful part: grant it to somebody else and they can
                   take yours. */
                <span className="faint">Yours — grant it to somebody else first</span>
              ) : (
                <button
                  className="sm danger"
                  disabled={busy}
                  onClick={() => run(
                    () => api.del(`/admin/accounts/${user.user_id}/platform-roles/${r.role}`),
                    `${roleLabel(r.role)} taken away from ${who}.`,
                  )}
                >
                  Revoke<span className="sr-only"> {roleLabel(r.role)}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {grantable.length > 0 && user.status === 'ACTIVE' && (
        <>
          <Field label="Grant another platform role">
            {props => (
              /* Same grouping as the add form, minus what this account already
                 holds — and a group whose whole contents are held disappears
                 rather than becoming an empty heading. */
              <select {...props} value={role} onChange={e => setRole(e.target.value as Role)}>
                {PLATFORM_ROLE_GROUPS.map(g => {
                  const offer = g.roles.filter(r => grantable.includes(r))
                  return offer.length === 0 ? null : (
                    <optgroup key={g.label} label={g.label}>
                      {offer.map(r => (
                        <option key={r} value={r}>{roleLabel(r)}</option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            )}
          </Field>
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(
              () => api.post(`/admin/accounts/${user.user_id}/platform-roles`, { role }),
              `${who} is now ${roleLabel(role).toLowerCase()}.`,
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
            <li key={r.membership_id}>{roleLabel(r.role)} · {r.organisation_name}</li>
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
