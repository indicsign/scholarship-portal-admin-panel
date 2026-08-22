import { useState } from 'react'

import { applyTheme, readTheme, type Theme } from '../lib/theme'

/* The theme control.
 *
 * The same reasoning as the student portal, for a different reason: an
 * operations console is read for hours at a stretch, and which ground is easier
 * on the eyes over a shift is not something a designer can decide on somebody
 * else's behalf. A compliance officer reading an audit log all afternoon should
 * be able to pick.
 */
export default function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(() => readTheme())

  function change(next: Theme) {
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="field" style={{ margin: 0 }}>
      <label htmlFor="theme" style={{ fontSize: 12 }}>Colours</label>
      <select id="theme" value={theme} onChange={e => change(e.target.value as Theme)}>
        <option value="system">Match my device</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  )
}
