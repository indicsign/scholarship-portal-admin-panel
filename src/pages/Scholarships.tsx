import { useEffect, useState } from 'react'

import * as api from '../lib/api'
import { ApiError, errorDetail } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { count, date, humanise, money } from '../lib/format'
import { Dialog, Empty, ErrorState, Field, Loading, Pager, Pill } from '../components/ui'
import SplitView, { DetailEmpty, QueueItem } from '../components/SplitView'
import { Stat } from '../components/charts'
import LogoField from '../components/LogoField'
import {
  IconApply, IconBenefit, IconEligibility, IconMessages, IconScheme, IconTag,
} from '../components/icons'
import { useAuthedImage, useDebounced, useQuery } from '../lib/hooks'
import { useAnnounce, type Tone } from '../lib/announce'
import {
  AWARD_BASES, DERIVED_TAG_LABELS, NUMBER_OPS, RULE_FIELDS, describeRule, fieldByName,
} from './scholarship-vocabulary'
import type {
  AwardBasis, Catalogue, Listing, ListingRule, ListingTag, OrgType, ReviewState,
} from '../lib/types'

/* The catalogue.
 *
 * Two kinds of thing share this screen, and the whole design turns on keeping
 * them distinct:
 *
 *   TENANT   an approved organisation runs it, receives the applications, and
 *            wrote the words. The platform may publish, pause and close one —
 *            those are decisions about what the catalogue offers — and may not
 *            edit it. The organisation is the party who answers for its wording.
 *   CURATED  the platform lists a scheme somebody else runs, so students can
 *            find it. No sponsor account, no budget, no workflow; applying means
 *            leaving for external_url. These the platform authors and edits.
 *
 * They are one list rather than two tabs because the question the operator
 * arrives with — "is this scheme in the catalogue, and is it live?" — does not
 * know which kind the answer is. The kind is a filter and a pill, not a
 * separate screen.
 *
 * The other job here is duplicates. Curated entries come from overlapping
 * sources and the same scheme arrives two and three times; the server folds
 * them by title and points each group at its oldest member, so the queue can
 * stand them next to each other instead of leaving somebody to notice.
 */

const PAGE_SIZE = 25

/* Statuses in the order a listing moves through them, which is also the order
 * they are worth reviewing in: drafts owe a decision, archived rows owe
 * nothing. `key` is null for the All chip — the API reads an absent status as
 * no filter. */
const STATUSES: { key: string; label: string; of: (c: Catalogue['counts']) => number }[] = [
  { key: '', label: 'All', of: c => c.total },
  /* First, and it is not a `status` — the server reads PENDING as a review
     filter. It leads because it is the only tab holding work somebody else is
     waiting on; the rest describe what the catalogue already contains. */
  { key: 'PENDING', label: 'Waiting on us', of: c => c.pending },
  { key: 'DRAFT', label: 'Draft', of: c => c.draft },
  { key: 'PUBLISHED', label: 'Published', of: c => c.published },
  { key: 'PAUSED', label: 'Paused', of: c => c.paused },
  { key: 'CLOSED', label: 'Closed', of: c => c.closed },
  { key: 'ARCHIVED', label: 'Archived', of: c => c.archived },
]

/* How each derived state is worded and coloured here.
 *
 * "Waiting on us" rather than "Pending": an operator reading Pending cannot tell
 * whether they are waiting on somebody or somebody is waiting on them, and that
 * is the only thing this screen needs to say. The publisher's console words the
 * same states from the other side, which is why the strings are not shared. */
const STATE_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Waiting on us',
  CHANGES_REQUESTED: 'Changes requested',
  REJECTED: 'Refused',
  PUBLISHED: 'Published',
  PUBLISHED_EDIT_PENDING: 'Published · edit waiting on us',
  PUBLISHED_EDIT_REFUSED: 'Published · edit refused',
  PAUSED: 'Paused',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
}

const STATE_TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'accent',
  CHANGES_REQUESTED: 'warn',
  REJECTED: 'danger',
  PUBLISHED: 'ok',
  PUBLISHED_EDIT_PENDING: 'accent',
  PUBLISHED_EDIT_REFUSED: 'warn',
  PAUSED: 'warn',
  CLOSED: 'neutral',
  ARCHIVED: 'neutral',
}

/* Not humanise(): it passes any all-caps word of five letters or fewer through
 * as an acronym, and DRAFT is five letters. This is the formula ui.tsx's own
 * StatusPill uses, which is why the two read alike. */
/* Reads the DERIVED state, not `status`.
 *
 * A scheme submitted for review is still status DRAFT and a live one with an
 * edit waiting is still PUBLISHED, so a pill built from `status` would call both
 * of those something they are not — and those two are precisely the rows an
 * operator is looking for. */
function StatusPill({ state }: { state: string }) {
  return (
    <Pill tone={STATE_TONE[state] ?? 'neutral'}>{STATE_LABEL[state] ?? state}</Pill>
  )
}

/** An award, respecting the row's currency rather than assuming rupees. */
function award(amount: number | undefined, currency: string) {
  if (amount === undefined) return '—'
  return currency === 'INR' ? money(amount) : `${currency} ${count(amount)}`
}

/* One row's mark.
 *
 * A component rather than a call in the map, because useAuthedImage is a hook
 * and a hook cannot be called from inside a loop.
 *
 * Falls back to the sponsor's initial rather than to nothing. With nothing, a
 * queue where some sponsors have uploaded a logo and some have not gets a ragged
 * left edge and titles that start in two different places — the alignment is
 * worth more than the accuracy of a letter in a box.
 *
 * alt="" on the image, deliberately: the sponsor's name is already in the row's
 * sub-line, so a described logo would have a screen reader announce it twice.
 * The mark is decoration here in a way it is not in the detail header.
 */
function QueueLogo({ listing }: { listing: Listing }) {
  const src = useAuthedImage(
    listing.has_logo
      ? (listing.listing_kind === 'CURATED'
        ? `/public/scholarships/${listing.scholarship_id}/logo`
        : `/public/organisations/${listing.organisation_id}/logo`)
      : null,
    Date.parse(listing.updated_at) || 0,
  )

  if (src) return <img src={src} alt="" />

  /* Array.from, not charAt: a Devanagari sponsor name's first character is not
     its first code unit, and slicing one in half renders a broken glyph. */
  const initial = Array.from(listing.sponsor.trim())[0]?.toUpperCase() ?? '?'
  return <span className="queue-initial" aria-hidden="true">{initial}</span>
}

