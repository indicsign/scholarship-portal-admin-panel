import * as api from '../lib/api'
import { count, date, money } from '../lib/format'
import { Empty, ErrorState, Loading, Pill } from '../components/ui'
import { Stat } from '../components/charts'
import { useQuery } from '../lib/hooks'
import type { EcosystemReport, Underserved } from '../lib/types'

/* The ecosystem view (FR-16).
 *
 * Section 4.3.5 calls this the system's most significant long-term asset: the
 * first aggregate picture of where disability scholarship funding reaches and
 * where it does not. No individual provider can see it, because no provider
 * sees another's applicants.
 *
 * The screen is built around the two halves of the same problem — students who
 * are not reached, and money that is not spent — because either one alone
 * invites the wrong conclusion.
 */

export default function Ecosystem() {
  const query = useQuery<{ report: EcosystemReport; note: string }>(
    signal => api.get('/admin/ecosystem', undefined, signal),
    [],
  )

  if (query.loading) return <Loading label="Building the ecosystem report" />
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return null

  const { report, note } = query.data
  const t = report.totals

  /* Defaulted, though the API is also fixed not to send null.
   *
   * The declared type is Underserved[], so nothing in the typecheck stands
   * between a null on the wire and .filter on the next line — and the panel has
   * no error boundary, so that throw unmounts the root and blanks every screen,
   * not this one. A report is not worth the whole panel. */
  const byDisability = report.underserved_by_disability ?? []
  const byDistrict = report.underserved_by_district ?? []
  const undersubscribed = report.undersubscribed_schemes ?? []

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ecosystem</h1>
          <p>
            Aggregate and anonymised, across every organisation on the platform.
            Generated {date(report.generated_at)}.
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="grid cols-4">
          <Stat label="Students" value={count(t.students)} />
          <Stat label="Organisations" value={count(t.organisations)} />
          <Stat label="Open scholarships" value={count(t.scholarships)} />
          <Stat label="Applications" value={count(t.applications)} />
          <Stat label="Sanctioned" value={money(t.amount_sanctioned)} />
          <Stat
            label="Disbursed"
            value={money(t.amount_disbursed)}
            sub={t.amount_sanctioned > 0
              ? `${Math.round((t.amount_disbursed / t.amount_sanctioned) * 100)}% of sanctioned`
              : undefined}
          />
        </div>

        {/* The platform's central claim, measured. If verification is not being
            reused, the thing this system exists to do is not happening. */}
        <div className="card">
          <header><h2>Verification reuse</h2></header>
          <div className="grid cols-4" style={{ padding: '0.25rem' }}>
            <Stat
              label="Attestations issued"
              value={count(report.verification_reuse.attestations_issued)}
            />
            <Stat
              label="Times reused"
              value={count(report.verification_reuse.times_reused)}
              sub="Consumed by an application without re-verification"
            />
            <Stat
              label="Reuse ratio"
              value={report.verification_reuse.reuse_ratio.toFixed(2)}
              sub="Applications served per attestation issued"
            />
          </div>
        </div>

        <div className="grid cols-2">
          <UnderservedTable
            title="Under-served by disability"
            caption="Students on the platform against sanctions received. A low ratio means the students are here and the funding is not reaching them."
            rows={byDisability}
            note={note}
          />
          <UnderservedTable
            title="Under-served by district"
            caption="The same measure by place."
            rows={byDistrict}
            note={note}
          />
        </div>

        <div className="card">
          <header>
            <h2>Under-subscribed schemes</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Open, funded, and short of applicants
            </span>
          </header>

          {undersubscribed.length === 0 ? (
            <Empty title="Nothing under-subscribed" hint="Every open scheme has its budget committed." />
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  Open schemes with uncommitted budget, most unused first
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Scheme</th>
                    <th scope="col">Offered by</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Budget unused</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Applicants</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Closes</th>
                  </tr>
                </thead>
                <tbody>
                  {undersubscribed.map(s => (
                    <tr key={s.scholarship_id}>
                      <th scope="row" style={{ fontWeight: 500 }}>{s.title}</th>
                      <td className="truncate">{s.organisation_name}</td>
                      <td className="num">{money(s.budget_remaining)}</td>
                      <td className="num">{count(s.applications)}</td>
                      <td className="num">
                        {/* Urgency is the actionable part: an unspent budget on
                            a scheme closing this week is a different problem
                            from one closing in three months. */}
                        {s.days_remaining <= 7
                          ? <Pill tone="danger">{s.days_remaining}d</Pill>
                          : <span>{s.days_remaining}d</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function UnderservedTable({
  title, caption, rows, note,
}: {
  title: string
  caption: string
  rows: Underserved[]
  note: string
}) {
  const visible = rows.filter(r => !r.suppressed)
  const suppressed = rows.length - visible.length

  return (
    <div className="card">
      <header><h2>{title}</h2></header>

      {visible.length === 0 ? (
        <Empty
          title="Nothing to report yet"
          hint={suppressed > 0
            ? `${suppressed} group(s) are too small to report without identifying somebody.`
            : 'No data yet.'}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <caption>{caption}</caption>
              <thead>
                <tr>
                  <th scope="col">Group</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Students</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Applied</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Funded</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.key}>
                    <th scope="row" style={{ fontWeight: 500 }}>{r.label}</th>
                    <td className="num">{count(r.students)}</td>
                    <td className="num">{count(r.applications)}</td>
                    <td className="num">{count(r.sanctioned)}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <span>{r.coverage_ratio.toFixed(2)}</span>
                        <span
                          className="bar"
                          style={{ width: '3rem' }}
                          // The bar repeats the number beside it, so it carries
                          // no information of its own and is hidden rather than
                          // announced as a stray graphic.
                          aria-hidden="true"
                        >
                          <span style={{ width: `${Math.min(r.coverage_ratio, 1) * 100}%` }} />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {suppressed > 0 && (
            <p className="faint" style={{ fontSize: 12, padding: '0.5rem 0.75rem', margin: 0 }}>
              {suppressed} group{suppressed === 1 ? '' : 's'} withheld. {note}
            </p>
          )}
        </>
      )}
    </div>
  )
}
