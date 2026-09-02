import { useState } from 'react'

import * as api from '../lib/api'
import { compact, count, date, money } from '../lib/format'
import { ErrorState, Loading } from '../components/ui'
import { Bars, Columns, Stat, type BarRow } from '../components/charts'
import { useQuery } from '../lib/hooks'
import { useAuth } from '../lib/auth-context'
import OperatorDashboard from './OperatorDashboard'
import type { OverviewReport } from '../lib/types'

/* The operations dashboard.
 *
 * What the internal team asked for, in the order they asked for it: how many
 * students are here, how many are still looking, who they are, what is on
 * offer, what has been applied for, and what has actually been paid.
 *
 * Two things about it are deliberate.
 *
 * It leads with money delivered rather than with students registered. The
 * report's problem statement is that the funds already exist and the
 * connection to them does not, so the number that says whether this platform
 * is working is the one at the end of that chain, not the one at the start.
 * Registrations are the input; rupees in a student's account are the output.
 *
 * And it separates stock from flow. "Registered students" is true as of now;
 * "new scholarships" is only meaningful against a period. Mixing the two on
 * one row of tiles is how a dashboard gets quoted wrongly in a meeting, so the
 * windowed figures carry the window in their own label and the standing ones
 * do not.
 */

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
  { days: 0, label: 'All time' },
] as const

/* Two dashboards behind one route.
 *
 * The nav has a single Dashboard entry for everybody, and what it renders
 * depends on who is reading. This one is the platform's own report — money
 * delivered, students reached, the funnel over a period — which is the question
 * whoever answers for the platform asks. An administrator or a staff member is
 * asking a different one, and OperatorDashboard answers it.
 *
 * Branching here rather than in the router keeps the route table saying what
 * URLs exist rather than who may see them, and means neither component has to
 * know the other exists. */
export default function Dashboard() {
  const { context } = useAuth()
  if (context?.role !== 'SUPER_ADMIN') return <OperatorDashboard />
  return <PlatformDashboard />
}