export default function Scholarships() {
  const { can } = useAuth()
  const announce = useAnnounce()

  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const [page, setPage] = useState(1)
  const [wantID, setWantID] = useState<string | null>(null)
  /* undefined = closed, null = creating, string = editing that listing. */
  const [editing, setEditing] = useState<string | null | undefined>(undefined)

  const query = useQuery<Catalogue>(
    signal => api.get('/admin/scholarships', {
      status, kind, q: search, page, page_size: PAGE_SIZE,
    }, signal),
    [status, kind, search, page],
  )

  const catalogue = query.data
  const rows = catalogue?.listings ?? []

  /* Derived while rendering, as on the organisations queue: the list reloads
     after every decision and a published draft leaves the Draft filter, so a
     stored selection would routinely point at a row that is no longer here. */
  const selected = rows.find(l => l.scholarship_id === wantID) ?? rows[0] ?? null
  const opened = !!wantID

  // Reading the catalogue is open to every platform role; changing it is not.
  // can() matches the role exactly, so both operators have to be named.
  const canWrite = can('SUPER_ADMIN', 'ADMIN')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Scholarships</h1>
          <p>
            Everything the platform lists — schemes run by organisations here,
            and schemes elsewhere that we point students to. Publishing one puts
            it in the public directory and into every student's matches.
          </p>
        </div>
        {canWrite && (
          <button className="primary" onClick={() => setEditing(null)}>
            Add a listing
          </button>
        )}
      </div>

      {/* What the catalogue is, before what you want to see of it.
          Each figure carries the thing worth knowing about it, which is what
          the tabs below have no room for. */}
      {catalogue && (
        <div className="grid cols-4" style={{ marginBottom: '0.75rem' }}>
          <Stat
            label="Listed"
            value={count(catalogue.counts.total)}
            sub={`${count(catalogue.counts.curated)} we maintain ourselves; the rest are run by organisations here`}
          />
          <Stat
            label="Published"
            value={count(catalogue.counts.published)}
            sub={catalogue.counts.paused > 0
              ? `Live in the directory. ${count(catalogue.counts.paused)} more paused.`
              : 'Live in the directory and matching students'}
          />
          <Stat
            label="Draft"
            value={count(catalogue.counts.draft)}
            sub={catalogue.counts.duplicates > 0
              ? `${count(catalogue.counts.duplicates)} share a title with another listing`
              : 'Not yet visible to anyone'}
          />
          <Stat
            label="Closed"
            value={count(catalogue.counts.closed)}
            sub={`${count(catalogue.counts.archived)} archived beyond that`}
          />
        </div>
      )}

      {/* The counts are the filter. They deliberately ignore the current
          selection — a count that changed when you clicked it could not be
          used to navigate by. */}
      {catalogue && (
        <div className="tabs" role="tablist" aria-label="Status">
          {STATUSES.map(s => (
            <button
              key={s.key || 'all'}
              role="tab"
              aria-selected={status === s.key}
              className={status === s.key ? 'tab active' : 'tab'}
              onClick={() => { setStatus(s.key); setPage(1); setWantID(null) }}
            >
              {s.label} <span className="muted">{count(s.of(catalogue.counts))}</span>
            </button>
          ))}
        </div>
      )}

      {/* Said once, above the queue, rather than repeated on every folded row.
          It is a statement about the backlog: twenty drafts that are really six
          schemes entered three times each is a different afternoon's work. */}
      {catalogue && catalogue.counts.duplicates > 0 && (
        <div className="alert warn" style={{ marginBottom: '0.75rem' }}>
          <p>
            {count(catalogue.counts.duplicates)} listings share a title with
            another. They are sorted next to each other below — close or archive
            the copies rather than editing them apart.
          </p>
        </div>
      )}

      <SplitView
        showDetailOnNarrow={opened}
        onBack={() => setWantID(null)}
        backLabel="Back to the catalogue"
        list={
          <>
            <header>
              <div className="filters">
                <div className="field grow">
                  <label htmlFor="filter-q">Search</label>
                  <input
                    id="filter-q"
                    type="search"
                    data-primary-filter
                    value={q}
                    onChange={e => { setQ(e.target.value); setPage(1) }}
                    placeholder="Title, sponsor or summary"
                  />
                </div>

                <div className="field">
                  <label htmlFor="filter-kind">Kind</label>
                  <select
                    id="filter-kind"
                    value={kind}
                    onChange={e => { setKind(e.target.value); setPage(1) }}
                  >
                    <option value="">All</option>
                    <option value="TENANT">Run by an organisation</option>
                    <option value="CURATED">Listed by us</option>
                  </select>
                </div>
              </div>
            </header>

            {query.loading && !query.data && <Loading label="Loading the catalogue" />}
            {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : null}

            {query.data && rows.length === 0 && !query.stale && (
              <Empty
                title="Nothing here"
                hint={search || status || kind
                  ? 'No listings match these filters.'
                  : 'The catalogue is empty. Add a listing to start it.'}
              />
            )}

            {rows.length > 0 && (
              <div
                className={`split-scroll${query.stale ? ' stale' : ''}`}
                aria-busy={query.stale || undefined}
              >
                <ul className="queue">
                  {rows.map(l => (
                    <QueueItem
                      key={l.scholarship_id}
                      lead={<QueueLogo listing={l} />}
                      name={l.title}
                      sub={[
                        l.sponsor,
                        l.academic_year,
                        l.listing_kind === 'CURATED' ? 'listed by us' : 'runs it here',
                        l.closes_at ? `closes ${date(l.closes_at)}` : null,
                      ].filter(Boolean).join(' · ')}
                      side={
                        <>
                          {/* first_value() over the folded group returns the
                              oldest row for every member, itself included — so
                              pointing at yourself means you are the original. */}
                          {l.duplicate_of && (
                            <Pill tone={l.duplicate_of === l.scholarship_id ? 'neutral' : 'warn'}>
                              {l.duplicate_of === l.scholarship_id ? 'Has copies' : 'Duplicate'}
                            </Pill>
                          )}
                          <StatusPill state={l.listing_state} />
                        </>
                      }
                      selected={l.scholarship_id === selected?.scholarship_id}
                      onSelect={() => setWantID(l.scholarship_id)}
                    />
                  ))}
                </ul>
              </div>
            )}

            {catalogue && rows.length > 0 && (
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={catalogue.matched}
                hasMore={page * PAGE_SIZE < catalogue.matched}
                onPage={setPage}
              />
            )}
          </>
        }
        detail={
          selected ? (
            <Detail
              key={selected.scholarship_id}
              row={selected}
              canWrite={canWrite}
              onEdit={() => setEditing(selected.scholarship_id)}
              onDone={(message, tone) => {
                announce(message, tone)
                query.reload()
              }}
            />
          ) : (
            <DetailEmpty hint="Choose a scholarship to see it in full." />
          )
        }
      />

      {editing !== undefined && (
        <ListingForm
          listingID={editing}
          onClose={() => setEditing(undefined)}
          onDone={(message, id) => {
            setEditing(undefined)
            announce(message, 'ok')
            setWantID(id)
            query.reload()
          }}
        />
      )}
    </>
  )
}

/* --- one listing ------------------------------------------------------------ */

/* What a status change is called, and what it does.
 *
 * Publish has its own endpoint because it carries a guard the others do not:
 * a scheme with no eligibility rules matches every student in the country, so
 * the server refuses to publish one. The queue carries rule_count for exactly
 * this, so the button can say why it is unavailable rather than letting the
 * operator find out by being refused.
 */
type Action =
  | 'publish' | 'pause' | 'close' | 'archive' | 'draft' | 'delete'
  // The review decisions, which used to live on a screen of their own.
  | 'approve' | 'reject' | 'request-changes'

/* The status each of those actions leaves the scheme in.
 *
 * Written out rather than derived from the action's own name. The buttons are
 * imperative and scholarship_status is past tense, so upper-casing the action
 * only lands on a real status for `draft` — which is exactly why deriving it
 * looked like it worked. See the note at the call site.
 *
 * Keyed on the four actions that set a status, so adding a seventh action
 * without deciding what it sets is a type error rather than another 422.
 */
const STATUS_FOR: Record<'pause' | 'close' | 'archive' | 'draft', string> = {
  pause: 'PAUSED',
  close: 'CLOSED',
  archive: 'ARCHIVED',
  draft: 'DRAFT',
}

/* Whether an action refuses something, and therefore needs a reason.
 *
 * The API refuses a refusal without one and the publisher is shown the text
 * word for word — it is the only thing telling them what to fix, so "rejected"
 * with no reason produces a support conversation instead of a corrected scheme.
 */
function needsReason(a: Action): boolean {
  return a === 'reject' || a === 'request-changes'
}

