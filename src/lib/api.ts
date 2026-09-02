/* The API client.
 *
 * One place that knows the base path, one place that knows how a failure is
 * shaped, and one place that decides what to do when a token expires. Every
 * screen calls through here so none of them has to get those three right.
 */

import type { ApiErrorBody, Envelope } from './types'

/** Must match API_VERSION on the server; see .env.example. */
//
// `||`, not `??`. With VITE_API_VERSION unset, Vite replaces `import.meta.env`
// with an object literal that simply lacks the key, and the bundler folds the
// access to the *string* "undefined" rather than leaving a nullish value for
// `??` to catch — every request then goes to /api/undefined. `||` also covers
// VITE_API_VERSION= (empty), which builds a panel calling /api/ with no version.
const VERSION = import.meta.env.VITE_API_VERSION || 'v1'

// A relative path, deliberately. The API's address is NOT baked in here: nginx
// (and `npm run dev`) proxies /api to it, so the browser sees one origin and
// sends the HttpOnly refresh cookie without CORS credentials or SameSite=None.
// An absolute URL here would make every call cross-origin and break that.
//
// Only VITE_-prefixed variables reach browser code at all, so an
// `import.meta.env.API_TARGET` is always undefined — API_TARGET is nginx's
// setting, read inside the container at start-up.
const BASE = `/api/${VERSION}`

/** A failure the API described, as against a network or parsing failure. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fields?: Record<string, string>
  readonly requestId?: string

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.fields = body.fields
    this.requestId = body.request_id
  }

  /** True when signing in again is the only way forward. */
  get isAuthFailure() {
    return this.status === 401
  }
}

/* The useful half of a failure, for somewhere with room for one line.
 *
 * domain.ErrValidation pairs a generic sentence — "Some of the details you
 * entered need attention." — with a map saying which detail and why. Where a
 * caller can only show one string, the map is the one worth showing: "That file
 * is 698 KB. Keep it under 5.0 MB." is actionable and the summary is not.
 *
 * Showing both is worse than showing either: the reader skips a sentence that
 * tells them nothing to reach the one that does.
 */
export function errorDetail(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const detail = Object.values(err.fields ?? {})
    return detail.length > 0 ? detail.join(' ') : err.message
  }
  return err instanceof Error ? err.message : fallback
}

/** Set by the auth provider. Kept in memory only — see the note in auth.tsx. */
let accessToken: string | null = null
let onAuthLost: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setAuthLostHandler(fn: (() => void) | null) {
  onAuthLost = fn
}

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  /** Skips the refresh-and-retry dance. Used by the auth calls themselves. */
  raw?: boolean
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // A non-JSON body from a JSON API means something upstream answered
    // instead — a proxy error page, usually. Surfacing the status is more
    // useful than a parse error.
    throw new ApiError(res.status, {
      code: 'UNEXPECTED_RESPONSE',
      message: `The server returned an unexpected response (${res.status}).`,
    })
  }
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(BASE + path, window.location.origin)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  return url.pathname + url.search
}

async function send<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    // The refresh token is an HttpOnly cookie; without this the browser would
    // not send it and every refresh would fail.
    credentials: 'same-origin',
    signal: opts.signal,
  })

  if (res.ok) return (await parse(res)) as T

  const body = (await parse(res)) as ApiErrorBody | null
  if (body?.error) throw new ApiError(res.status, body.error)

  // No error envelope means this did not come from the API at all — a dev
  // server with no proxy configured, a misrouted path, or something upstream
  // answering first. Naming that is more use than repeating the status code,
  // because the fix is in configuration rather than in the request.
  throw new ApiError(res.status, {
    code: 'NO_API',
    message: res.status === 404
      ? `Nothing is serving the API at ${BASE}. Check that the backend is running `
        + 'and that the dev server is proxying to it.'
      : `The API did not respond properly (${res.status}).`,
  })
}

/* --- refresh ------------------------------------------------------------------
 *
 * Access tokens last fifteen minutes, so an operator reading an audit log will
 * hit an expiry mid-session. One refresh is attempted transparently and the
 * original request replayed; a second failure hands control to the auth
 * provider, which signs out.
 *
 * The in-flight promise is shared so that five widgets refreshing at once
 * produce one refresh, not five — the server rotates the refresh token on every
 * use and treats a replayed one as theft, revoking the whole family. Racing
 * refreshes would sign the operator out for no reason. */

let refreshing: Promise<unknown | null> | null = null

