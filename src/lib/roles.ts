import { humanise } from './format'
import type { OrgType, Role } from './types'

/** Roles permitted to use this panel at all — the five platform-scope roles. */
export const PLATFORM_ROLES: Role[] = [
  // In the order they are offered when creating an account: most authority
  // first, so the powerful choice is a deliberate one rather than the default.
  'SUPER_ADMIN', 'ADMIN', 'TECHNICAL', 'STAFF', 'COMPLIANCE',
]

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
