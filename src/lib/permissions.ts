/* What a role may do, section by section — the panel's half of migration 0041.
 *
 * This decides what is *drawn*. It decides nothing about what is *allowed*:
 * every endpoint behind these screens carries the same check server-side, in
 * addition to the role guard it always had. A bug here shows somebody a link
 * that answers 403, which is untidy; a bug here cannot give anybody anything.
 *
 * That asymmetry is why this file is allowed to exist at all. A panel that
 * renders every link and lets the API refuse them is technically correct and
 * unusable — an operator cannot tell a screen they are not meant to have from
 * one that is broken, and support requests arrive as "the panel says no".
 */

import type { Role } from './types'

/* The eleven entries in the sidebar.
 *
 * The values are route names, matching domain.Section in the API — /scholarships
 * is `scholarships` — so the two lists can be read against each other. The four
 * group headings the sidebar draws are not sections: Overview, Decisions,
 * Published and Oversight are a reading aid, and a permission on one would have
 * to mean something about its children that the model cannot express.
 *
 * Order is the sidebar's, because the grid that edits these is rendered from it
 * and a grid whose rows run in a different order from the menu they describe is
 * a grid people mis-tick.
 */
export const SECTIONS = [
  'dashboard', 'ecosystem', 'scholarships', 'students', 'organisations',
  'grievances', 'messages', 'slides', 'audit', 'support', 'users',
] as const

export type Section = typeof SECTIONS[number]

/* The ladder. Ordered, not a set of independent flags.
 *
 * The grid draws three checkboxes because that is what an operator expects to
 * see, and they behave as rungs: ticking Edit ticks View, clearing View clears
 * everything above it. Three genuinely independent flags would allow "may
 * approve a scheme, may not look at one", which is not a state anybody wants
 * and which the API could not honour anyway.
 */
export const LEVELS = ['NONE', 'VIEW', 'EDIT', 'MANAGE'] as const
export type Level = typeof LEVELS[number]

/** Where a level sits on the ladder. An unknown value is NONE, which denies. */
export function rank(level: Level | undefined): number {
  const i = LEVELS.indexOf(level as Level)
  return i < 0 ? 0 : i
}

/** Whether a held level satisfies a required one. */
export function allows(held: Level | undefined, need: Level): boolean {
  return rank(held) >= rank(need)
}

/** One role's whole grid. A missing section reads as NONE. */
export type Permissions = Partial<Record<Section, Level>>

export function levelOf(perms: Permissions | null, section: Section): Level {
  return perms?.[section] ?? 'NONE'
}

export function can(
  perms: Permissions | null, section: Section, need: Level = 'VIEW',
): boolean {
  return allows(levelOf(perms, section), need)
}

/* How a section is written for a person to read.
 *
 * The sidebar's own labels, so the grid, the menu and the error message a
 * refused request produces all name the same thing the same way. Not derived
 * from the section key: "students" is the Students screen and "users" is User
 * management, and humanising either gives the wrong word.
 */
export const SECTION_LABELS: Record<Section, string> = {
  dashboard: 'Dashboard',
  ecosystem: 'Ecosystem',
  scholarships: 'Scholarships',
  students: 'Students',
  organisations: 'Organisations',
  grievances: 'Grievances',
  messages: 'Messages',
  slides: 'Slides',
  audit: 'Audit trail',
  support: 'Support access',
  users: 'User management',
}

/* The group each section sits under in the sidebar.
 *
 * Repeated here rather than imported from Layout, and that is a real
 * duplication worth naming. Layout's GROUPS carries routes, icons, shortcut
 * keys and per-entry role lists — importing it here would pull the whole
 * navigation model, icons included, into a screen that wants four headings.
 * The cost is that a section moved between groups has to be moved twice; the
 * check below is what makes that a build error rather than a silent omission.
 */
