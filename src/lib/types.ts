/* Types mirroring the API contract.
 *
 * Hand-written rather than generated, and deliberately narrow: this panel needs
 * a fraction of what the API returns, and a type that claims more than the
 * screen uses is a type nobody keeps accurate.
 */

export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'TECHNICAL'
  | 'STAFF'
  | 'COMPLIANCE'
  | 'STUDENT'
  // One role per kind of organisation. There were nine — an admin, a verifier
  // and a finance or case-working role for each type — and the difference
  // between them was a separation of duties the platform no longer keeps.
  | 'NGO' | 'CORPORATE' | 'GOVT' | 'PRIVATE'

export type OrgType = 'NGO' | 'CORPORATE' | 'GOVERNMENT' | 'PRIVATE'
export type OrgStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED' | 'REJECTED'

export interface Envelope<T> {
  data: T
  meta?: {
    page: number
    page_size: number
    total: number
    has_more: boolean
  }
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    /** Present on VALIDATION_FAILED, keyed by the field's JSON name. */
    fields?: Record<string, string>
    request_id?: string
  }
}

export interface Context {
  role: Role
  organisation_id?: string
  organisation_name?: string
  org_type?: OrgType
  profile_id?: string
}

/* Who is signed in, as distinct from what they may do.
 *
 * Every Context is a role and none of them names the account holding it. That
 * was enough while the only thing on screen was "Signed in as Super Admin", and
 * not enough for an avatar: several people share a role here and impersonation
 * borrows one, so the role alone never answers whose actions these are.
 */
export interface Account {
  user_id: string
  email?: string
  phone?: string
  /* The third sign-in identifier, when the account has claimed one. Absent means
     it never has, which is what the first-password screen tests to decide
     whether to ask for one. */
  username?: string
}

export interface LoginResult {
  account: Account
  token: {
    access_token: string
    token_type: string
    expires_in: number
    expires_at: string
  }
  contexts: Context[]
  active_context: Context
  /** The token issued is good only for completing the second-factor challenge. */
  mfa_required?: boolean
  /** The password used was issued by an administrator and expires. */
  must_change_password?: boolean
  language?: string
}

export interface Organisation {
  organisation_id: string
  name: string
  slug: string
  org_type: OrgType
  status: OrgStatus
  registration_number?: string
  contact_email: string
  contact_phone?: string
  website?: string
  district?: string
  state_code?: string
  approved_at?: string
  rejection_reason?: string
  created_at: string
  member_count?: number
  scholarship_count?: number
  /** Whether the organisation has a logo; the address is built from its id. */
  has_logo?: boolean
  logo_alt?: string
}

/* --- operations overview -----------------------------------------------------
 *
 * The internal dashboard, distinct from the ecosystem report below: these
 * figures are counted from live records and are not suppressed, because they
 * are read by the operator rather than published. */

export interface Segment {
  key: string
  label: string
  count: number
  /** How many students in this segment have applied to anything. */
  amount?: number
}

export interface FunnelStage {
  state: string
  label: string
  count: number
}

export interface TrendPoint {
  period: string
  label: string
  students: number
  scholarships: number
  applications: number
  disbursed: number
}

export interface OverviewReport {
  generated_at: string
  window: { days: number; since: string; label: string }

  students: {
    registered: number
    /** Signed in, or moved an application, inside the window. */
    active: number
    /** Holding an application that has not been decided yet. */
    seeking: number
    new: number
    profile_complete: number
    never_applied: number
  }

  scholarships: {
    listed: number
    total: number
    new: number
    open_now: number
    closing_soon: number
  }

  applications: {
    total: number
    new: number
    in_flight: number
    funnel: FunnelStage[]
  }

  outcomes: {
    availed: number
    beneficiaries: number
    amount_sanctioned: number
    amount_disbursed: number
    amount_sanctioned_in_window: number
    amount_disbursed_in_window: number
    disbursement_rate_percent: number
    average_award: number
  }

  by_education_level: Segment[]
  by_state: Segment[]
  by_disability: Segment[]
  trend: TrendPoint[]
}

export interface Underserved {
  key: string
  label: string
  students: number
  applications: number
  sanctioned: number
  coverage_ratio: number
  /** Groups below the threshold report nothing rather than a small number. */
  suppressed?: boolean
}

export interface Undersubscribed {
  scholarship_id: string
  title: string
  organisation_name: string
  budget_remaining: number
  applications: number
  closes_at: string
  days_remaining: number
}