const ACTIONS: Record<Action, { label: string; tone: 'primary' | 'danger' | ''; blurb: string }> = {
  publish: {
    label: 'Publish',
    tone: 'primary',
    blurb: 'It appears in the public directory and in the matches of every student who qualifies.',
  },
  pause: {
    label: 'Pause',
    tone: '',
    blurb: 'It leaves the directory and stops matching. Nothing already applied for is affected.',
  },
  close: {
    label: 'Close',
    tone: 'danger',
    blurb: 'The scheme is over. It stops accepting anything and leaves the directory.',
  },
  archive: {
    label: 'Archive',
    tone: 'danger',
    blurb: 'The end state for a scheme that ran. It stops accepting anything and leaves the '
      + 'directory, and every application that named it still resolves.',
  },
  /* Deleting is for a scheme that should not exist, not for one that is over.
   *
   * The distinction is enforced in the database, not here: application, sanction
   * and disbursement all reference scholarship ON DELETE RESTRICT, so a scheme
   * anybody has applied to cannot be removed by anyone. What is left is the
   * duplicate and the abandoned draft.
   *
   * This screen cannot tell which it is looking at — the queue row carries no
   * application count — so the button is offered and the server refuses with a
   * sentence naming how many applications stand in the way. That is a better
   * trade than hiding it: a hidden button teaches nobody why, and the refusal
   * arrives before anything is destroyed. */
  delete: {
    label: 'Delete',
    tone: 'danger',
    blurb: 'Removed for good, with its eligibility rules. This cannot be undone and is meant '
      + 'for a duplicate or a scheme entered by mistake. A scheme anybody has applied to '
      + 'cannot be deleted — archive that instead.',
  },
  draft: {
    label: 'Return to draft',
    tone: '',
    blurb: 'It leaves the directory and becomes editable as an unpublished listing again.',
  },
  approve: {
    label: 'Approve',
    tone: 'primary',
    blurb: 'It goes into the public directory and is matched against every student '
      + 'profile. On a scheme that is already live, this applies the edit waiting on it.',
  },
  'request-changes': {
    label: 'Request a change',
    tone: '',
    blurb: 'It goes back to the publisher with your note. Their scheme is not refused '
      + 'and they can resubmit, which returns it here.',
  },
  reject: {
    label: 'Refuse',
    tone: 'danger',
    blurb: 'Declined on stated grounds. The publisher can rework it and submit again.',
  },
}

/* What can be done from where.
 *
 * Keyed on the DERIVED listing state rather than on `status`, because the two
 * cases that matter most are invisible to `status` alone: a draft submitted for
 * review is still status DRAFT, and a live scheme with an edit waiting is still
 * status PUBLISHED. Deciding those is the work, and a switch on `status` would
 * offer Publish and Pause for them as though nothing were pending.
 *
 * Publish still covers resuming a pause: the server moves DRAFT and PAUSED
 * alike, and both are content an admin has already approved.
 */
function actionsFor(state: string): Action[] {
  switch (state) {
    // Waiting on us. The three review decisions and nothing else — publishing
    // directly would bypass the gate the whole flow exists to enforce.
    case 'PENDING_REVIEW':
    case 'PUBLISHED_EDIT_PENDING':
      return ['approve', 'request-changes', 'reject']

    // Waiting on the publisher. Nothing for us to decide until they resubmit,
    // but the listing is still ours to take out of the catalogue.
    case 'CHANGES_REQUESTED':
    case 'REJECTED':
      return ['archive', 'delete']

    case 'DRAFT': return ['publish', 'archive', 'delete']
    case 'PUBLISHED':
    case 'PUBLISHED_EDIT_REFUSED':
      return ['pause', 'close']
    case 'PAUSED': return ['publish', 'draft', 'close']
    case 'CLOSED': return ['archive']
    default: return []
  }
}

/** A prose block, rendered only when there is something to render. */
function Prose({ heading, body }: { heading: string; body?: string }) {
  if (!body?.trim()) return null
  return (
    <>
      <h3 className="sub-head">{heading}</h3>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{body}</p>
    </>
  )
}

/* One listing, in full.
 *
 * The pane fetches the whole record rather than rendering the queue row it was
 * handed. The row carries what a queue needs; the prose columns run to twenty
 * thousand characters each and the list query leaves them out on purpose, so a
 * detail built from the row alone would silently show an empty "How to apply"
 * for a listing that has one. The row is used until the request lands, so the
 * pane is never blank — everything the queue knows is already correct.
 */