export const SECTION_GROUPS: { label: string; sections: Section[] }[] = [
  { label: 'Overview', sections: ['dashboard', 'ecosystem'] },
  {
    label: 'Decisions',
    sections: ['scholarships', 'students', 'organisations', 'grievances'],
  },
  { label: 'Published', sections: ['messages', 'slides'] },
  { label: 'Oversight', sections: ['audit', 'support', 'users'] },
]

/* What each level buys, in the words of the acts it permits.
 *
 * Shown in the grid beside the checkboxes, because "Manager" means nothing on
 * its own and the whole risk of this screen is somebody ticking a box whose
 * consequence they have not pictured. The sentences name real acts —
 * "approve, reject, request changes" — rather than describing a tier.
 *
 * Written per section because the answer genuinely differs. Manager on Slides
 * is deleting one; manager on Students is attesting to a disability
 * certificate, which moves a profile to ELIGIBLE across every scheme it
 * matches. A single generic sentence for both would be useless for one of them.
 */
export const LEVEL_HELP: Record<Section, Partial<Record<Level, string>>> = {
  dashboard: { VIEW: 'See the operations figures the panel opens on.' },
  ecosystem: { VIEW: 'See the anonymised aggregate meant for publication.' },
  scholarships: {
    VIEW: 'See the catalogue and the review queue.',
    EDIT: 'Create and amend curated listings, and set a sponsor mark.',
    MANAGE: 'Approve, reject, request changes, publish, archive. '
      + 'A publisher is emailed either way.',
  },
  students: {
    VIEW: 'See the verification queue and a student’s claims beside their evidence.',
    EDIT: 'Correct a student’s own record — the typo a certificate reveals.',
    MANAGE: 'Issue and revoke a verification. Attesting moves a profile to '
      + 'ELIGIBLE across every scheme it matches.',
  },
  organisations: {
    VIEW: 'See the register and the approval queue.',
    EDIT: 'Set and remove an organisation’s mark.',
    MANAGE: 'Approve, reject and suspend. An approved organisation can read '
      + 'applicants’ disability certificates.',
  },
  grievances: {
    VIEW: 'Read the queue and its history.',
    MANAGE: 'Resolve and assign. A complaint is closed for somebody who may '
      + 'not be in a position to notice it was closed wrongly.',
  },
  messages: {
    VIEW: 'Read the notification templates.',
    MANAGE: 'Edit them. The wording reaches every student the platform writes '
      + 'to next, and the message is sent before anybody reads it back.',
  },
  slides: {
    VIEW: 'See the landing page’s announcements, drafts included.',
    EDIT: 'Write, amend and illustrate them. Wrong until somebody notices, '
      + 'fixed by editing it back.',
    MANAGE: 'Delete one.',
  },
  audit: { VIEW: 'Read the log of who did what. It is append-only; there is nothing to change.' },
  support: {
    MANAGE: 'Sign in as another person. Every action during the session is '
      + 'recorded against you, and they are told afterwards.',
  },
  users: {
    VIEW: 'Read the account lists.',
    EDIT: 'Suspend, reinstate, deactivate, reset a password, end sessions.',
    MANAGE: 'Create accounts, and grant and revoke platform roles.',
  },
}

/* The levels a section actually offers.
 *
 * Not every section has all three, and drawing a checkbox that does nothing is
 * worse than drawing none: it invites somebody to tick it, then to wonder why
 * the person still cannot do the thing. Derived from LEVEL_HELP, so a section
 * gains a level by being given a sentence explaining it — which is the right
 * order to do those two things in.
 */
export function levelsFor(section: Section): Level[] {
  return (['VIEW', 'EDIT', 'MANAGE'] as Level[])
    .filter(l => LEVEL_HELP[section][l] !== undefined)
}

/** The API's shape for one row of the grid. */
export interface PermissionRow {
  role: Role
  sections: Record<string, Level>
  /** False for the super admin, which holds everything and cannot be lowered. */
  editable: boolean
  /** Live accounts holding this role, so a tick has a visible blast radius. */
  holders: number
}

export interface PermissionGrid {
  sections: Section[]
  roles: PermissionRow[]
}
