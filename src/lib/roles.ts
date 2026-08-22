import type { Role } from './types'

/** Roles permitted to use this panel at all — the platform-scope three. */
export const PLATFORM_ROLES: Role[] = [
  'PLATFORM_SUPER_ADMIN', 'PLATFORM_STAFF', 'COMPLIANCE_OFFICER',
]

export function isPlatformRole(role: Role | undefined) {
  return !!role && PLATFORM_ROLES.includes(role)
}