function Detail({
  row, canWrite, onEdit, onDone,
}: {
  row: Listing
  canWrite: boolean
  onEdit: () => void
  onDone: (message: string, tone: Tone) => void
}) {
  // Read here rather than threaded down as a prop: the pane already decides
  // which actions to offer, and delete's audience is one of those decisions.
  const { can } = useAuth()
  const [pending, setPending] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const full = useQuery<Listing>(
    signal => api.get(`/admin/scholarships/${row.scholarship_id}`, undefined, signal),
    [row.scholarship_id],
  )

  /* The proposed edit, when there is one waiting.
   *
   * Fetched only in that state and not with the row: the payload is the whole
   * scheme again, and a list of fifty rows would carry fifty copies to draw
   * fifty status pills. Approving an edit without reading it is the exact
   * failure the review gate exists to prevent, so the pane will not offer the
   * decision until this has landed. */
  const editPending = row.listing_state === 'PUBLISHED_EDIT_PENDING'
  const review = useQuery<ReviewState>(
    signal => (editPending
      ? api.get(`/admin/scholarships/${row.scholarship_id}/review`, undefined, signal)
      : Promise.resolve({ data: null as unknown as ReviewState })),
    [row.scholarship_id, editPending],
  )
  const proposal = review.data?.pending_revision

  const listing = full.data ?? row
  const curated = listing.listing_kind === 'CURATED'

  /* Through the API client, for the same reason as in LogoField: an <img>
     carries no token, and an unpublished listing's logo is hidden from an
     anonymous reader by the row-level policy. */
  const logoSrc = useAuthedImage(
    listing.has_logo
      ? (curated
        ? `/public/scholarships/${listing.scholarship_id}/logo`
        : `/public/organisations/${listing.organisation_id}/logo`)
      : null,
    // The listing's updated_at changes when its logo does, so this refetches
    // after a replacement without needing a counter of its own.
    Date.parse(listing.updated_at) || 0,
  )
  const publishable = listing.rule_count > 0

  async function confirm() {
    if (!pending) return
    setBusy(true)
    setError(null)

    try {
      const id = listing.scholarship_id
      if (pending === 'approve' || pending === 'reject' || pending === 'request-changes') {
        await api.post(`/admin/scholarships/${id}/${pending}`, { note: reason })
        onDone(
          pending === 'approve'
            ? `${listing.title} is approved. We are matching it against every student profile.`
            : pending === 'reject'
              ? `${listing.title} was refused. The publisher has been told why.`
              : `Changes requested on ${listing.title}. The publisher has your note.`,
          pending === 'approve' ? 'ok' : 'warn',
        )
        setReason('')
      } else if (pending === 'delete') {
        await api.del(`/admin/scholarships/${id}`)
        // 'danger' rather than 'ok': the row the caller was looking at is gone,
        // and the list has to reload rather than update in place.
        onDone(`${listing.title} was deleted.`, 'danger')
      } else if (pending === 'publish') {
        await api.post(`/admin/scholarships/${id}/publish`)
        onDone(`${listing.title} is published. Students matching it will see it.`, 'ok')
      } else {
        /* Not `pending.toUpperCase()`, which is what this was.
         *
         * That sent PAUSE, CLOSE and ARCHIVE to a column that only knows
         * PAUSED, CLOSED and ARCHIVED, so pausing, closing and archiving each
         * came back 422 from the `oneof` on the handler's body — every terminal
         * transition on the screen, from every state. `draft` was special-cased
         * beside it and DRAFT is both the verb and the state, so the one case
         * that worked was the one that hid the other three. */
        const status = STATUS_FOR[pending]
        await api.patch(`/admin/scholarships/${id}/status`, { status })
        onDone(
          `${listing.title} is now ${humanise(status).toLowerCase()}.`,
          pending === 'pause' || pending === 'draft' ? 'warn' : 'danger',
        )
      }
      setPending(null)
    } catch (err) {
      // errorDetail, not err.message: a validation failure's message is the
      // generic "Some of the details you entered need attention." and the map
      // beside it is the half that names one. This pane has no fields to hang
      // the map on, so the banner is the only place it can be read.
      setError(errorDetail(err, 'The change could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header>
        {/* The mark sits with the name because together they are one identity.
            Rendered only once loaded — a placeholder box beside a heading reads
            as a broken image rather than as something arriving. */}
        {logoSrc && (
          <div className="detail-logo">
            <img src={logoSrc} alt={listing.logo_alt || `${listing.sponsor} logo`} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="detail-title">{listing.title}</h2>
          <p className="detail-sub">
            {listing.sponsor}
            {listing.sponsor_type ? ` · ${humanise(listing.sponsor_type)}` : ''}
            {listing.academic_year ? ` · ${listing.academic_year}` : ''}
            {' · '}
            {curated ? 'listed by us' : 'runs it on the platform'}
          </p>
        </div>
        <StatusPill state={listing.listing_state} />
      </header>

      <div className="detail-body">
        {error && <div className="alert danger" role="alert">{error}</div>}

        <p>{listing.summary}</p>

        {/* Derived first, because those describe who can actually have it — and
            they cannot be wrong, being read straight off the rules. */}
        {((listing.derived_tags?.length ?? 0) > 0 || listing.tags.length > 0) && (
          <div className="row" style={{ marginBottom: '0.75rem' }}>
            {listing.derived_tags?.map(t => (
              <Pill key={t} tone="accent">{DERIVED_TAG_LABELS[t] ?? humanise(t)}</Pill>
            ))}
            {listing.tags.map(t => <Pill key={t}>{humanise(t)}</Pill>)}
          </div>
        )}

        <dl className="detail-fields">
          <dt>Award</dt>
          <dd>
            {listing.benefit_summary || award(listing.award_amount, listing.currency)}
            {listing.benefit_summary && listing.award_amount !== undefined && (
              <div className="faint" style={{ fontSize: 12 }}>
                {award(listing.award_amount, listing.currency)}
              </div>
            )}
          </dd>

          {listing.award_basis && (
            <>
              <dt>Given on</dt>
              <dd>
                {AWARD_BASES.find(b => b.value === listing.award_basis)?.label
                  ?? humanise(listing.award_basis)}
              </dd>
            </>
          )}

          {/* Tenant schemes only in practice: a curated listing has no budget,
              because the platform is not the one paying. */}
          {listing.budget_total !== undefined && (
            <>
              <dt>Budget</dt>
              <dd>{award(listing.budget_total, listing.currency)}</dd>
            </>
          )}

          <dt>Window</dt>
          <dd>
            {listing.opens_at || listing.closes_at
              ? `${listing.opens_at ? date(listing.opens_at) : 'anytime'} – ${
                listing.closes_at ? date(listing.closes_at) : 'no closing date'}`
              : 'Not stated'}
          </dd>

          <dt>{curated ? 'Students apply' : 'More information'}</dt>
          <dd>
            {listing.external_url
              ? (listing.external_url.startsWith('/')
                // On this site. No new tab, and no rel: both exist to manage
                // leaving for somebody else's origin, and this does not.
                ? (
                  <>
                    <a href={listing.external_url}>{listing.external_url}</a>
                    <div className="faint" style={{ fontSize: 12 }}>
                      On this site — the page above is all the student gets.
                    </div>
                  </>
                )
                : (
                  // rel=noreferrer as well as noopener: this is somebody else's
                  // site and the admin panel's URL is not their business.
                  <a href={listing.external_url} target="_blank" rel="noopener noreferrer">
                    {listing.external_url}
                  </a>
                ))
              : <span className="faint">—</span>}
          </dd>

          <dt>Eligibility</dt>
          <dd>
            {listing.rule_count === 0
              ? 'No rules — it would match every student'
              : `${count(listing.rule_count)} rule${listing.rule_count === 1 ? '' : 's'} the engine evaluates`}
          </dd>

          {(listing.contact_email || listing.contact_phone) && (
            <>
              <dt>Contact</dt>
              <dd>
                {listing.contact_email}
                {listing.contact_email && listing.contact_phone && <br />}
                {listing.contact_phone && <span className="mono">{listing.contact_phone}</span>}
              </dd>
            </>
          )}

          <dt>Added</dt>
          <dd>{date(listing.created_at)}</dd>
        </dl>

        {/* The rules in the words a blocked student is actually shown. */}
        {!!listing.rules?.length && (
          <>
            <h3 className="sub-head">Who qualifies</h3>
            <ul className="plain">
              {listing.rules.map(r => (
                <li key={r.rule_id}>
                  {r.description}
                  {!r.hard && <span className="faint"> (a preference, not a bar)</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        <Prose heading="Eligibility in full" body={listing.eligibility_summary} />
        <Prose heading="What you get" body={listing.benefit_description} />
        <Prose heading="About the scheme" body={listing.description} />
        <Prose heading="How to apply" body={listing.application_process} />

        {!!listing.documents_required?.length && (
          <>
            <h3 className="sub-head">Documents required</h3>
            <ul className="plain">
              {listing.documents_required.map(d => <li key={d}>{d}</li>)}
            </ul>
          </>
        )}

        <Prose heading="Important notes" body={listing.important_notes} />

        {canWrite && !publishable && listing.status === 'DRAFT' && (
          <div className="alert warn" style={{ marginTop: '0.75rem' }}>
            <p>
              This has no eligibility rules, so publishing is refused: every
              student in the country would be told they qualify.
              {curated
                ? ' Edit it and add at least one condition.'
                : ' Only the organisation running it can add them.'}
            </p>
          </div>
        )}

        {canWrite && !curated && (
          <div className="alert" style={{ marginTop: '0.75rem' }}>
            <p>
              {listing.sponsor} runs this and wrote it. You can publish, pause
              and close it — that is what the catalogue offers — but the wording
              is theirs to change.
            </p>
          </div>
        )}

        {/* What is being asked for, beside what is live. An operator approving
            an edit is approving THIS, and it is not otherwise on the screen —
            the fields above are the published listing, unchanged while the edit
            waits. */}
        {editPending && (
          <>
            <h3 className="sub-head">The change being proposed</h3>
            {review.loading && !review.data && <Loading label="Loading the change" />}
            {proposal ? (
              <>
                <p className="muted" style={{ fontSize: 12 }}>
                  Submitted {date(proposal.submitted_at)}. This is what goes live
                  if you approve it.
                </p>
                <dl className="detail-fields">
                  {Object.entries(proposal.payload)
                    .filter(([, v]) => v !== null && v !== undefined && v !== '')
                    .map(([k, v]) => (
                      <div key={k} style={{ display: 'contents' }}>
                        <dt>{humanise(k)}</dt>
                        <dd>
                          {Array.isArray(v)
                            ? (v.length === 0
                              ? <span className="faint">none</span>
                              : typeof v[0] === 'object'
                                ? `${count(v.length)} ${v.length === 1 ? 'entry' : 'entries'}`
                                : v.join(', '))
                            : typeof v === 'object'
                              ? JSON.stringify(v)
                              : String(v)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </>
            ) : review.error ? (
              <ErrorState error={review.error} onRetry={review.reload} />
            ) : null}
          </>
        )}

        {/* The publisher's own words on the last decision, where there were
            any. Shown so a second change request does not repeat the first,
            which is how a publisher concludes nobody is reading them. */}
        {listing.review_note && (
          <>
            <h3 className="sub-head">What was said last time</h3>
            <blockquote className="review-note"><p>{listing.review_note}</p></blockquote>
          </>
        )}

        {pending && (
          <div className={`alert ${ACTIONS[pending].tone === 'danger' ? 'danger' : 'warn'}`}>
            <p>{ACTIONS[pending].blurb}</p>
            {/* A refusal has to carry one, and it is shown to the publisher word
                for word. Inline rather than in a dialog: it is written while the
                scheme that prompted it is still on screen. */}
            {needsReason(pending) && (
              <Field
                label={pending === 'reject'
                  ? 'Why is it refused?'
                  : 'What needs to change?'}
                hint="The publisher is shown this and nothing else, so name the problem."
                required
              >
                {props => (
                  <textarea
                    {...props}
                    rows={3}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    maxLength={2000}
                    autoFocus
                  />
                )}
              </Field>
            )}
          </div>
        )}
      </div>

      {canWrite && (
        <div className="detail-actions">
          {pending ? (
            <>
              <button onClick={() => { setPending(null); setReason('') }} disabled={busy}>Cancel</button>
              <button
                className={ACTIONS[pending].tone}
                onClick={confirm}
                disabled={busy || (needsReason(pending) && reason.trim().length === 0)}
              >
                {busy ? 'Saving…' : `${ACTIONS[pending].label} ${curated ? 'this listing' : 'this scheme'}`}
              </button>
            </>
          ) : (
            <>
              {curated && listing.status !== 'ARCHIVED' && (
                <button onClick={onEdit}>Edit</button>
              )}
              {actionsFor(listing.listing_state)
                // Mirrors the route, which admits SUPER_ADMIN alone. Shown to
                // an ADMIN it would be a button that always answers 403.
                .filter(a => a !== 'delete' || can('SUPER_ADMIN'))
                .map(a => (
                <button
                  key={a}
                  className={a === 'publish' ? 'primary' : ACTIONS[a].tone}
                  onClick={() => setPending(a)}
                  disabled={a === 'publish' && !publishable}
                  title={a === 'publish' && !publishable
                    ? 'Add an eligibility rule first.'
                    : undefined}
                >
                  {ACTIONS[a].label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </>
  )
}

/* --- authoring a curated listing -------------------------------------------- */

const SPONSOR_TYPES: OrgType[] = ['GOVERNMENT', 'NGO', 'CORPORATE', 'PRIVATE']

interface DraftRule {
  field: string
  /** Numeric fields only; a choice field derives its operator from the picks. */
  op: string
  /** Numeric fields. */
  value: string
  /** Choice fields. */
  picks: string[]
  hard: boolean
  description: string
  /* Whether the author has written the wording themselves.
   *
   * While false the description is regenerated from the rule as the field,
   * operator or value changes — otherwise a condition edited from disability to
   * income keeps telling a refused student their disability percentage was the
   * problem, which is a worse thing to be told than nothing. Once true, the
   * words are theirs and nothing overwrites them. */
  written: boolean
}

/* A fresh condition, not a shared constant.
 *
 * It used to be one, and every condition after the first therefore arrived
 * carrying the first one's sentence. 40% is a reasonable opening default — it
 * is the statutory threshold most schemes use — but the wording is derived from
 * it rather than written out beside it, so the two cannot disagree. */
function blankRule(): DraftRule {
  return {
    field: 'disability_percent',
    op: 'GTE',
    value: '40',
    picks: [],
    hard: true,
    description: describeRule('disability_percent', 'GTE', '40', []),
    written: false,
  }
}

/** A stored rule back into the editor's shape. */
function toDraft(r: ListingRule): DraftRule {
  const f = fieldByName(r.field)
  const picks = f?.kind === 'choice'
    ? (Array.isArray(r.value) ? r.value.map(String) : [String(r.value)])
    : []

  return {
    field: r.field,
    op: r.op,
    value: f?.kind === 'number' && r.value !== null && r.value !== undefined
      ? String(r.value)
      : '',
    picks,
    hard: r.hard,
    description: r.description,
    // Somebody wrote these, possibly months ago. Regenerating them because a
    // field was touched would silently replace their sentence with ours.
    written: true,
  }
}

/* And back out. The API takes a JSON value, so a numeric field must arrive as a
 * number and a multi-choice as an array — "40" compared as text against a
 * numeric column mis-ranks silently.
 *
 * A choice field's operator is derived rather than chosen: one pick is EQ, more
 * than one is IN. That removes a decision the operator should not have to make,
 * and it keeps the server's derived tags honest — "women-only" is emitted for a
 * gender rule admitting exactly FEMALE, which is what ticking one box produces.
 */
function toPayload(r: DraftRule) {
  const f = fieldByName(r.field)

  if (f?.kind === 'choice') {
    return {
      field: r.field,
      op: r.picks.length === 1 ? 'EQ' : 'IN',
      value: r.picks.length === 1 ? r.picks[0] : r.picks,
      hard: r.hard,
      description: r.description,
    }
  }

  return {
    field: r.field,
    op: r.op,
    value: Number(r.value),
    hard: r.hard,
    description: r.description,
  }
}

/** Whether a rule is complete enough to send. */
function ruleReady(r: DraftRule) {
  const f = fieldByName(r.field)
  const hasValue = f?.kind === 'choice' ? r.picks.length > 0 : r.value.trim() !== ''
  return hasValue && r.description.trim().length >= 10
}

/** An ISO timestamp into what <input type="date"> wants. */
const dateInput = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '')

/** And back. Blank stays blank: both dates are optional, because the platform
 *  routinely knows a scheme exists before it knows this year's window. */
const dateValue = (text: string) => (text ? new Date(text).toISOString() : undefined)

/* A section heading with its landmark.
 *
 * The icon is aria-hidden and the words carry the meaning — the glyph is there
 * to be aimed at while scrolling a long form, not to be decoded. */
function Section({ icon: Icon, children }: {
  icon: (p: { className?: string }) => React.ReactElement
  children: React.ReactNode
}) {
  return (
    <h3 className="sub-head">
      <Icon />
      {children}
    </h3>
  )
}

/* The wire name of a field, as the label beside it reads.
 *
 * Worth the table: a server message keyed "sponsor_name" appears beside a field
 * captioned "Sponsor", and one keyed rules[2].description beside the third
 * condition — neither is findable from the key alone. */
const FIELD_LABELS: Record<string, string> = {
  title: 'Name',
  sponsor_name: 'Sponsor',
  sponsor_type: 'Kind of sponsor',
  academic_year: 'Academic year',
  award_basis: 'Given on the basis of',
  summary: 'Summary',
  description: 'About the scheme',
  external_url: 'Where students apply',
  award_amount: 'Award amount',
  benefit_summary: 'Benefit',
  benefit_description: 'Benefit in full',
  eligibility_summary: 'Eligibility in words',
  documents_required: 'Documents required',
  application_process: 'The process',
  important_notes: 'Important notes',
  contact_email: 'Contact email',
  contact_phone: 'Contact phone',
  opens_at: 'Opens',
  closes_at: 'Closes',
  tags: 'Tags',
  alt: 'What the logo shows',
  file: 'Logo',
}

/** "rules[2].description" → "Condition 3 — wording". */
function fieldLabel(key: string): string {
  const rule = /^rules\[(\d+)\]\.(\w+)$/.exec(key)
  if (rule) {
    const n = Number(rule[1]) + 1
    const part = rule[2] === 'description' ? 'wording'
      : rule[2] === 'field' ? 'field'
        : rule[2] === 'value' ? 'value'
          : rule[2] === 'op' ? 'comparison'
            : rule[2]
    return `Condition ${n} — ${part}`
  }
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ')
}

type Destination = 'external' | 'internal'


/* Mirrors validateDestination on the server, so the button goes live exactly
 * when the request would be accepted rather than a round trip later.
 *
 * The single-slash rule is the one worth keeping straight: "//evil.example"
 * looks like a path and is read by a browser as an address on another site, so
 * "starts with /" alone would let an off-site link through the option that
 * means "stay here". */
function isDestinationValid(value: string, kind: Destination) {
  const v = value.trim()
  if (!v) return false

  if (kind === 'internal') {
    return v.startsWith('/') && !v.startsWith('//')
  }
  return /^https?:\/\/[^/\s]+/i.test(v)
}

const TAG_GROUPS: { kind: ListingTag['kind']; heading: string }[] = [
  { kind: 'SUBJECT', heading: 'Field of study' },
  { kind: 'BASIS', heading: 'Why it is given' },
  { kind: 'LEVEL', heading: 'Level' },
]

/* Create and edit are one component because they are one form and one payload:
 * the update endpoint takes a whole record, not a patch, so an edit has to send
 * every field a create sends. Splitting them would be two copies of twenty-odd
 * inputs kept in step by hand.
 */
function ListingForm({
  listingID, onClose, onDone,
}: {
  /** null to create; an id to edit that listing. */
  listingID: string | null
  onClose: () => void
  onDone: (message: string, id: string) => void
}) {
  const editing = listingID !== null

  const [title, setTitle] = useState('')
  const [sponsor, setSponsor] = useState('')
  const [sponsorType, setSponsorType] = useState<OrgType>('GOVERNMENT')
  const [academicYear, setAcademicYear] = useState('')
  const [basis, setBasis] = useState<AwardBasis | ''>('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  /* Which kind of destination the field holds. Derived from the stored value on
     edit rather than persisted: a path and an address are already
     distinguishable, so a column for it could only ever disagree with the URL
     beside it. */
  const [destination, setDestination] = useState<Destination>('external')

  const [amount, setAmount] = useState('')
  const [benefitSummary, setBenefitSummary] = useState('')
  const [benefitDescription, setBenefitDescription] = useState('')

  const [eligibilitySummary, setEligibilitySummary] = useState('')
  const [documents, setDocuments] = useState('')
  const [process, setProcess] = useState('')
  const [notes, setNotes] = useState('')

  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [rules, setRules] = useState<DraftRule[]>([blankRule()])

  /* On create there is no row to post a logo to, so the file waits here and is
     sent once the listing has an id. On edit the control posts immediately and
     this stays null. */
  const [stagedLogo, setStagedLogo] = useState<File | null>(null)
  const [stagedAlt, setStagedAlt] = useState('')
  const [hasLogo, setHasLogo] = useState(false)
  const [logoAlt, setLogoAlt] = useState('')

  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* The per-field half of a validation failure. Separate from `error` because
     the two are shown differently: one sentence at the top, and the list of
     fields under it. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  /* The vocabulary, so tags are checkboxes rather than a comma-separated box.
     Free text is what gave the public directory three separate facets spelled
     "Engineering", "engineering" and "Engg". */
  const vocab = useQuery<ListingTag[]>(
    signal => api.get('/admin/scholarships/tags', undefined, signal),
    [],
  )

  /* The queue's rows carry none of the prose and none of the rules, and an
     update replaces every one of them with whatever it is sent — so the form
     has to read the full record before it can safely save one. */
  useEffect(() => {
    if (!editing) return

    const controller = new AbortController()

    api.get<Listing>(`/admin/scholarships/${listingID}`, undefined, controller.signal)
      .then(res => {
        if (controller.signal.aborted) return
        const l = res.data
        setTitle(l.title)
        setSponsor(l.sponsor)
        if (l.sponsor_type) setSponsorType(l.sponsor_type)
        setAcademicYear(l.academic_year ?? '')
        setBasis(l.award_basis ?? '')
        setSummary(l.summary)
        setDescription(l.description ?? '')
        setUrl(l.external_url ?? '')
        setDestination((l.external_url ?? '').startsWith('/') ? 'internal' : 'external')
        setAmount(l.award_amount !== undefined ? String(l.award_amount) : '')
        setBenefitSummary(l.benefit_summary ?? '')
        setBenefitDescription(l.benefit_description ?? '')
        setEligibilitySummary(l.eligibility_summary ?? '')
        setDocuments((l.documents_required ?? []).join('\n'))
        setProcess(l.application_process ?? '')
        setNotes(l.important_notes ?? '')
        setContactEmail(l.contact_email ?? '')
        setContactPhone(l.contact_phone ?? '')
        setOpensAt(dateInput(l.opens_at))
        setClosesAt(dateInput(l.closes_at))
        setTags(l.tags)
        setRules((l.rules ?? []).map(toDraft))
        setHasLogo(!!l.has_logo)
        setLogoAlt(l.logo_alt ?? '')
        setLoading(false)
      })
      .catch(err => {
        if (controller.signal.aborted || err?.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'It could not be loaded.')
        setLoading(false)
      })

    return () => controller.abort()
  }, [editing, listingID])

  /* Applies a change and, while the wording is still ours, brings it along.
   *
   * Only when the patch touches what the sentence is about. A change to `hard`
   * does not alter what the condition says, and regenerating on it would undo
   * an edit the author made a moment earlier. */
  function setRule(i: number, patch: Partial<DraftRule>) {
    setRules(rs => rs.map((r, j) => {
      if (j !== i) return r
      const next = { ...r, ...patch }

      if (patch.description !== undefined) {
        // Typed by hand — from here the wording is theirs. Cleared back to ours
        // if they empty the box, so the default is recoverable.
        next.written = patch.description.trim() !== ''
        return next
      }

      const shape = patch.field !== undefined
        || patch.op !== undefined
        || patch.value !== undefined
        || patch.picks !== undefined

      if (shape && !r.written) {
        next.description = describeRule(next.field, next.op, next.value, next.picks)
      }
      return next
    }))
  }

  function toggleTag(tag: string) {
    setTags(ts => (ts.includes(tag) ? ts.filter(t => t !== tag) : [...ts, tag]))
  }

  async function save() {
    setBusy(true)
    setError(null)
    setFieldErrors({})

    try {
      const body = {
        title,
        sponsor_name: sponsor,
        sponsor_type: sponsorType,
        academic_year: academicYear || undefined,
        award_basis: basis || undefined,
        summary,
        description: description || undefined,
        external_url: url,
        award_amount: amount ? Number(amount) : undefined,
        benefit_summary: benefitSummary || undefined,
        benefit_description: benefitDescription || undefined,
        eligibility_summary: eligibilitySummary || undefined,
        /* One per line. A comma is a legitimate character inside "Marksheet,
           final year" and splitting on it would quietly make two documents. */
        documents_required: documents.split('\n').map(d => d.trim()).filter(Boolean),
        application_process: process || undefined,
        important_notes: notes || undefined,
        contact_email: contactEmail || undefined,
        contact_phone: contactPhone || undefined,
        opens_at: dateValue(opensAt),
        closes_at: dateValue(closesAt),
        tags,
        rules: rules.map(toPayload),
      }

      const res = editing
        ? await api.put<Listing>(`/admin/scholarships/${listingID}`, body)
        : await api.post<Listing>('/admin/scholarships', body)

      const id = res.data.scholarship_id

      /* The logo, now that there is something to attach it to.
       *
       * Deliberately not inside the try above: if this fails the listing has
       * already been created, and reporting that as a failed save would have
       * the operator write the whole thing again and end up with two. */
      if (stagedLogo) {
        try {
          const form = new FormData()
          form.append('file', stagedLogo)
          form.append('alt', stagedAlt.trim())
          await api.upload(`/admin/scholarships/${id}/logo`, form)
        } catch (err) {
          onDone(
            `${title} was saved, but the logo could not be attached. `
            + `${errorDetail(err, 'The upload failed.')} Open it and try again.`,
            id,
          )
          return
        }
      }

      onDone(
        editing ? `${title} saved.` : `${title} saved as a draft. Publish it when it reads right.`,
        id,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.')
      setFieldErrors(err instanceof ApiError ? err.fields ?? {} : {})
    } finally {
      setBusy(false)
    }
  }

  /* Mirrors the server's validation rather than guessing at it, so the button
     goes live exactly when the request would be accepted. */
  const datesOk = !opensAt || !closesAt || new Date(closesAt) > new Date(opensAt)
  const destinationOk = isDestinationValid(url, destination)

  /* What is still wanted, named.
   *
   * A disabled Save with no explanation is the worst thing this form did: the
   * operator has filled in twenty fields and is left hunting for the one that
   * is four characters short. Listing them costs nothing and turns a dead
   * button into an instruction. */
  const missing: string[] = []
  if (title.trim().length < 4) missing.push('a name')
  if (sponsor.trim().length < 2) missing.push('a sponsor')
  if (summary.trim().length < 20) {
    missing.push(summary.trim()
      ? `a longer summary (${20 - summary.trim().length} more characters)`
      : 'a summary')
  }
  if (!destinationOk) {
    missing.push(destination === 'external'
      ? 'a full https:// address for applying'
      : 'a path on this site for applying')
  }
  if (!datesOk) missing.push('a closing date after the opening one')
  if (!rules.every(ruleReady)) {
    missing.push(rules.length === 0
      ? 'at least one condition'
      : 'a value and wording on every condition')
  }

  const complete = missing.length === 0

  return (
    <Dialog
      open
      wide
      title={editing ? 'Edit listing' : 'New listing'}
      onClose={onClose}
      footer={
        <>
          {!complete && !loading && (
            <p className="foot-missing">
              <strong>Still needed:</strong> {missing.join(', ')}.
            </p>
          )}
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy || loading || !complete}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Save as draft'}
          </button>
        </>
      }
    >
      {error && (
        <div className="alert danger" role="alert">
          <p>{error}</p>
          {Object.keys(fieldErrors).length > 0 && (
            <ul className="plain" style={{ marginTop: '0.4rem' }}>
              {Object.entries(fieldErrors).map(([key, message]) => (
                <li key={key}><strong>{fieldLabel(key)}:</strong> {message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? <Loading label="Loading the listing" /> : (
        <>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            A listing for a scheme somebody else runs. The platform is not
            receiving these applications, so there is no budget and no places —
            students go to the sponsor's own page to apply.
          </p>

          <Section icon={IconScheme}>The scheme</Section>

          <Field label="Name" required>
            {props => <input {...props} value={title} onChange={e => setTitle(e.target.value)} />}
          </Field>

          <div className="grid cols-2">
            <Field label="Sponsor" required hint="Whoever actually runs it.">
              {props => (
                <input {...props} value={sponsor} onChange={e => setSponsor(e.target.value)} />
              )}
            </Field>

            <Field label="Kind of sponsor" required>
              {props => (
                <select
                  {...props}
                  value={sponsorType}
                  onChange={e => setSponsorType(e.target.value as OrgType)}
                >
                  {SPONSOR_TYPES.map(t => <option key={t} value={t}>{humanise(t)}</option>)}
                </select>
              )}
            </Field>

            <Field label="Academic year" hint="As the sponsor writes it, e.g. 2026-27.">
              {props => (
                <input
                  {...props}
                  value={academicYear}
                  onChange={e => setAcademicYear(e.target.value)}
                  placeholder="2026-27"
                />
              )}
            </Field>

            <Field label="Given on the basis of">
              {props => (
                <select
                  {...props}
                  value={basis}
                  onChange={e => setBasis(e.target.value as AwardBasis | '')}
                >
                  <option value="">Not stated</option>
                  {AWARD_BASES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              )}
            </Field>
          </div>

          <p className="muted" style={{ fontSize: 12, margin: '0.25rem 0 0.4rem' }}>
            The sponsor's logo, shown beside the listing in the directory. A
            listing without one is not worse, it just carries no mark.
          </p>

          {editing ? (
            <LogoField
              endpoint={`/admin/scholarships/${listingID}/logo`}
              publicPath={`/public/scholarships/${listingID}/logo`}
              hasLogo={hasLogo}
              alt={logoAlt}
              defaultAlt={sponsor.trim()}
              onChange={setHasLogo}
            />
          ) : (
            <LogoField
              staged={stagedLogo}
              alt={stagedAlt}
              defaultAlt={sponsor.trim()}
              onStage={(file, alt) => { setStagedLogo(file); setStagedAlt(alt) }}
            />
          )}

          <Field
            label="Summary"
            required
            hint="Shown in the public directory. Who it is for and what they get, in plain words. At least 20 characters."
          >
            {props => (
              <textarea {...props} value={summary} onChange={e => setSummary(e.target.value)} />
            )}
          </Field>

          <Field label="About the scheme" hint="The longer description on its own page.">
            {props => (
              <textarea
                {...props}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            )}
          </Field>

          <Section icon={IconBenefit}>What the student gets</Section>

          <div className="grid cols-2">
            <Field label="Benefit" hint="The line shown in a list, e.g. Full tuition + ₹3,000 a month.">
              {props => (
                <input
                  {...props}
                  value={benefitSummary}
                  onChange={e => setBenefitSummary(e.target.value)}
                />
              )}
            </Field>

            <Field label="Award amount (₹)" hint="If there is a single figure.">
              {props => (
                <input
                  {...props}
                  type="number"
                  min={1}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Benefit in full" hint="Instalments, what is covered, what is not.">
            {props => (
              <textarea
                {...props}
                value={benefitDescription}
                onChange={e => setBenefitDescription(e.target.value)}
              />
            )}
          </Field>

          <Section icon={IconEligibility}>Who qualifies</Section>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            These are what the platform actually evaluates — disability, income,
            state, level of study, gender. A condition written only in the prose
            below reaches nobody's match list, and a listing with no conditions
            at all cannot be published, because it would match every student in
            the country.
          </p>

          {rules.length === 0 && (
            <div className="alert warn">
              <p>No conditions. You can save this as a draft, but not publish it.</p>
            </div>
          )}

          {rules.map((r, i) => (
            <RuleEditor
              key={i}
              rule={r}
              onChange={patch => setRule(i, patch)}
              onRemove={() => setRules(rs => rs.filter((_, j) => j !== i))}
            />
          ))}

          <button className="sm" onClick={() => setRules(rs => [...rs, blankRule()])}>
            Add a condition
          </button>

          <Field
            label="Eligibility in words"
            hint="Restates the conditions above for a person to read — it explains the decision, it does not make it."
          >
            {props => (
              <textarea
                {...props}
                value={eligibilitySummary}
                onChange={e => setEligibilitySummary(e.target.value)}
              />
            )}
          </Field>

          <Section icon={IconApply}>How to apply</Section>

          {/* Two answers, and the field follows the choice.
              A curated listing used to have to point somewhere else, because
              it was a signpost and nothing more. It now carries the process,
              the documents and a contact, so its own page on this site is a
              real destination rather than a dead end. */}
          <Field label="Students apply" required>
            {props => (
              <select
                {...props}
                value={destination}
                onChange={e => {
                  const next = e.target.value as Destination
                  setDestination(next)
                  // The two are different kinds of value; carrying an https://
                  // address into the path field would only be refused.
                  setUrl(next === 'internal' ? '/scholarships/' : '')
                }}
              >
                <option value="external">On the sponsor's own site</option>
                <option value="internal">Here, on this site</option>
              </select>
            )}
          </Field>

          <Field
            label={destination === 'external' ? "The sponsor's page" : 'The page on this site'}
            required
            hint={destination === 'external'
              ? 'A full https:// address. A listing that points nowhere raises a student\'s hopes and gives them nothing to do.'
              : 'A path beginning with a single slash, like /scholarships/aicte-saksham. Make sure the process and documents above are filled in — this page is all the student gets.'}
            error={url && !destinationOk
              ? (destination === 'external'
                ? 'Use a full https:// address.'
                : 'Start with a single slash. Two slashes is an address on another site.')
              : undefined}
          >
            {props => (
              <input
                {...props}
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={destination === 'external' ? 'https://' : '/scholarships/'}
              />
            )}
          </Field>

          <Field label="The process" hint="The steps, in order.">
            {props => (
              <textarea {...props} value={process} onChange={e => setProcess(e.target.value)} />
            )}
          </Field>

          <Field
            label="Documents required"
            hint="One per line. What the sponsor asks for — the platform collects none of it."
          >
            {props => (
              <textarea
                {...props}
                value={documents}
                onChange={e => setDocuments(e.target.value)}
                placeholder={'Disability certificate\nIncome certificate\nLast marksheet'}
              />
            )}
          </Field>

          <Field
            label="Important notes"
            hint="Quotas, caveats, a deadline that is not the deadline."
          >
            {props => (
              <textarea {...props} value={notes} onChange={e => setNotes(e.target.value)} />
            )}
          </Field>

          <div className="grid cols-2">
            <Field label="Opens">
              {props => (
                <input
                  {...props}
                  type="date"
                  value={opensAt}
                  onChange={e => setOpensAt(e.target.value)}
                />
              )}
            </Field>

            <Field
              label="Closes"
              error={datesOk ? undefined : 'The closing date must be after the opening date.'}
            >
              {props => (
                <input
                  {...props}
                  type="date"
                  value={closesAt}
                  onChange={e => setClosesAt(e.target.value)}
                />
              )}
            </Field>
          </div>

          <Section icon={IconMessages}>Contact</Section>
          <div className="grid cols-2">
            <Field label="Email" hint="Who a student asks about this scheme.">
              {props => (
                <input
                  {...props}
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                />
              )}
            </Field>

            <Field label="Phone" hint="Ten digits, no country code.">
              {props => (
                <input
                  {...props}
                  type="tel"
                  /* numeric rather than tel: tel raises a keypad with *, # and
                     + on it, none of which belong in a ten-digit number. */
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={contactPhone}
                  /* Filtered rather than merely limited. maxLength alone stops
                     an eleventh character and happily keeps ten letters, and a
                     pasted "+91 98765 43210" would be truncated to "+91 98765"
                     — which looks like a number and is not one. Stripping to
                     digits first means that paste yields 9198765432, which is
                     wrong in a way the operator can see. */
                  onChange={e => setContactPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                />
              )}
            </Field>
          </div>

          <Section icon={IconTag}>Tags</Section>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            How a visitor finds this in the directory. PwD-specific, Women-only
            and State-specific are deliberately not here — they are read off the
            conditions above, so they can never contradict them.
          </p>

          {vocab.error ? <ErrorState error={vocab.error} onRetry={vocab.reload} /> : null}

          {TAG_GROUPS.map(g => {
            const options = (vocab.data ?? []).filter(t => t.kind === g.kind)
            if (options.length === 0) return null
            return (
              <div key={g.kind} className="rule">
                <div className="faint" style={{ fontSize: 12, marginBottom: '0.35rem' }}>
                  {g.heading}
                </div>
                <div className="row">
                  {options.map(t => (
                    <label key={t.tag} className="row" style={{ fontSize: 13, gap: '0.3rem' }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto', minHeight: 0 }}
                        checked={tags.includes(t.tag)}
                        onChange={() => toggleTag(t.tag)}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </Dialog>
  )
}

/* One condition.
 *
 * The value control follows the field rather than always being a text box, and
 * that is correctness rather than polish: `gender EQ "female"` is accepted by
 * the API, stored, and then matches nobody, because the column holds 'FEMALE'.
 * The author gets no error and no matches. Offering the stored values as
 * checkboxes makes that unspellable.
 */
function RuleEditor({
  rule, onChange, onRemove,
}: {
  rule: DraftRule
  onChange: (patch: Partial<DraftRule>) => void
  onRemove: () => void
}) {
  const field = fieldByName(rule.field)

  function togglePick(v: string) {
    onChange({
      picks: rule.picks.includes(v)
        ? rule.picks.filter(p => p !== v)
        : [...rule.picks, v],
    })
  }

  return (
    <div className="rule">
      <div className="row">
        <select
          value={rule.field}
          onChange={e => {
            /* Clear the value with the field: a percentage carried over into a
               list of states is not a value anybody meant to keep. */
            onChange({ field: e.target.value, value: '', picks: [] })
          }}
          aria-label="Field"
        >
          {RULE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        {field?.kind === 'number' && (
          <>
            <select
              value={rule.op}
              onChange={e => onChange({ op: e.target.value })}
              aria-label="Comparison"
            >
              {NUMBER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input
              type="number"
              value={rule.value}
              onChange={e => onChange({ value: e.target.value })}
              aria-label="Value"
              style={{ maxWidth: '8rem' }}
            />
            {field.unit && <span className="faint" style={{ fontSize: 13 }}>{field.unit}</span>}
          </>
        )}

        <button className="subtle sm right" onClick={onRemove}>Remove</button>
      </div>

      {field?.hint && (
        <p className="faint" style={{ fontSize: 12, margin: '0.35rem 0 0' }}>{field.hint}</p>
      )}

      {field?.kind === 'choice' && (
        <div className="row" style={{ marginTop: '0.4rem' }}>
          {field.options?.map(o => (
            <label key={o.value} className="row" style={{ fontSize: 13, gap: '0.3rem' }}>
              <input
                type="checkbox"
                style={{ width: 'auto', minHeight: 0 }}
                checked={rule.picks.includes(o.value)}
                onChange={() => togglePick(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}

      <Field
        label="How to say this to a student who fails it"
        required
        hint="A blocked applicant is told which condition stopped them, in these words."
      >
        {props => (
          <input
            {...props}
            value={rule.description}
            onChange={e => onChange({ description: e.target.value })}
          />
        )}
      </Field>

      <label className="row" style={{ fontSize: 13 }}>
        <input
          type="checkbox"
          style={{ width: 'auto', minHeight: 0 }}
          checked={rule.hard}
          onChange={e => onChange({ hard: e.target.checked })}
        />
        Failing this disqualifies them outright
      </label>
    </div>
  )
}
