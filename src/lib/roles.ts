import type { OrgType, Role } from './types'

/** Roles permitted to use this panel at all — the platform-scope three. */
export const PLATFORM_ROLES: Role[] = [
  'PLATFORM_SUPER_ADMIN', 'PLATFORM_STAFF', 'COMPLIANCE_OFFICER',
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
