/* Which screen you were on.
 *
 * Every screen in this panel lives at the same URL — see MemoryRouter in
 * main.tsx — so the address bar cannot be what remembers your place across a
 * refresh. This does instead.
 *
 * sessionStorage rather than localStorage, deliberately. A refresh mid-task
 * should return you to the screen you were reading; closing the tab should not
 * leave behind a record of which screens an operator visited, because the whole
 * reason the path is out of the URL is that a shared machine remembers too much.
 *
 * Both calls are wrapped: a browser with site data blocked throws on access
 * rather than returning null, and losing your place is not worth a blank panel.
 */

const KEY = 'scholarship.admin.place'

/** An in-app absolute path only. */
const SAFE = /^\/[A-Za-z0-9\-_/]*$/

export function lastPlace(): string {
  try {
    const v = sessionStorage.getItem(KEY)
    /* Validated, not trusted. This value is fed to the router as its opening
     * location, so anything that is not a plain in-app path — a full URL, a
     * protocol-relative "//host" — would be a navigation target smuggled in
     * through storage. */
    if (v && SAFE.test(v)) return v
  } catch { /* storage unavailable; start at the top */ }
  return '/'
}

export function rememberPlace(path: string) {
  try {
    sessionStorage.setItem(KEY, path)
  } catch { /* storage unavailable; the place is simply not remembered */ }
}