function PlatformDashboard() {
  const [days, setDays] = useState(30)

  const query = useQuery<{ report: OverviewReport; note: string }>(
    signal => api.get('/admin/overview', { days }, signal),
    [days],
  )

  if (query.loading && !query.data) return <Loading label="Building the dashboard" />
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return null

  const r = query.data.report
  // "in the last all time" is not a sentence. Every windowed phrase on the
  // page goes through this rather than interpolating the label directly.
  const inWindow = r.window.days === 0
    ? 'since the platform opened'
    : `in the last ${r.window.label.toLowerCase().replace('last ', '')}`
  const windowHeading = r.window.days === 0
    ? 'Movement since the platform opened'
    : `Movement ${inWindow}`

  // The funnel's own first stage is not the population — an application that
  // reached "under review" is no longer counted under "submitted" — so the
  // bars are scaled against the total rather than against the tallest stage.
  const funnelRows: BarRow[] = r.applications.funnel
    .filter(f => f.count > 0)
    .map(f => ({
      key: f.state,
      label: f.label,
      value: f.count,
      muted: f.state === 'REJECTED' || f.state === 'WITHDRAWN',
    }))

  const segmentRows = (rows: OverviewReport['by_state']): BarRow[] =>
    rows.map(s => ({
      key: s.key,
      label: s.label,
      value: s.count,
      note: s.amount
        ? `${count(s.amount)} applied`
        : 'none have applied yet',
    }))

  return (
    <div className={query.stale ? 'stale' : undefined} aria-busy={query.stale || undefined}>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>
            Live operational figures for the internal team. Counted from
            records as they stand and not suppressed, so this is the working
            view rather than the publishable one — the anonymised report fit
            for sharing outside is <a href="/ecosystem">Ecosystem</a>.
          </p>
        </div>

        <div className="field" style={{ margin: 0, minWidth: '10rem' }}>
          <label htmlFor="window">Period</label>
          <select
            id="window"
            data-primary-filter
            value={days}
            onChange={e => setDays(Number(e.target.value))}
          >
            {WINDOWS.map(o => (
              <option key={o.days} value={o.days}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="stack">
        {/* The one figure the view leads with. */}
        <div className="grid cols-2">
          <Stat
            hero
            label="Financial assistance facilitated"
            value={money(r.outcomes.amount_disbursed)}
            sub={
              <>
                Paid to {count(r.outcomes.beneficiaries)} beneficiar
                {r.outcomes.beneficiaries === 1 ? 'y' : 'ies'}
                {r.outcomes.average_award > 0 &&
                  `, averaging ${money(r.outcomes.average_award)} each`}
                . {money(r.outcomes.amount_disbursed_in_window)} of it {inWindow}.
              </>
            }
          />
          <Stat
            hero
            label="Sanctioned and awaiting payment"
            value={money(r.outcomes.amount_sanctioned - r.outcomes.amount_disbursed)}
            sub={
              <>
                {money(r.outcomes.amount_sanctioned)} committed in total;{' '}
                {r.outcomes.disbursement_rate_percent}% of it has reached a bank
                account. The gap is money promised to a student and not yet sent.
              </>
            }
          />
        </div>

        {/* Standing figures: true as of now, not windowed. */}
        <div className="card">
          <header>
            <h2>As of now</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Generated {date(r.generated_at)}
            </span>
          </header>
          <div className="grid cols-4" style={{ padding: '0.25rem' }}>
            <Stat
              label="Registered students"
              value={compact(r.students.registered)}
              sub={`${count(r.students.profile_complete)} with a profile complete enough to match`}
            />
            <Stat
              label="Actively looking"
              value={compact(r.students.active)}
              sub={`Signed in or moved an application ${inWindow}`}
            />
            <Stat
              label="Awaiting a decision"
              value={compact(r.students.seeking)}
              sub="Students holding an application nobody has decided yet"
            />
            <Stat
              label="Never applied"
              value={compact(r.students.never_applied)}
              sub="Registered, matched, and has not applied to anything"
            />
            <Stat
              label="Scholarships listed"
              value={compact(r.scholarships.listed)}
              sub={`${count(r.scholarships.open_now)} open to applications now, ${count(r.scholarships.closing_soon)} closing within a fortnight`}
            />
            <Stat
              label="Applications generated"
              value={compact(r.applications.total)}
              sub={`${count(r.applications.in_flight)} still with a provider`}
            />
            <Stat
              label="Scholarships availed"
              value={compact(r.outcomes.availed)}
              sub={`Awards actually made, to ${count(r.outcomes.beneficiaries)} distinct students`}
            />
            <Stat
              label="Beneficiaries"
              value={compact(r.outcomes.beneficiaries)}
              sub="Students who have been awarded at least one scholarship"
            />
          </div>
        </div>

        {/* Windowed figures: movement, labelled with the period. */}
        <div className="card">
          <header>
            <h2>{windowHeading}</h2>
          </header>
          <div className="grid cols-4" style={{ padding: '0.25rem' }}>
            <Stat label="New students" value={compact(r.students.new)} />
            <Stat label="New scholarships" value={compact(r.scholarships.new)} />
            <Stat label="New applications" value={compact(r.applications.new)} />
            <Stat label="Newly sanctioned" value={money(r.outcomes.amount_sanctioned_in_window)} />
          </div>
        </div>

        {/* Four measures, four scales, four frames. Putting registrations and
            rupees on one pair of axes would need a second y-scale, which is
            the one thing a time series must not have. */}
        <div className="card">
          <header>
            <h2>Month by month</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Each chart has its own scale
            </span>
          </header>
          <div className="grid cols-4" style={{ padding: '0.75rem' }}>
            <Columns
              title="Students registered"
              points={r.trend.map(t => ({ label: t.label, value: t.students }))}
            />
            <Columns
              title="Scholarships published"
              points={r.trend.map(t => ({ label: t.label, value: t.scholarships }))}
            />
            <Columns
              title="Applications submitted"
              points={r.trend.map(t => ({ label: t.label, value: t.applications }))}
            />
            <Columns
              title="Disbursed"
              points={r.trend.map(t => ({ label: t.label, value: t.disbursed }))}
              format={compact}
            />
          </div>
        </div>

        <div className="card">
          <header>
            <h2>Application funnel</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              {count(r.applications.total)} submitted, all time
            </span>
          </header>
          {funnelRows.length === 0 ? (
            <div className="state">Nothing has been submitted yet.</div>
          ) : (
            <Bars
              caption="Applications by workflow state"
              headLabel="Stage"
              headValue="Applications"
              rows={funnelRows}
              max={r.applications.total}
            />
          )}
        </div>

        <div className="grid cols-2">
          <div className="card">
            <header>
              <h2>Students by education level</h2>
            </header>
            <Bars
              caption="Registered students by course level"
              headLabel="Level"
              headValue="Students"
              rows={segmentRows(r.by_education_level)}
            />
          </div>

          <div className="card">
            <header>
              <h2>Students by disability category</h2>
              <span className="muted" style={{ fontSize: 12 }}>
                Of the twenty-one the Act recognises
              </span>
            </header>
            <Bars
              caption="Registered students by disability category"
              headLabel="Category"
              headValue="Students"
              rows={segmentRows(r.by_disability)}
            />
          </div>
        </div>

        <div className="card">
          <header>
            <h2>Students by state</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Where the platform has and has not reached
            </span>
          </header>
          <Bars
            caption="Registered students by state or union territory"
            headLabel="State or union territory"
            headValue="Students"
            rows={segmentRows(r.by_state)}
          />
        </div>

        <p className="faint" style={{ fontSize: 12, margin: 0 }}>
          {query.data.note}
        </p>
      </div>
    </div>
  )
}
