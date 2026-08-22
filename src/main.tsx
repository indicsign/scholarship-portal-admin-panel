import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { AuthProvider } from './lib/auth'
import { Announcer } from './components/Announcer'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      {/* Announcer wraps everything so any screen can speak an async result
          into the same live region, rather than each one growing its own. */}
      <Announcer>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Announcer>
    </BrowserRouter>
  </StrictMode>,
)