export interface EcosystemReport {
  generated_at: string
  totals: {
    students: number
    organisations: number
    scholarships: number
    applications: number
    amount_sanctioned: number
    amount_disbursed: number
  }
  underserved_by_disability: Underserved[]
  underserved_by_district: Underserved[]
  undersubscribed_schemes: Undersubscribed[]
  verification_reuse: {
    attestations_issued: number
    times_reused: number
    reuse_ratio: number
  }
}

/* --- grievances (FR-18) ------------------------------------------------------ */

export interface GrievanceMessage {
  message_id: string
  body: string
  author_self: boolean
  is_internal: boolean
  created_at: string
}

export interface Grievance {
  grievance_id: string
  reference_code: string
  profile_id: string
  organisation_id?: string
  organisation_name?: string
  category: string
  subject: string
  description: string
  status: string
  assigned_to?: string
  due_at?: string
  overdue: boolean
  resolution?: string
  resolved_at?: string
  messages?: GrievanceMessage[]
  created_at: string
  updated_at: string
}

export interface GrievanceHandler {
  user_id: string
  label: string
  role: Role
}

/* --- notification templates (FR-13) ------------------------------------------ */

export interface NotificationTemplate {
  template_key: string
  channel: 'EMAIL' | 'SMS' | 'IN_APP'
  subject_en?: string
  subject_hi?: string
  body_en: string
  body_hi?: string
  /** Placeholders the senders supply. Anything else is refused on save. */
  variables: string[]
  is_active: boolean
  /** Whether any code path actually sends this template. */
  used: boolean
  sent_count: number
}

export interface AuditEntry {
  audit_id: string
  created_at: string
  actor_user_id?: string
  actor_email?: string
  actor_role?: Role
  actor_organisation?: string
  action: string
  subject_type: string
  subject_id?: string
  outcome: 'SUCCESS' | 'DENIED' | 'ERROR'
  ip_address?: string
  request_id?: string
  impersonated: boolean
  metadata?: Record<string, unknown>
}

export interface UserSummary {
  user_id: string
  email?: string
  phone?: string
  status: string
  last_login_at?: string
  created_at: string
  roles: Role[]
  impersonable: boolean
}

export interface ImpersonationResult {
  token: { access_token: string; expires_in: number; expires_at: string }
  session_id: string
  acting_as: Context
  expires_at: string
  notice: string
}

/* --- landing page announcements ----------------------------------------------
 *
 * One slide of the rotating band on the public site. Both languages travel
 * together, neither the translation of the other; `state` is the server's answer
 * to what this slide is doing right now, which `is_published` on its own does not
 * give — a published slide whose window has closed is not on the site. It is
 * computed against the database's clock rather than the browser's, so the panel
 * and the public page cannot disagree. */
export type SlideState = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'FINISHED'

export interface Slide {
  slide_id: string
  headline_en: string
  headline_hi?: string
  body_en?: string
  body_hi?: string
  link_url?: string
  link_label_en?: string
  link_label_hi?: string
  /* The picture. `image_url` carries a version, so a replacement is a new
   * address rather than yesterday's file held in a cache. The description is
   * required whenever there is a picture — enforced by the API and by a
   * database constraint, not only by this form. */
  image_url?: string
  image_alt_en?: string
  image_alt_hi?: string
  image_width?: number
  image_height?: number
  /** A link out. The platform hosts no video. */
  video_url?: string
  position: number
  is_published: boolean
  live_from?: string
  live_until?: string
  state: SlideState
  live: boolean
  created_at: string
  updated_at: string
}

/* An account as the super admin administers it: who they are, what they may do,
 * and everywhere they may do it. Distinct from UserSummary, which exists to find
 * one account for a support session rather than to change it.
 */
export interface PlatformUserRole {
  role: Role
  organisation_id?: string
  organisation_name?: string
  /** Present for an organisational role, absent for a platform one. */
  membership_id?: string
}

export interface PlatformUser {
  user_id: string
  email?: string
  phone?: string
  status: string
  last_login_at?: string
  created_at: string
  /** The student profile behind the account, absent where there is none. */
  profile_id?: string
  /* The name on that profile.
   *
   * A student registers by mobile number and may never give an email, so
   * without this a row identifies a person as "+9178…" — and a list of them is
   * unusable. Two students with the same name on different numbers is the case
   * that makes it acute: the row offers a Documents button and no way to tell
   * whose documents they are. */
  full_name?: string
  roles: PlatformUserRole[]
}

/* --- the catalogue (admin) ---------------------------------------------------
 *
 * A scholarship is one of two shapes, and the panel has to tell them apart
 * because they offer different actions and mean different things by "apply":
 *
 *   TENANT   an organisation on the platform runs it and receives applications
 *            through the workflow. The platform may publish, pause or close it,
 *            and may not rewrite its wording.
 *   CURATED  the platform lists it so students find it. The sponsor has no
 *            account, there is no budget or workflow, and applying means going
 *            to external_url.
 *
 * The nullable fields are the ones a curated listing may not have. Sponsor and
 * sponsor_type are resolved server-side from whichever column holds them.
 */
