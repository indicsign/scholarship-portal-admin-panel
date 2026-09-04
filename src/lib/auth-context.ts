import { createContext, useContext } from 'react'

import type { Level, Permissions, Section } from './permissions'
import type { Account, Context, Role } from './types'

export interface AuthState {
  /* must_set_password sits between the two: the session is real and the token is
   installed, but the password used was issued by an administrator and expires,
   so nothing else is offered until one of their own is chosen. */
  status: 'loading' | 'anonymous' | 'mfa_required' | 'must_set_password' | 'authenticated'
  /** The signed-in account. Null whenever there is no session to name. */
  account: Account | null
  context: Context | null
  contexts: Context[]
  /** Set while acting as another user; drives the banner and the End control. */
  impersonation: { sessionId: string; actingAs: Context; notice: string } | null
  /* What this role may do, section by section, from GET /admin/my-permissions.
   *
   * Null until it has been fetched, and null on its own says nothing about what
   * is allowed — permissionsState below is what distinguishes "not yet" from
   * "could not be read", and the two render differently.
   *
   * Re-fetched during a support session, where the role on the token belongs to
   * the person being impersonated. See the fetch in AuthProvider. */
  permissions: Permissions | null
  /* Whether the grid above is known.
   *
   *   loading      the fetch is in flight. Nothing is drawn — a flicker, not a
   *                wrong answer.
   *   ready        the grid decides.
   *   unavailable  it could not be read, most likely an API that predates the
   *                endpoint. EVERYTHING is drawn, so the panel keeps working
   *                against an older server rather than losing its whole
   *                navigation to a deployment ordering.
   *
   * That last one is only safe because nothing on this side enforces anything.
   * Every endpoint behind every link carries the same check server-side, so a
   * permissive fallback costs a link that answers 403 — which is how the panel
   * behaved before the grid existed. The same fallback in the middleware would
   * be a privilege escalation. */
  permissionsState: 'loading' | 'ready' | 'unavailable'
  error: string | null
}

export interface AuthApi extends AuthState {
  signIn(identifier: string, password: string, mfaCode?: string): Promise<void>
  /* Replaces a temporary password, and claims a username if the account has
     none. No current password: see SetInitialPassword. */
  setPassword(newPassword: string, username?: string): Promise<void>
  signOut(): Promise<void>
  startImpersonation(targetUserId: string, reason: string): Promise<void>
  endImpersonation(): Promise<void>
  can(...roles: Role[]): boolean
  /* Whether the signed-in role may act at this weight in this section.
   *
   * Named apart from `can` because the two answer different questions and
   * neither replaces the other. `can` asks who you are — which is still what
   * decides whether the panel offers a role-specific screen at all. This asks
   * what you may do, from a table a super admin edits without a deploy.
   *
   * Draws, never allows: the endpoint behind every one of these carries the
   * same check. See lib/permissions.ts. */
  may(section: Section, need?: Level): boolean
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