/* Every refresh in this application, deduped.
 *
 * Sharing the in-flight promise is not an optimisation, it is the difference
 * between staying signed in and being thrown out. The server rotates the
 * refresh token on every use and treats an already-rotated one as replay —
 * identity.Refresh revokes the entire family and denylists every token the user
 * holds, because a replay is either a race or a theft and it cannot tell which.
 *
 * So two refreshes with the same cookie end the session. The retry path below
 * has always shared this promise; the session bootstrap did not — it called
 * /auth/refresh directly, and React's StrictMode runs an effect twice in
 * development, which is two refreshes a few milliseconds apart with the same
 * cookie. That is a replay by the server's definition, and the operator was
 * signed out shortly after signing in, with the audit log recording
 * REFRESH_TOKEN_REPLAY against them.
 *
 * Returns the whole envelope rather than the token, because the bootstrap needs
 * the account and its contexts as well.
 */
export async function refreshSession<T>(): Promise<T | null> {
  refreshing ??= (async () => {
    try {
      const res = await send<Envelope<{ token: { access_token: string } }>>(
        '/auth/refresh', { method: 'POST', raw: true },
      )
      setAccessToken(res.data.token.access_token)
      return res
    } catch {
      return null
    } finally {
      // Cleared on the next tick so concurrent callers all observe the same
      // settled promise before it is discarded.
      queueMicrotask(() => { refreshing = null })
    }
  })()

  return refreshing as Promise<T | null>
}

async function refresh(): Promise<string | null> {
  const res = await refreshSession<Envelope<{ token: { access_token: string } }>>()
  return res ? res.data.token.access_token : null
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await send<T>(path, opts)
  } catch (err) {
    if (!(err instanceof ApiError) || !err.isAuthFailure || opts.raw) throw err

    const token = await refresh()
    if (!token) {
      onAuthLost?.()
      throw err
    }
    return send<T>(path, opts)
  }
}

/** Unwraps the standard envelope. */
export async function get<T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) {
  const res = await request<Envelope<T>>(path, { query, signal })
  return res
}

export async function post<T>(path: string, body?: unknown) {
  return request<Envelope<T>>(path, { method: 'POST', body })
}

export async function patch<T>(path: string, body?: unknown) {
  return request<Envelope<T>>(path, { method: 'PATCH', body })
}

/* A whole-record replacement, as against patch()'s one-field change.
 *
 * Both exist because the API means different things by them: PATCH carries the
 * fields that change, PUT carries the record as it should now read. Sending a
 * partial body to a PUT route is how a description gets erased by an edit to a
 * title, so the caller has to have said which of the two it meant. */
export async function put<T>(path: string, body?: unknown) {
  return request<Envelope<T>>(path, { method: 'PUT', body })
}

export async function del<T>(path: string, body?: unknown) {
  return request<Envelope<T> | null>(path, { method: 'DELETE', body })
}

/* Binary content, with the access token attached.
 *
 * An <img src> cannot carry an Authorization header — there is no API for it —
 * so anything the panel displays that a row-level policy guards has to be
 * fetched here and handed to the element as a blob URL. Without this, a picture
 * belonging to an unpublished row is requested anonymously and correctly
 * refused, which looks exactly like a broken upload.
 *
 * One refresh-and-retry, matching request(): an operator with a stale token
 * should see their logo, not a placeholder.
 */
export async function fetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const send = () => fetch(`${BASE}${path}`, {
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    credentials: 'same-origin',
    signal,
  })

  let res = await send()

  if (res.status === 401) {
    const token = await refresh()
    if (!token) {
      onAuthLost?.()
      throw new ApiError(401, { code: 'UNAUTHENTICATED', message: 'Sign in again.' })
    }
    res = await send()
  }

  if (!res.ok) {
    throw new ApiError(res.status, {
      code: res.status === 404 ? 'NOT_FOUND' : 'IMAGE_UNAVAILABLE',
      message: res.status === 404
        ? 'There is no picture here.'
        : `The picture could not be loaded (${res.status}).`,
    })
  }

  return res.blob()
}

/* Multipart upload.
 *
 * Separate from send() because the Content-Type must be left unset: the browser
 * generates the multipart boundary and writes the header itself, and forcing
 * application/json — or even multipart/form-data without the boundary — makes
 * the body unparseable at the other end.
 *
 * No refresh-and-retry. A body here is a file the operator has already chosen,
 * and replaying it after a token refresh would upload it twice; a 401 during an
 * upload is rare enough to be worth one clear failure instead.
 */
export async function upload<T>(path: string, form: FormData): Promise<Envelope<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: form,
    credentials: 'same-origin',
  })

  const text = await res.text()
  const body = text ? JSON.parse(text) : null

  if (res.ok) return body as Envelope<T>

  throw new ApiError(res.status, body?.error ?? {
    code: 'UPLOAD_FAILED',
    message: 'We could not upload that file.',
  })
}

/** Login bypasses the refresh path: there is no session to refresh yet. */
export async function login(body: unknown) {
  return request<Envelope<import('./types').LoginResult>>('/auth/login', {
    method: 'POST', body, raw: true,
  })
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST', raw: true })
  } catch {
    // A failed sign-out must still clear local state, or the operator is stuck
    // looking at a session they believe they have ended.
  }
}
