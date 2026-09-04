import { humanise } from './format'
import type { OrgType, Role } from './types'

/* The five platform-scope roles, under the three things they are for.
 *
 * Five peers in a dropdown is a list somebody reads twice. Grouped, the choice
 * is made in two steps — what is this person here to do, then how much of it —
 * and the second step is between two options rather than five.
 *
 * The groups are headings and NOT a collapse of the roles into three. That
 * distinction is the whole point: enums.go makes ADMIN the role that "cannot
 * grant a role or approve an erasure… neither should be reachable by the role
 * somebody uses all day", and TECHNICAL one that "reads and writes nothing",
 * enforced by the API refusing it any method but GET. Two accounts labelled
 * only "Admin" or only "User" would look identical while one could hand out
 * power and the other could not. So the heading says what the pair is for and
 * the role underneath still says which one it is.
 *
 * Order within each group is most authority first, so the powerful choice is a
 * deliberate one rather than whatever the dropdown opens on.
 */
export const PLATFORM_ROLE_GROUPS: { label: string; roles: Role[] }[] = [
  { label: 'Admin', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'User', roles: ['TECHNICAL', 'STAFF'] },
  { label: 'Compliance', roles: ['COMPLIANCE'] },
]

/* Roles permitted to use this panel at all, flattened out of the groups above.
 *
 * Derived rather than written out a second time. The two lists have to agree —
 * this one decides who may reach the panel, that one decides what a dropdown
 * offers — and a role added to one and forgotten in the other is either an
 * account nobody can create or a role the panel offers and the API refuses.
 * Deriving makes that impossible instead of merely unlikely, and the order is
 * the same as the hand-written list it replaces. */
export const PLATFORM_ROLES: Role[] = PLATFORM_ROLE_GROUPS.flatMap(g => g.roles)

export function isPlatformRole(role: Role | undefined) {
  return !!role && PLATFORM_ROLES.includes(role)
}

/* The role that means anything inside an organisation of a given type.
 *
 * Exactly one, now — the kind of organisation determines it. A government
 * department cannot hold CORPORATE: the database refuses it in a trigger, and
 * offering it here only to have it rejected would be a worse way to find that
 * out. Still returns an array, because the caller renders a list and because
 * this returning more than one again is the shape a restored separation of
 * duties would take. Mirrors org/src/lib/roles.ts.
 */
export function rolesFor(type: OrgType | undefined): Role[] {
  switch (type) {
    case 'NGO': return ['NGO']
    case 'CORPORATE': return ['CORPORATE']
    case 'GOVERNMENT': return ['GOVT']
    case 'PRIVATE': return ['PRIVATE']
    default: return []
  }
}

/** The one role each kind of organisation holds, for a form that needs it flat. */
export function roleForOrgType(type: OrgType | undefined): Role | undefined {
  return rolesFor(type)[0]
}

/* How a role is written for a person to read.
 *
 * Not humanise(): it has a shortcut that returns any all-caps word of five
 * letters or fewer unchanged, on the assumption that such a thing is an acronym.
 * That is right for NGO and wrong for ADMIN and STAFF, which would be left
 * shouting. Naming them here also means the words on screen can differ from the
 * values in the database without anyone having to rename an enum to fix a label.
 */
const ROLE_LABELS: Partial<Record<Role, string>> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TECHNICAL: 'Technical',
  STAFF: 'Staff',
  COMPLIANCE: 'Compliance',
  // NGO survives humanise() intact; the other three do not read well shouted.
  CORPORATE: 'Corporate',
  GOVT: 'Government',
  PRIVATE: 'Private',
}

export function roleLabel(role: string) {
  return ROLE_LABELS[role as Role] ?? humanise(role)
}
