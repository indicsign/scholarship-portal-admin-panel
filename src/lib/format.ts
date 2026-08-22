/* Presentation helpers.
 *
 * Locale is pinned to en-IN throughout: amounts on this platform are rupees and
 * are read against sanction orders written in the Indian numbering system, so
 * "₹1,00,000" is the form an officer reconciles against. A browser-locale
 * default would render "₹100,000" for some staff and not others, which is
 * exactly the sort of quiet inconsistency that costs somebody an afternoon.
 */

const RUPEES = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
})

const COUNT = new Intl.NumberFormat('en-IN')

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric',
})

const TIME = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

export const money = (n: number) => RUPEES.format(n)
export const count = (n: number) => COUNT.format(n)
export const date = (iso: string) => DATE.format(new Date(iso))
export const timestamp = (iso: string) => TIME.format(new Date(iso))

/**
 * A large figure shortened for a stat tile: 1,284 · 12K · 4.2L · 1.3Cr.
 *
 * Lakh and crore rather than K/M/B. These are rupees and headcounts read
 * against Indian reporting, where a figure written "1.2M" has to be converted
 * in the reader's head before it means anything.
 */
export function compact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e7) return `${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`
  if (abs >= 1e5) return `${(n / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`
  if (abs >= 1e4) return `${(n / 1e3).toFixed(0)}K`
  return COUNT.format(n)
}

/** "3 days ago", for recency scanning down a log. */
export function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)

  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`

  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`

  return date(iso)
}

/** Turns SCREAMING_SNAKE into prose, leaving acronyms alone. */
export function humanise(value: string) {
  if (value.length <= 5 && !value.includes('_') && value === value.toUpperCase()) {
    return value
  }
  const words = value.toLowerCase().split('_').filter(Boolean)
  if (!words.length) return value
  return words[0][0].toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '')
}
