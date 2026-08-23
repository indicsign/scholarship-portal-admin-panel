import { createContext, useContext } from 'react'

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
  error: string | null
}

export interface AuthApi extends AuthState {
  signIn(identifier: string, password: string, mfaCode?: string): Promise<void>
  /** Replaces a temporary password. No current password: see SetInitialPassword. */
  setPassword(newPassword: string): Promise<void>
  signOut(): Promise<void>
  startImpersonation(targetUserId: string, reason: string): Promise<void>
  endImpersonation(): Promise<void>
  can(...roles: Role[]): boolean
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
