import { useState } from 'react'

import * as api from '../lib/api'
import { useAnnounce } from '../lib/announce'
import { useAuth } from '../lib/auth-context'
import { useQuery } from '../lib/hooks'
import {
  LEVEL_HELP, SECTION_GROUPS, SECTION_LABELS, levelsFor, rank,
  type Level, type PermissionGrid, type PermissionRow, type Section,
} from '../lib/permissions'
import { roleLabel } from '../lib/roles'
import { ErrorState, Loading, Pill } from '../components/ui'
import type { Role } from '../lib/types'

/* Who may do what, as a grid.
 *
 * This screen replaced three hand-written lists that had drifted apart: the
 * route guards in the API, the `roles:` field on each sidebar entry, and a few
 * service methods checking the role again for themselves. They disagreed in
 * both directions — Ecosystem was super-admin-only in the menu and open to
 * every platform role at the endpoint, impersonation was the reverse — and
 * nobody had decided either. Two lists simply moved apart, and there was no
 * screen anywhere showing what the answer currently was.
 *
 * # It cannot grant anything
 *
 * Worth being clear about, because a screen full of permission checkboxes looks
 * like it holds the keys. Every endpoint behind these sections still carries the
 * role guard it always had, and this is checked in addition to it. So the worst
 * a mistake here can do is hide a screen from somebody who should have it —
 * visible in minutes, undone in two clicks. Ticking Manager on Users for
 * Technical does not make a read-only account able to grant roles; the guard
 * underneath still refuses it, and the tick is a promise the API will not keep.
 *
 * That is a real wart of the design and it is the right trade. The alternative
 * is this table being the only authority, where a mistyped row is a privilege
 * escalation nothing reports.
 *
 * # One request per checkbox
 *
 * Not a form with a Save button, deliberately. A whole-grid save lets a tab left
 * open for an hour silently revert eleven sections it was never shown — the
 * ordinary lost update, except the lost half is somebody's access. A cell at a
 * time cannot do that: two people working at once collide only on the same cell,
 * and the last write is a change one of them made on purpose.
 */

