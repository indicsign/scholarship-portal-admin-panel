import type { Tone } from '../components/ui'
import type { ListingState } from './types'

/* How a scheme's standing is worded here.
 *
 * Deliberately NOT the same wording as org/src/lib/listing-state.ts, which is
 * the same states seen from the other side. The publisher's console says
 * "Waiting for review" because they are waiting on us; this panel says "Waiting
 * on us" for the same state, because the operator reading it is the one holding
 * it up. A shared string table would have to pick one, and either choice reads
 * as written for somebody else.
 *
 * The states themselves are shared, and computed by the API. That is the part
 * that must not be duplicated, and is not.
 */

interface Presentation {
  label: string
  tone: Tone
}

const PRESENTATION: Record<ListingState, Presentation> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING_REVIEW: { label: 'Waiting on us', tone: 'accent' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warn' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  PUBLISHED: { label: 'Published', tone: 'ok' },
  // Names the listing's state first and the queue second, so an operator scanning
  // the catalogue is not misled into thinking this one is off the directory.
  PUBLISHED_EDIT_PENDING: { label: 'Published · edit waiting on us', tone: 'accent' },
  PUBLISHED_EDIT_REFUSED: { label: 'Published · edit refused', tone: 'warn' },
  PAUSED: { label: 'Paused', tone: 'warn' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
}

/* Falls back to the raw value rather than to a blank or to "Unknown". The API
 * can add a state before this panel is redeployed, and of the ways that can look
 * on screen, the literal PENDING_REVIEW is the only one that tells the operator
 * what actually happened. */
export function listingLabel(state: ListingState): string {
  return PRESENTATION[state]?.label ?? state
}

export function listingTone(state: ListingState): Tone {
  return PRESENTATION[state]?.tone ?? 'neutral'
}

/** Mirrors domain.ListingState.IsAwaitingPlatform. */
export function awaitingUs(state: ListingState): boolean {
  return state === 'PENDING_REVIEW' || state === 'PUBLISHED_EDIT_PENDING'
}
