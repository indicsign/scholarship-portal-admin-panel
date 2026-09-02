/* The queues with a clock running, declared once.
 *
 * There were three, and each was named in four places: the query in App.tsx that
 * counts it, a positional prop on Layout, a route→hint ternary inside Layout,
 * and a second copy of the label and hint inside NotificationBell. Adding the
 * scholarship review queue as a fourth meant editing all four, and the ternary
 *
 *   const count = s.to === '/organisations' ? pendingOrganisations
 *     : s.to === '/scholarships' ? pendingReview
 *       : s.to === '/grievances' ? overdueGrievances : 0
 *
 * was already at the edge of what anybody would read carefully. The failure it
 * invites is not a crash: it is a badge that silently stays at zero because one
 * of the four edits was missed, on a queue whose whole purpose is that somebody
 * notices it.
 *
 * So a queue is one entry here, and everything else reads this. What each needs
 * differs — the sidebar wants a terse hint for a screen reader to append to a
 * digit, the bell wants a sentence explaining why the queue matters — so both
 * live on the entry rather than being derived from one another.
 */

export type QueueKey =
  | 'organisations' | 'grievances' | 'scholarships' | 'verifications'

export interface Queue {
  key: QueueKey
  /** The route its badge sits on, and where the bell navigates. */
  to: string
  /** Read out after the count in the sidebar, so the announcement is a sentence. */
  hint: string
  /** The bell's heading for this queue. Names what is being counted. */
  label: string
  /** Why it matters, one sentence, shown under the label in the bell. */
  why: string
  /** How the count is fetched. See App.tsx, which is the only caller. */
  query: { path: string; params?: Record<string, string> }
}

export const QUEUES: readonly Queue[] = [
  {
    key: 'organisations',
    to: '/organisations',
    hint: 'awaiting approval',
    label: 'Organisations awaiting approval',
    why: 'An approved organisation can read applicants’ disability certificates.',
    query: { path: '/admin/organisations', params: { status: 'PENDING_APPROVAL' } },
  },
  {
    /* The review queue. Counted from the same endpoint the queue screen reads,
     * so the badge and the screen cannot disagree about what is waiting.
     *
     * `pending` plus `pending_edits`, because both are decisions an admin owes:
     * a scheme waiting to be published for the first time, and an edit waiting
     * to be applied to one that is already live. The second is less urgent —
     * nobody is being kept off the directory by it — but it is still somebody
     * waiting on us, and a badge that counted only the first would let edits
     * age unseen. */
    key: 'scholarships',
    to: '/scholarships',
    hint: 'waiting for review',
    label: 'Scholarships waiting for review',
    why: 'Nothing reaches a student until somebody here approves it.',
    query: { path: '/admin/scholarships', params: { page_size: '1' } },
  },
  {
    /* Documents a student uploaded and was told were "waiting to be verified".
     *
     * Counts everything waiting, not only what is overdue — unlike grievances
     * below. A grievance queue sits at forty permanently and a badge showing it
     * is one nobody reads; this one should be near zero, and a number appearing
     * on it means somebody is being shown to every scheme as a maybe when they
     * are a match. */
    key: 'verifications',
    to: '/verifications',
    hint: 'waiting to be verified',
    label: 'Students with documents waiting',
    why: 'Until one is, the student is matched as a maybe rather than a match.',
    query: { path: '/admin/verifications/counts' },
  },
  {
    /* Overdue only, not every open grievance. A badge that always reads 40-odd
     * is a badge nobody looks at; this is the number the screen is sorted by. */
    key: 'grievances',
    to: '/grievances',
    hint: 'past due',
    label: 'Grievances past due',
    why: 'Unresolved past the date the student was promised.',
    query: { path: '/grievances', params: { overdue: 'true' } },
  },
]

/** The counts, keyed as the queues are. Absent means "not loaded yet", which
 *  renders as no badge rather than as a zero. */
export type QueueCounts = Partial<Record<QueueKey, number>>

export function queueFor(to: string): Queue | undefined {
  return QUEUES.find(q => q.to === to)
}