export default function Permissions() {
  const announce = useAnnounce()
  const { context } = useAuth()
  const query = useQuery<PermissionGrid>(
    signal => api.get('/admin/permissions', undefined, signal),
    [],
  )

  /* Which role's column is being read, on narrow screens.
   *
   * Eleven sections against five roles is 55 cells, which is a comfortable table
   * on a laptop and unusable at 400px. Rather than a horizontally scrolling grid
   * — where the row label scrolls away from the checkbox it labels, and a
   * screen-reader user loses the association entirely — the narrow layout shows
   * one role at a time. The selector is present at every width so it is not a
   * control that materialises on rotation.
   */
  const [focus, setFocus] = useState<Role | null>(null)

  /* Cells with a request in flight, keyed `ROLE:section`.
   *
   * Per cell rather than one busy flag for the screen, because a super admin
   * setting up a new role ticks a dozen boxes in a row and a global lock would
   * make each one wait for the last. The optimistic value is held here too, so
   * the checkbox moves under the pointer rather than after a round trip.
   */
  const [saving, setSaving] = useState<Record<string, Level>>({})
  const [error, setError] = useState<string | null>(null)

  if (query.loading) return <Loading label="Reading the permission grid" />
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return null

  const rows = query.data.roles
  const shown = focus ? rows.filter(r => r.role === focus) : rows

  function levelIn(row: PermissionRow, section: Section): Level {
    return saving[`${row.role}:${section}`] ?? row.sections[section] ?? 'NONE'
  }

  async function set(row: PermissionRow, section: Section, level: Level) {
    const key = `${row.role}:${section}`
    setSaving(s => ({ ...s, [key]: level }))
    setError(null)

    try {
      await api.put(`/admin/permissions/${row.role}/${section}`, { level })
      /* Reload rather than patch the row in place.
       *
       * The server is the one that decides what a cell holds — it refuses the
       * super admin's row, and it is where a future rule about one section
       * implying another would live. Trusting the optimistic value would show a
       * tick the server had declined, which on this screen means showing
       * somebody access they do not have. */
      query.reload()
      announce(
        `${roleLabel(row.role)} — ${SECTION_LABELS[section]}: `
        + `${level === 'NONE' ? 'no access' : levelWord(level)}. `
        + `${row.holders === 1 ? '1 account' : `${row.holders} accounts`} affected.`,
        'ok',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.')
    } finally {
      setSaving(s => {
        const next = { ...s }
        delete next[key]
        return next
      })
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Roles &amp; permissions</h1>
          <p>
            What each platform role may do in each section of this panel.
            A change applies to everybody holding the role, immediately.
          </p>
        </div>
      </div>

      {error && <div className="alert danger" role="alert">{error}</div>}

      {/* Said once, plainly, at the top.
        *
        * Somebody arriving here reasonably assumes this screen is the authority
        * on access. It is half of it, and the half that can only take away —
        * which matters most in the case where they tick Manager for a read-only
        * role, watch nothing change, and conclude the screen is broken. */}
      <div className="alert" role="note">
        <p>
          These narrow what a role may reach; they never widen it. A role that
          cannot write at all — Technical, for one — stays read-only however
          this grid is set, because the rule refusing it sits underneath.
        </p>
        <p>
          The super admin holds every section and cannot be lowered. Somebody
          has to be able to give the permissions back.
        </p>
      </div>

      <div className="toolbar">
        <label className="inline-field">
          <span>Show</span>
          <select
            value={focus ?? ''}
            onChange={e => setFocus((e.target.value || null) as Role | null)}
          >
            <option value="">Every role</option>
            {rows.map(r => (
              <option key={r.role} value={r.role}>{roleLabel(r.role)}</option>
            ))}
          </select>
        </label>
        {/* Your own row, named. Several people share the super admin and a
            support session borrows a role, so "you are looking at this as
            Super Admin" is not something the operator can assume. */}
        {context && (
          <p className="faint">
            You are signed in as {roleLabel(context.role)}.
          </p>
        )}
      </div>

      {SECTION_GROUPS.map(group => (
        <section key={group.label} className="perm-group">
          {/* The sidebar's own grouping, in the sidebar's order. A grid whose
              rows run differently from the menu they describe is one people
              mis-tick. */}
          <h2>{group.label}</h2>

          {group.sections.map(section => (
            <article key={section} className="perm-section">
              <h3 id={`sec-${section}`}>{SECTION_LABELS[section]}</h3>

              <div className="table-wrap">
                <table>
                  <caption className="sr-only">
                    {SECTION_LABELS[section]} — what each role may do
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Role</th>
                      {levelsFor(section).map(l => (
                        <th key={l} scope="col">{levelWord(l)}</th>
                      ))}
                      {/* The row shortcut. Not a fourth level: it ticks every
                          box in the row, which is the highest one. */}
                      <th scope="col">All</th>
                      <th scope="col">What that means</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(row => {
                      const held = levelIn(row, section)
                      const levels = levelsFor(section)
                      const top = levels[levels.length - 1]
                      const busy = Object.keys(saving)
                        .includes(`${row.role}:${section}`)

                      return (
                        <tr key={row.role}>
                          <th scope="row">
                            {roleLabel(row.role)}
                            {/* How many people this is about to be true for.
                                "Staff loses the grievance queue" reads
                                differently at 1 than at 14. */}
                            <span className="faint holders">
                              {row.holders === 1 ? '1 account' : `${row.holders} accounts`}
                            </span>
                            {!row.editable && <Pill tone="neutral">Fixed</Pill>}
                          </th>

                          {levels.map(level => (
                            <td key={level} className="perm-cell">
                              <label className="check">
                                <input
                                  type="checkbox"
                                  /* A ladder, not three flags. Checked when the
                                     held level reaches this rung, so Manager
                                     shows View and Edit ticked too — which is
                                     the truth, and stops somebody granting
                                     "may approve, may not look". */
                                  checked={rank(held) >= rank(level)}
                                  disabled={!row.editable || busy}
                                  onChange={e => set(
                                    row, section,
                                    /* Ticking a rung grants up to it; clearing
                                       one drops to the rung below, taking
                                       everything above with it. Clearing View
                                       is therefore NONE, which is what somebody
                                       unticking the first box means. */
                                    e.target.checked
                                      ? level
                                      : previousLevel(levels, level),
                                  )}
                                />
                                <span className="sr-only">
                                  {levelWord(level)} access to{' '}
                                  {SECTION_LABELS[section]} for {roleLabel(row.role)}
                                </span>
                              </label>
                            </td>
                          ))}

                          <td className="perm-cell">
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={held === top}
                                disabled={!row.editable || busy}
                                onChange={e => set(
                                  row, section, e.target.checked ? top : 'NONE',
                                )}
                              />
                              <span className="sr-only">
                                Everything in {SECTION_LABELS[section]} for{' '}
                                {roleLabel(row.role)}
                              </span>
                            </label>
                          </td>

                          {/* What the level currently held actually permits, in
                              the words of the acts it allows. "Manager" means
                              nothing on its own, and the whole risk of this
                              screen is a box ticked without its consequence
                              being pictured. */}
                          <td className="perm-meaning">
                            {held === 'NONE'
                              ? <span className="faint">
                                  Hidden from the sidebar, and its endpoints refuse.
                                </span>
                              : LEVEL_HELP[section][held] ?? levelWord(held)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      ))}
    </>
  )
}

/* The word on the checkbox.
 *
 * "Manager" rather than "Manage", because that is what it was asked for and
 * because it reads as a standing capacity rather than as one act — which is
 * what it is. The API's value stays MANAGE; a label is not a protocol.
 */
function levelWord(level: Level): string {
  switch (level) {
    case 'VIEW': return 'View'
    case 'EDIT': return 'Edit'
    case 'MANAGE': return 'Manager'
    default: return 'None'
  }
}

/** The rung below this one, or NONE when this is the first. */
function previousLevel(levels: Level[], level: Level): Level {
  const below = levels.filter(l => rank(l) < rank(level))
  return below.length === 0 ? 'NONE' : below[below.length - 1]
}
