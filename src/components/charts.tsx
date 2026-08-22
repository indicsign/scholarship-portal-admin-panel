import { useState, type ReactNode } from 'react'

import { count } from '../lib/format'

/* Chart primitives.
 *
 * Three rules decided everything here.
 *
 * One measure per chart, one colour. Every chart below plots a single series,
 * so there is no categorical palette to get wrong, no legend to read, and no
 * red-against-green pair for a colour-blind operator to fail to separate. The
 * accent hue does all of it; where two things genuinely differ in kind — an
 * application rejected against one disbursed — the row says so in words.
 *
 * Never two scales on one frame. Registrations, schemes, applications and
 * rupees move on wildly different orders of magnitude; drawing them together
 * would need a second axis, which is the one thing a time series must never
 * have. They are drawn as small multiples instead: four frames, four scales,
 * each titled with what it plots.
 *
 * The picture is never the only copy. Every chart is paired with the same
 * numbers as text — a real table beside the bars, or a visually hidden one
 * under the columns — so nothing here is gated behind seeing it.
 */

/* --- stat tile ------------------------------------------------------------ */

interface StatProps {
  label: string
  value: string
  sub?: ReactNode
  /** Renders larger, for the one figure a view leads with. */
  hero?: boolean
}

export function Stat({ label, value, sub, hero }: StatProps) {
  return (
    <div className={`card stat${hero ? ' hero' : ''}`}>
      <dl>
        <dt>{label}</dt>
        {/* Proportional figures deliberately: tabular-nums gives every digit
            the width of a zero, which at this size makes a number like 121
            look gappy. Tabular is for columns that must align, and these do
            not. */}
        <dd>{value}</dd>
        {sub && <div className="sub">{sub}</div>}
      </dl>
    </div>
  )
}

/* --- horizontal bar rows -------------------------------------------------- */

export interface BarRow {
  key: string
  label: string
  value: number
  /** A second figure shown as text beside the bar, never as a second bar. */
  note?: ReactNode
  /** Drawn in the recessive ink rather than the accent — for terminal states
   *  that are counted but are not progress. */
  muted?: boolean
}

interface BarsProps {
  caption: string
  rows: BarRow[]
  headLabel: string
  headValue: string
  /** Formats the value at the tip of each bar. */
  format?: (n: number) => string
  /** Scale bars against this rather than the largest row, when the rows are
   *  stages of one population and the first stage is the whole of it. */
  max?: number
}

/**
 * A table whose value column carries a bar.
 *
 * The table is the primary artefact and the bar rides along inside it, rather
 * than the other way around: that way the figures are readable in a screen
 * reader, in a text browser and in print, and the bar is pure supplement.
 */
export function Bars({ caption, rows, headLabel, headValue, format, max }: BarsProps) {
  const ceiling = max ?? Math.max(1, ...rows.map(r => r.value))
  const fmt = format ?? count

  return (
    <div className="table-wrap">
      <table className="bars">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{headLabel}</th>
            <th scope="col" style={{ textAlign: 'right' }}>{headValue}</th>
            <th scope="col"><span className="sr-only">Relative size</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <th scope="row">
                {r.label}
                {r.note && <div className="faint" style={{ fontWeight: 400, fontSize: 12 }}>{r.note}</div>}
              </th>
              <td className="num">{fmt(r.value)}</td>
              <td className="bar-cell">
                {/* The bar repeats the number in the cell before it, so it
                    carries nothing of its own and is hidden rather than
                    announced as a stray graphic. */}
                <span className="bar-track" aria-hidden="true">
                  <span
                    className={`bar-fill${r.muted ? ' muted' : ''}`}
                    style={{ width: `${(r.value / ceiling) * 100}%` }}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* --- monthly columns ------------------------------------------------------ */

export interface ColumnPoint {
  label: string
  value: number
}

interface ColumnsProps {
  title: string
  points: ColumnPoint[]
  format?: (n: number) => string
}

/**
 * One month per column, one measure per chart.
 *
 * Columns rather than a line: these are counts over discrete months, and a
 * line between them implies a value that was measured in between and was not.
 *
 * Laid out in HTML rather than SVG. An SVG stretched to the card width needs
 * preserveAspectRatio="none", which scales the rounded data-end horizontally
 * along with everything else and turns a 4px corner into an ellipse whose
 * shape changes with the window. Flex boxes round correctly at any width, and
 * the surface gap between columns is just the flex gap.
 */
export function Columns({ title, points, format }: ColumnsProps) {
  const [hover, setHover] = useState<number | null>(null)
  const fmt = format ?? count

  const peak = Math.max(...points.map(p => p.value), 0)
  const empty = peak === 0
  const slot = 100 / Math.max(points.length, 1)
  const last = points.length - 1

  // Labelled selectively: the tallest column and the most recent one. A value
  // on all twelve is noise; the table below carries every one of them.
  const peakIndex = points.findIndex(p => p.value === peak)
  const labelled = empty ? [] : [...new Set([peakIndex, last])]

  return (
    <div className="chart">
      <h3>{title}</h3>

      <div className="plot" onMouseLeave={() => setHover(null)}>
        {/* aria-hidden: the plot is a second rendering of the table below it,
            and announcing twelve unlabelled boxes helps nobody. */}
        <div className="cols" aria-hidden="true">
          {points.map((p, i) => (
            <span
              key={p.label}
              className="slot"
              onMouseEnter={() => setHover(i)}
            >
              <span
                className={`col${hover === i ? ' on' : ''}`}
                style={{ height: empty ? 0 : `${Math.max((p.value / peak) * 100, p.value > 0 ? 4 : 0)}%` }}
              />
            </span>
          ))}
        </div>

        {labelled.map(i => (
          <span key={i} className="cap-label" style={{ left: `${i * slot + slot / 2}%` }}>
            {fmt(points[i].value)}
          </span>
        ))}

        {hover !== null && (
          <div
            className="tip"
            // Clamped away from both edges so a tooltip on the first or last
            // month is not half outside the card.
            style={{ left: `${Math.min(Math.max(hover * slot + slot / 2, 14), 86)}%` }}
          >
            <strong>{fmt(points[hover].value)}</strong> {points[hover].label}
          </div>
        )}
      </div>

      <div className="axis-labels" aria-hidden="true">
        <span>{points[0]?.label}</span>
        <span>{points[last]?.label}</span>
      </div>

      {/* Every value as text. The plot above is a second rendering of this. */}
      <table className="sr-only">
        <caption>{title}, by month</caption>
        <thead>
          <tr><th scope="col">Month</th><th scope="col">{title}</th></tr>
        </thead>
        <tbody>
          {points.map(p => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{fmt(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
