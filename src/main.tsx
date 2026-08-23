import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

import App from './App'
import { lastPlace } from './lib/place'
import { AuthProvider } from './lib/auth'
import { Announcer } from './components/Announcer'
import './styles.css'

/* Every screen lives at the same URL.
 *
 * MemoryRouter rather than BrowserRouter, so the address bar reads
 * https://admin.…/ on the dashboard, on the audit trail and on user management
 * alike. The routing itself is unchanged — NavLink, useLocation, aria-current
 * and the focus handling on route change all work exactly as before, because
 * the router still has a location; it just does not write it to the URL.
 *
 * The point is that the address bar is the leakiest surface a panel has. A path
 * lands in browser history on a shared machine, in a screenshot pasted into a
 * ticket, in a Referer header, and in every proxy log between here and the
 * operator — and "/users", "/audit", "/support" together describe the shape of
 * the administration surface to anyone who reads one.
 *
 * What it costs, stated because it is not recoverable: you cannot send somebody
 * a link to a screen. There is no URL for "the grievance queue" any more, so
 * sharing one means saying which screen to open.
 *
 * What it does not cost: refreshing keeps your place, restored below, and the
 * back and forward buttons still move between screens because MemoryRouter
 * keeps its own history stack.
 */
const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={[lastPlace()]}>
      {/* Announcer wraps everything so any screen can speak an async result
          into the same live region, rather than each one growing its own. */}
      <Announcer>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Announcer>
    </MemoryRouter>
  </StrictMode>,
)
