import { Navigate, Route, Routes } from 'react-router-dom'

import * as api from './lib/api'
import { useAuth } from './lib/auth-context'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import { useQuery } from './lib/hooks'
import Audit from './pages/Audit'
import Dashboard from './pages/Dashboard'
import Grievances from './pages/Grievances'
import Scholarships from './pages/Scholarships'
import Messages from './pages/Messages'
import Ecosystem from './pages/Ecosystem'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import Users from './pages/Users'
import Organisations from './pages/Organisations'
import Verifications from './pages/Verifications'
import Slides from './pages/Slides'
import Support from './pages/Support'
import type { QueueCounts } from './lib/queues'
import type { Catalogue, Organisation, VerificationCounts } from './lib/types'

export default function App() {
  const { status } = useAuth()

  // A reload re-establishes the session from the HttpOnly refresh cookie, so
  // the first paint is a wait rather than a sign-in form. Showing the form here
  // would flash it at an operator who is already signed in.
  if (status === 'loading') {
    return <main id="main" className="login"><Loading label="Restoring your session" /></main>
  }

  // A real session that owes a password. Placed before the anonymous check so
  // the sign-in form is not shown to somebody who is already signed in.
  if (status === 'must_set_password') return <SetPassword />

  if (status !== 'authenticated') return <Login />

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  /* The three queues in the Decisions group, counted once at the shell.
   *
   * All three share a failure mode — nobody looks — and all three run against a
   * clock, which is what earns them a number in the sidebar while the other
   * sections get none.
   *
   * The queues themselves are declared in lib/queues.ts, which is what the
   * sidebar and the bell also read. Not fetched from that list in a loop, and
   * that is deliberate: useQuery is a hook, so a loop over a list would break
   * the rules of hooks the first time the list became conditional. The list
   * decides what a queue IS; these three calls decide how each is counted, and
   * two of them return a figure set directly rather than a page of one row.
   */
  const pending = useQuery<Organisation[]>(
    signal => api.get('/admin/organisations', {
      status: 'PENDING_APPROVAL', page_size: 1,
    }, signal),
    [],
  )

  /* Like the review counts, this endpoint returns the figure set directly
     rather than a page of one row. */
  /* Schemes waiting on a platform decision. Read from the catalogue rather than
     from the old review-queue endpoint, because the catalogue is now where the
     decision is taken — one source, so the badge and the screen it points at
     cannot disagree. page_size 1: only the counts are wanted. */
  const catalogue = useQuery<Catalogue>(
    signal => api.get('/admin/scholarships', { page_size: 1 }, signal),
    [],
  )

  const verifications = useQuery<VerificationCounts>(
    signal => api.get('/admin/verifications/counts', undefined, signal),
    [],
  )

  /* Overdue, not open. The grievance queue is sorted by breach and was the one
   * of the three carrying no count, because until now the API could only filter
   * by status — and a badge showing every open grievance would sit at forty-odd
   * permanently, which is a badge nobody reads. `overdue=true` counts the ones
   * past the date the student was promised. */
  const grievances = useQuery<unknown[]>(
    signal => api.get('/grievances', { overdue: 'true', page_size: 1 }, signal),
    [],
  )

  const counts: QueueCounts = {
    organisations: pending.meta?.total ?? 0,
    scholarships: catalogue.data?.counts.pending ?? 0,
    verifications: verifications.data?.waiting ?? 0,
    grievances: grievances.meta?.total ?? 0,
  }

  return (
    <Routes>
      <Route element={<Layout counts={counts} />}>
        {/* The dashboard is the landing screen: the first question an
            operator has on opening the panel is how the platform is doing,
            not which organisation is waiting. The approval queue keeps its
            unread count in the sidebar so it is never missed for that. */}
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/verifications" element={<Verifications />} />
        <Route path="/organisations" element={<Organisations />} />
        <Route path="/grievances" element={<Grievances />} />
        <Route path="/scholarships" element={<Scholarships />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/slides" element={<Slides />} />
        <Route path="/ecosystem" element={<Ecosystem />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/support" element={<Support />} />
        <Route path="/users" element={<Users />} />
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
