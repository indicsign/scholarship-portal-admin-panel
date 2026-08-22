import { Navigate, Route, Routes } from 'react-router-dom'

import * as api from './lib/api'
import { useAuth } from './lib/auth-context'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import { useQuery } from './lib/hooks'
import Audit from './pages/Audit'
import Dashboard from './pages/Dashboard'
import DataRequests from './pages/DataRequests'
import Grievances from './pages/Grievances'
import Messages from './pages/Messages'
import Ecosystem from './pages/Ecosystem'
import Login from './pages/Login'
import Organisations from './pages/Organisations'
import Slides from './pages/Slides'
import Support from './pages/Support'
import type { Organisation } from './lib/types'

export default function App() {
  const { status } = useAuth()

  // A reload re-establishes the session from the HttpOnly refresh cookie, so
  // the first paint is a wait rather than a sign-in form. Showing the form here
  // would flash it at an operator who is already signed in.
  if (status === 'loading') {
    return <main id="main" className="login"><Loading label="Restoring your session" /></main>
  }

  if (status !== 'authenticated') return <Login />

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  // Fetched once at the shell so the sidebar can show how many organisations
  // are waiting. It is the panel's only genuinely time-sensitive number, and an
  // approval queue nobody looks at is the failure mode this guards against.
  const pending = useQuery<Organisation[]>(
    signal => api.get('/admin/organisations', {
      status: 'PENDING_APPROVAL', page_size: 1,
    }, signal),
    [],
  )

  // The other queue with somebody waiting at the end of it. A data request
  // runs against a statutory clock, so it earns a count in the sidebar for the
  // same reason the approval queue does: the failure mode is nobody looking.
  const dataRequests = useQuery<unknown[]>(
    signal => api.get('/admin/data-requests', {
      status: 'RECEIVED', page_size: 1,
    }, signal),
    [],
  )

  return (
    <Routes>
      <Route element={
        <Layout
          pendingOrganisations={pending.meta?.total ?? 0}
          openDataRequests={dataRequests.meta?.total ?? 0}
        />
      }>
        {/* The dashboard is the landing screen: the first question an
            operator has on opening the panel is how the platform is doing,
            not which organisation is waiting. The approval queue keeps its
            unread count in the sidebar so it is never missed for that. */}
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/organisations" element={<Organisations />} />
        <Route path="/data-requests" element={<DataRequests />} />
        <Route path="/grievances" element={<Grievances />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/slides" element={<Slides />} />
        <Route path="/ecosystem" element={<Ecosystem />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/support" element={<Support />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function NotFound() {
  return (
    <>
      <div className="page-head"><h1>Page not found</h1></div>
      <p className="muted">
        That address does not exist in the admin panel.{' '}
        <a href="/dashboard">Go to the dashboard</a>.
      </p>
    </>
  )
}
