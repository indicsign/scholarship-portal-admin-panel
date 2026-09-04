/* Authentication state for the panel.
 *
 * Two things here are not incidental.
 *
 * The access token is held in memory and nowhere else. localStorage would
 * survive a reload, which is convenient, and would also hand the token to any
 * script that manages to run on this origin. The refresh cookie is HttpOnly and
 * already provides the survive-a-reload behaviour without that exposure, so a
 * reload silently re-establishes the session instead.
 *
 * The MFA step is a first-class state rather than an error. Every role that can
 * use this panel is required to hold a second factor (Table 3.3), so the
 * two-step flow is the normal path, not the exceptional one.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import * as api from './api'
import { AuthContext, type AuthApi, type AuthState } from './auth-context'
import { can as allowedBy, type Level, type Permissions, type Section } from './permissions'
import { isPlatformRole } from './roles'
import type { LoginResult, Role } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    account: null,
    context: null,
    contexts: [],
    impersonation: null,
    permissions: null,
    error: null,
  })

  /** Credentials held between the password step and the MFA step. */
  const pending = useRef<{ identifier: string; password: string } | null>(null)
  /** Cleared when a support session lapses on its own. */
  const impersonationTimer = useRef<number | null>(null)

  const applyLogin = useCallback((result: LoginResult) => {
    if (result.mfa_required) {
      // The token issued here opens the MFA challenge and nothing else, so it
      // is deliberately not installed as the session token.
      setState(s => ({ ...s, status: 'mfa_required', error: null }))
      return
    }

    if (!isPlatformRole(result.active_context.role)) {
      // A student or an NGO case worker has a valid account and no business in
      // this panel. Refusing here, rather than letting every request 403, is
      // the difference between one clear sentence and a wall of failures.
      api.setAccessToken(null)
      setState({
        status: 'anonymous', account: null, context: null, contexts: [], permissions: null,
        impersonation: null,
        error: 'This account does not have access to the admin panel. '
             + 'Sign in to the portal for your organisation instead.',
      })
      return
    }

    api.setAccessToken(result.token.access_token)
    pending.current = null

    // The token is installed first: the session is genuine, and the password
    // form needs it to authenticate the change. What is withheld is the rest of
    // the application, not the session.
    if (result.must_change_password) {
      setState({
        status: 'must_set_password',
        account: result.account,
        context: result.active_context,
        contexts: result.contexts,
        impersonation: null,
        // Not fetched here. Nothing but the password form is rendered until one
        // of their own is chosen, so there is no sidebar to draw and no reason
        // to spend a request on a grid nothing will read.
        permissions: null,
        error: null,
      })
      return
    }

    setState({
      status: 'authenticated',
      account: result.account,
      context: result.active_context,
      contexts: result.contexts,
      impersonation: null,
      /* Left null and filled in by the effect below.
       *
       * Not awaited here, and that is deliberate: applyLogin runs on the reload
       * path too, and blocking the whole panel on a second round trip is what
       * the portal's first-paint work spent a week undoing. The sidebar renders
       * empty for one tick instead — see AuthState.permissions for why empty
       * rather than full is the right thing to render while it is unknown. */
      permissions: null,
      error: null,
    })
  }, [])

  const setPassword = useCallback(async (newPassword: string, username?: string) => {
    await api.post('/auth/password/initial', {
      new_password: newPassword,
      // Omitted rather than sent empty: the server asks for one only when the
      // account has none, and an empty string would read as a bad answer to a
      // question it never put.
      username: username?.trim() || undefined,
    })
    // The account no longer owes a change, so the rest of the application opens.
    // No re-login: setting a password revokes other sessions, not this one.
    setState(s => ({ ...s, status: 'authenticated', error: null }))
  }, [])

  const signOut = useCallback(async () => {
    await api.logout()
    api.setAccessToken(null)
    pending.current = null
    if (impersonationTimer.current) window.clearTimeout(impersonationTimer.current)
    setState({
      status: 'anonymous', account: null, context: null, contexts: [], permissions: null,
      impersonation: null, error: null,
    })
  }, [])

  // A reload leaves no token in memory but the refresh cookie is still there,
  // so the session is re-established rather than the operator being asked to
  // sign in again for having pressed F5.
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        // Through the shared refresh, never directly: StrictMode mounts this
        // effect twice, and two refreshes with one cookie is a replay to the
        // server, which revokes the whole family. See api.refreshSession.
        const res = await api.refreshSession<{ data: LoginResult }>()
        if (!res) throw new Error('no session')
        if (!cancelled) applyLogin(res.data)
      } catch {
        if (!cancelled) setState(s => ({ ...s, status: 'anonymous' }))
      }
    })()

    return () => { cancelled = true }
  }, [applyLogin])

  // A failed refresh mid-session means the session is genuinely over.
  useEffect(() => {
    api.setAuthLostHandler(() => {
      api.setAccessToken(null)
      setState({
        status: 'anonymous', account: null, context: null, contexts: [], permissions: null,
        impersonation: null,
        error: 'Your session has ended. Please sign in again.',
      })
    })
    return () => api.setAuthLostHandler(null)
  }, [])

  const signIn = useCallback(async (identifier: string, password: string, mfaCode?: string) => {
    setState(s => ({ ...s, error: null }))

    const creds = mfaCode
      ? pending.current ?? { identifier, password }
      : { identifier, password }

    try {
      const res = await api.login({ ...creds, ...(mfaCode ? { mfa_code: mfaCode } : {}) })
      if (res.data.mfa_required) pending.current = creds
      applyLogin(res.data)
    } catch (err) {
      const message = err instanceof api.ApiError
        ? err.message
        : 'We could not reach the server. Check that the API is running.'
      setState(s => ({ ...s, error: message }))
      throw err
    }
  }, [applyLogin])

  const startImpersonation = useCallback(async (targetUserId: string, reason: string) => {
    const res = await api.post<import('./types').ImpersonationResult>('/admin/impersonate', {
      target_user_id: targetUserId,
      reason,
    })

    const { token, session_id, acting_as, notice, expires_at } = res.data
    api.setAccessToken(token.access_token)

    setState(s => ({
      ...s,
      impersonation: { sessionId: session_id, actingAs: acting_as, notice },
    }))

    // The server caps the session at fifteen minutes. Clearing local state when
    // it lapses stops the banner claiming an active session that has already
    // ended — which would leave an operator believing they are still acting as
    // somebody while their requests fail.
    if (impersonationTimer.current) window.clearTimeout(impersonationTimer.current)
    const remaining = new Date(expires_at).getTime() - Date.now()
    impersonationTimer.current = window.setTimeout(() => {
      setState(s => ({ ...s, impersonation: null }))
      void signOut()
    }, Math.max(remaining, 0))
  }, [signOut])

  const endImpersonation = useCallback(async () => {
    try {
      // Not under /admin, unlike the endpoint that STARTS a session. During a
      // session the token carries the target's role, so a platform-scoped path
      // would be unreachable from inside the very session it ends. The
      // asymmetry in the URL mirrors the asymmetry in who may call it.
      await api.post('/impersonate/end')
    } finally {
      if (impersonationTimer.current) window.clearTimeout(impersonationTimer.current)
      // The impersonation token is denylisted server-side when the session
      // ends, so there is no way back to the operator's own token from here.
      // Signing out and back in is the honest outcome.
      await signOut()
    }
  }, [signOut])

  /* Fetch the caller's own grid once the session is real.
   *
   * Keyed on the role rather than on `status` alone, so switching context —
   * and starting or ending a support session, which replaces the role on the
   * token — re-reads it. Impersonation is the case that makes this necessary:
   * during a session the token carries the target's role, and a sidebar still
   * drawn from the operator's own permissions would offer screens the API is
   * now refusing.
   *
   * A failure leaves it null, which draws nothing rather than everything. That
   * is a visibly broken panel instead of a quietly wrong one, and the operator
   * can reload; the alternative fails open on an authorisation question.
   */
  const role = state.context?.role
  const authenticated = state.status === 'authenticated'

  useEffect(() => {
    if (!authenticated || !role) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await api.get<{ sections: Permissions }>('/admin/my-permissions')
        if (!cancelled) setState(s => ({ ...s, permissions: res.data.sections }))
      } catch {
        if (!cancelled) setState(s => ({ ...s, permissions: null }))
      }
    })()

    return () => { cancelled = true }
  }, [authenticated, role])

  const can = useCallback(
    (...roles: Role[]) => !!state.context && roles.includes(state.context.role),
    [state.context],
  )

  const may = useCallback(
    (section: Section, need: Level = 'VIEW') => allowedBy(state.permissions, section, need),
    [state.permissions],
  )

  const value = useMemo<AuthApi>(
    () => ({ ...state, signIn, setPassword, signOut, startImpersonation, endImpersonation, can, may }),
    [state, signIn, setPassword, signOut, startImpersonation, endImpersonation, can, may],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