export type ListingKind = 'TENANT' | 'CURATED'

/* The basis on which the money is given — the first thing a student filters by
 * once past "am I eligible". A merit scheme and a need scheme are different
 * propositions to the same person. */
export type AwardBasis = 'MERIT' | 'NEED' | 'MERIT_CUM_MEANS' | 'CATEGORY' | 'OTHER'

/* One entry of the closed tag vocabulary, served from listing_tag.
 *
 * Closed rather than free text because a bare string column gave the public
 * directory three separate facets for "Engineering", "engineering" and "Engg".
 * The form renders these as checkboxes grouped by kind. */
export interface ListingTag {
  tag: string
  label: string
  label_hi?: string
  kind: 'SUBJECT' | 'BASIS' | 'LEVEL'
  position: number
}

/* One eligibility rule as it is stored.
 *
 * `value` is whatever JSON the field takes — a number for a numeric comparison,
 * an array for IN — which is why it is `unknown` here rather than a string. The
 * editor turns it back into text to put in an input and re-types it on save.
 */
export interface ListingRule {
  rule_id: string
  field: string
  op: string
  value: unknown
  hard: boolean
  requires_document?: string
  description: string
  description_hi?: string
}

export interface Listing {
  scholarship_id: string
  listing_kind: ListingKind
  title: string
  slug: string
  status: string

  /* Where the listing stands with review, and the single word to show for it.
   *
   * Two states rather than one because a live scheme with an edit awaiting
   * approval is a real state and `status` alone cannot express it: the listing
   * is PUBLISHED throughout while the edit waits. The API collapses the pair
   * into `listing_state`, which is what the actions and the pill both read —
   * this panel must not recompute it, or it and the publisher console will
   * eventually disagree about the same scheme in front of the same person. */
  review_status: ReviewStatus
  listing_state: ListingState
  /** The reviewer's own words on the last decision. */
  review_note?: string
  sponsor: string
  sponsor_type?: OrgType
  organisation_id?: string
  summary: string
  /** Single read only — the catalogue list omits it. */
  description?: string
  award_amount?: number
  currency: string
  budget_total?: number
  opens_at?: string
  closes_at?: string
  published_at?: string
  external_url?: string
  /** Chosen from the closed vocabulary; see ListingTag. */
  tags: string[]
  /* Computed from the eligibility rules and never stored. A tag that restates a
     rule can contradict it after a later edit; these cannot, because they are
     the rules read a second way. Read-only — the form never sends them. */
  derived_tags?: string[]

  academic_year?: string
  award_basis?: AwardBasis

  benefit_summary?: string
  /** Single read only. */
  benefit_description?: string
  /** Single read only. Prose restatement of the rules; the rules still decide. */
  eligibility_summary?: string
  /** Single read only. */
  documents_required?: string[]
  /** Single read only. */
  application_process?: string
  /** Single read only. */
  important_notes?: string

  contact_email?: string
  contact_phone?: string

  /* The sponsor's mark — from the organisation for a tenant scheme, from the
     row itself for a curated one. A flag rather than a URL: the address is
     derivable from the id, and the panel already holds it. */
  has_logo?: boolean
  logo_alt?: string
  /** Zero means publishing is refused: a scheme with no rules matches everyone. */
  rule_count: number
  /* Single read only, and what the edit form must round-trip: an update
     replaces the rule set with whatever it is sent, so saving a form that never
     loaded these would strip the listing's eligibility. */
  rules?: ListingRule[]
  /** Set when another row shares this folded title; points at the oldest. */
  duplicate_of?: string
  created_at: string
  updated_at: string
}

export interface CatalogueCounts {
  total: number
  draft: number
  published: number
  paused: number
  closed: number
  archived: number
  binned: number
  curated: number
  duplicates: number
  /* Waiting on a platform decision: submitted for the first time, or live with
     an undecided edit. Leads the screen, because it is what somebody is waiting
     for rather than a description of the catalogue. */
  pending: number
}

export interface Catalogue {
  counts: CatalogueCounts
  matched: number
  listings: Listing[]
}


/* --- queue headers -----------------------------------------------------------
 *
 * The figures each queue screen leads with. Deliberately over the whole table
 * rather than the filtered page: they double as the filter, and a count that
 * changed when you clicked it could not be used to navigate by.
 */

export interface OrganisationCounts {
  total: number
  pending: number
  approved: number
  rejected: number
  suspended: number
}


