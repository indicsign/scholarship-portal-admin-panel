import { Link } from 'react-router-dom'

import * as api from '../lib/api'
import { count } from '../lib/format'
import { ErrorState, Loading, Pill } from '../components/ui'
import { Stat } from '../components/charts'
import { useQuery } from '../lib/hooks'
import { useAuth } from '../lib/auth-context'
import type { Catalogue, GrievanceCounts, OrganisationCounts } from '../lib/types'

/* The dashboard for an administrator or a staff member.
 *
 * Not a smaller version of the super admin's. That one answers "is the platform
 * working" — money delivered, students reached, the shape of the funnel over a
 * period — which is a question for whoever answers for the platform, and it is
 * built on /admin/overview.
 *
 * This answers a different one: what is waiting for me. Every figure on it is
 * something the reader can act on from a screen they can actually reach, and
 * every tile is a link to that screen. A dashboard of numbers an operator
 * cannot do anything about is a report, and they did not ask for a report.
 *
 * It is composed from the same counts endpoints the queue screens use rather
 * than from a dashboard endpoint of its own. Three small requests against
 * indexes, and — the deciding reason — the figure here and the figure on the
 * screen it links to can never disagree, because they are the same query.
 */
export default function OperatorDashboard() {
  const { context } = useAuth()

  const catalogue = useQuery<Catalogue>(
    signal => api.get('/admin/scholarships', { page_size: 1 }, signal),
    [],
  )
  const orgs = useQuery<OrganisationCounts>(
    signal => api.get('/admin/organisations/counts', undefined, signal),
    [],
  )
  const grievances = useQuery<GrievanceCounts>(
    signal => api.get('/admin/grievances/counts', undefined, signal),
    [],
  )

  const loading = catalogue.loading || orgs.loading || grievances.loading
  /* The first failure, not all three. They fail together — a dead API or an
     expired session — and three copies of one message is three times the noise
     for the same information. */
  const error = catalogue.error ?? orgs.error ?? grievances.error

  if (loading && !catalogue.data && !orgs.data && !grievances.data) {
    return <Loading label="Loading your dashboard" />
  }

  const waiting = orgs.data?.pending ?? 0
  const overdue = grievances.data?.overdue ?? 0
  const live = grievances.data?.open ?? 0
  const drafts = catalogue.data?.counts.draft ?? 0

  /* What actually needs somebody, in the order it should be dealt with: a
     broken promise first, then a queue, then work that has no clock on it. */
  const attention = [
    overdue > 0 && {
      to: '/grievances',
      text: `${count(overdue)} grievance${overdue === 1 ? '' : 's'} past the date the student was promised an answer`,
      tone: 'danger' as const,
    },
    waiting > 0 && {
      to: '/organisations',
      text: `${count(waiting)} organisation${waiting === 1 ? '' : 's'} waiting for a decision`,
      tone: 'warn' as const,
    },
    drafts > 0 && {
      to: '/scholarships',
      text: `${count(drafts)} scholarship${drafts === 1 ? '' : 's'} still in draft`,
      tone: 'neutral' as const,
    },
  ].filter(Boolean) as { to: string; text: string; tone: 'danger' | 'warn' | 'neutral' }[]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>
            What is waiting on you. Every figure here links to the screen it
            came from, and each is counted live rather than reported for a
            period.
          </p>
        </div>
      </div>

      {error ? <ErrorState error={error} onRetry={() => {
        catalogue.reload(); orgs.reload(); grievances.reload()
      }} /> : null}

      {/* The list first, because it is the answer to the question. The tiles
          below are context for it. */}
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <header><h2>Needs attention</h2></header>
        <div style={{ padding: '0.75rem' }}>
          {attention.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nothing is waiting. No organisation is unanswered, no grievance is
              past its date, and every scholarship is either published or closed.
            </p>
          ) : (
            <ul className="plain">
              {attention.map(a => (
                <li key={a.to} className="row">
                  <Pill tone={a.tone}>{a.tone === 'danger' ? 'Overdue' : a.tone === 'warn' ? 'Waiting' : 'Unpublished'}</Pill>
                  <Link to={a.to}>{a.text}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid cols-4">
        <Stat
          label="Published scholarships"
          value={count(catalogue.data?.counts.published ?? 0)}
          sub={`${count(catalogue.data?.counts.total ?? 0)} in the catalogue altogether`}
        />
        <Stat
          label="Approved organisations"
          value={count(orgs.data?.approved ?? 0)}
          sub={waiting > 0
            ? `${count(waiting)} more waiting for a decision`
            : 'Nothing waiting for a decision'}
        />
        <Stat
          label="Live grievances"
          value={count(live)}
          sub={overdue > 0
            ? `${count(overdue)} past the promised date`
            : 'All inside their promise'}
        />
        <Stat
          label="Duplicate listings"
          value={count(catalogue.data?.counts.duplicates ?? 0)}
          sub="Sharing a title with another listing"
        />
      </div>

      {/* Said plainly rather than left to be discovered by an empty sidebar.
          Somebody who used to see the platform-wide figures and now does not
          should be told why, not left assuming something is broken. */}
      {context?.role !== 'SUPER_ADMIN' && (
        <p className="faint" style={{ fontSize: 12, marginTop: '0.75rem' }}>
          Platform-wide reporting — the ecosystem report, the audit trail and the
          money figures — is the super admin's view and is not shown here.
        </p>
      )}
    </>
  )
}
