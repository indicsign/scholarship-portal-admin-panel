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

/* The three roles that mean anything inside an organisation of a given type.
 *
 * A government department cannot appoint a "corporate reviewer": the database
 * refuses it in a trigger, and offering it here only to have it rejected would
 * be a worse way to find that out. Mirrors org/src/lib/roles.ts, which the
 * organisation portal uses for the same form.
 */
export function rolesFor(type: OrgType | undefined): Role[] {
  switch (type) {
    case 'NGO': return ['NGO_ADMIN', 'NGO_CASE_WORKER', 'NGO_VERIFIER']
    case 'CORPORATE': return ['CORPORATE_ADMIN', 'CORPORATE_REVIEWER', 'CORPORATE_FINANCE']
    case 'GOVERNMENT':
      return ['GOVT_DEPARTMENT_ADMIN', 'GOVT_VERIFICATION_OFFICER', 'GOVT_FINANCE_OFFICER']
    default: return []
  }
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
}

export function roleLabel(role: string) {
  return ROLE_LABELS[role as Role] ?? humanise(role)
}
