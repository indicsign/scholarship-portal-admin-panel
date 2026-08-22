import { createContext, useContext } from 'react'

import type { Context, Role } from './types'

export interface AuthState {
  status: 'loading' | 'anonymous' | 'mfa_required' | 'authenticated'
  context: Context | null
  contexts: Context[]
  /** Set while acting as another user; drives the banner and the End control. */
  impersonation: { sessionId: string; actingAs: Context; notice: string } | null
  error: string | null
}

export interface AuthApi extends AuthState {
  signIn(identifier: string, password: string, mfaCode?: string): Promise<void>
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
