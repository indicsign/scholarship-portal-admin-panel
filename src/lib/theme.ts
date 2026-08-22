/* Theme preference.
 *
 * Three states, and the third is the important one: "follow my device" has to
 * remain reachable, because somebody who set their phone to dark for a reason
 * should not have to remember to set it again here.
 *
 * See the note at the top of styles.css for why an override exists at all —
 * briefly, light sensitivity and astigmatism pull in opposite directions, and
 * both are common in this user base.
 */

export type Theme = 'light' | 'dark' | 'system'

export const STORAGE_KEY = 'scholarship.theme'

export function readTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement

  if (theme === 'system') {
    // Removing the attribute is what hands control back to the media query;
    // setting data-theme="system" would match neither selector and leave the
    // page on the light palette regardless of the device.
    root.removeAttribute('data-theme')
    localStorage.removeItem(STORAGE_KEY)
    return
  }

  root.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEY, theme)
}
