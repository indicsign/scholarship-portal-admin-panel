/* Types mirroring the API contract.
 *
 * Hand-written rather than generated, and deliberately narrow: this panel needs
 * a fraction of what the API returns, and a type that claims more than the
 * screen uses is a type nobody keeps accurate.
 */

export type Role =
  | 'PLATFORM_SUPER_ADMIN'
  | 'PLATFORM_STAFF'
  | 'COMPLIANCE_OFFICER'
  | 'STUDENT'
  | 'GUARDIAN'
  | 'NGO_ADMIN' | 'NGO_CASE_WORKER' | 'NGO_VERIFIER'
  | 'CORPORATE_ADMIN' | 'CORPORATE_REVIEWER' | 'CORPORATE_FINANCE'
  | 'GOVT_DEPARTMENT_ADMIN' | 'GOVT_VERIFICATION_OFFICER' | 'GOVT_FINANCE_OFFICER'

export type OrgType = 'NGO' | 'CORPORATE' | 'GOVERNMENT'
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

export interface LoginResult {
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

/* --- data requests (FR-20) ---------------------------------------------------
 *
 * The operator's queue. A student's right to export or erasure carries a
 * statutory clock, so how long a request has been waiting is part of the row
 * rather than something the reader works out. */

export interface DataRequest {
  request_id: string
  profile_id: string
  request_type: 'EXPORT' | 'ERASURE' | 'CORRECTION'
  status: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED'
  requested_at: string
  completed_at?: string
  student_name: string
  contact?: string
  waiting_days: number
  /** Reasons this cannot be fulfilled as asked. Empty means erasable now. */
  blockers: string[] | null
  rejection_reason?: string
  handled_by?: string
}

export interface ErasureResult {
  documents_deleted: number
  retained: string[]
  message: string
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
  roles: PlatformUserRole[]
}