export interface GrievanceCounts {
  total: number
  /** OPEN, IN_PROGRESS and AWAITING_APPLICANT together: how much is still live. */
  open: number
  resolved: number
  closed: number
  /** Live and past its due_at. */
  overdue: number
  escalated: number
}

/* --- scholarship review (migration 0033) ------------------------------------- */

/* Where a scheme stands with platform review. Mirrors scholarship_review_status
 * and domain.ReviewStatus. */
export type ReviewStatus =
  | 'UNSUBMITTED' | 'PENDING' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED'

/* The one word to show, computed by the API.
 *
 * A scheme has two stored states — what the public sees, and where moderation is
 * — because a live listing with an edit awaiting approval is a real state that
 * one column cannot express. The API collapses the pair; this panel must not
 * recompute it, or it and the publisher's console will eventually disagree about
 * the same scheme in front of the same person.
 */
export type ListingState =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'PUBLISHED_EDIT_PENDING'
  | 'PUBLISHED_EDIT_REFUSED'
  | 'PAUSED'
  | 'CLOSED'
  | 'ARCHIVED'

/* --- document verification --------------------------------------------------- */

/* One row of the verification queue: a student, not a document.
 *
 * A certificate is not really checkable on its own — the percentage on the scan
 * has to match the percentage on the profile, and the name has to be the same
 * person — so the queue is grouped by whom the work is about. */
export interface PendingStudent {
  profile_id: string
  /* The account behind the profile, and its standing. Carried because this is
     where a student is looked at, and looking at one raises the account
     questions — sending the operator to User management to answer them means
     searching for a phone number they would have to copy out of this row. */
  user_id: string
  account_status: string
  student_name: string
  contact?: string
  waiting_count: number
  doc_types: string[]
  /* How much of them has been attested to. Both numbers, because the ratio is
     what a reader wants: "2 of 3 verified" says something "2 verified" does not,
     and the difference decides whether there is anything left to do. */
  verified_count: number
  document_count: number
  oldest_uploaded_at: string
  /** Computed server-side, so the sort order and the number shown agree. */
  waiting_days: number
  previously_rejected: boolean
}

export interface VerificationCounts {
  waiting: number
  /** Waiting longer than a week — the number that should be small. */
  overdue: number
  verified: number
  rejected: number
  expiring_soon: number
}

/** A live attestation against a document. */
export interface Verification {
  verification_id: string
  status: 'VERIFIED' | 'REJECTED' | 'REVOKED'
  verified_by_organisation?: string
  verifier_role: string
  evidence_considered: string
  notes?: string
  issued_at: string
  valid_from: string
  valid_until: string
  rejection_reason?: string
}

/** A document in the vault, with its attestation where there is one. */
export interface VaultDocument {
  document_id: string
  profile_id: string
  doc_type: string
  status: string
  original_name: string
  mime_type: string
  size_bytes: number
  uploaded_at: string
  verification?: Verification
}

/* A student's profile as the verification screen reads it.
 *
 * Narrower than the portal's own: this screen shows what was claimed so it can
 * be checked against a scan, so it needs the claims and `verified_fields`, and
 * not the next-steps guidance the student sees. */
export interface StudentProfile {
  profile_id: string
  full_name: string
  date_of_birth?: string
  gender?: string
  disability_type?: string
  disability_percent?: number
  udid_number?: string
  course_level?: string
  course_name?: string
  institution_name?: string
  academic_percentage?: number
  annual_family_income?: number
  social_category?: string
  district?: string
  state_code?: string
  completeness_score: number
  /* The profile fields backed by a live attestation. This is what the blue
     badge reads: it is maintained by a trigger from verification_record, so a
     field is verified here exactly when the vault says so. */
  verified_fields: string[]
}

/** One student's claims and the evidence behind them, in one response. */
export interface StudentVerification {
  profile: StudentProfile
  documents: VaultDocument[]
}

/* A proposed edit to a live scheme, and the standing it belongs to.
 *
 * Fetched by the catalogue's detail pane only when an edit is waiting. The
 * payload is the whole scheme again and is untyped on purpose: it is a snapshot
 * of whatever the submit payload looked like when it was filed, which is not
 * guaranteed to match today's shape. A cast would let a field this panel has
 * never heard of render as "undefined" in the one view a reviewer uses to decide
 * whether to publish it.
 */
export interface Revision {
  revision_id: string
  submitted_by: string
  submitted_at: string
  payload: Record<string, unknown>
  decided_at?: string
  outcome?: ReviewStatus
  note?: string
}

export interface ReviewState {
  scholarship_id: string
  status: string
  review_status: ReviewStatus
  listing_state: ListingState
  review_note?: string
  pending_revision?: Revision
}
