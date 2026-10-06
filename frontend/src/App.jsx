import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppProvider from './context/AppContext'
import DashboardLayout from './layouts/DashboardLayout'
import useApp from './hooks/useApp'
import UsernameSetupModal from './components/UsernameSetupModal'
import CreateJob from './pages/CreateJob'
import Help from './pages/Help'
import Home from './pages/Home'
import JobDetails from './pages/JobDetails'
import Jobs from './pages/Jobs'
import NotFound from './pages/NotFound'
import Notifications from './pages/Notifications'
import Overview from './pages/Overview'
import Settings from './pages/Settings'
import Transactions from './pages/Transactions'
import ExploreJobs from './pages/ExploreJobs'
import MyApplications from './pages/MyApplications'
import ReviewApplications from './pages/ReviewApplications'

/**
 * AuthGuard
 *
 * Wraps all protected dashboard routes. It has three responsibilities:
 *
 *  1. While the session is being restored from localStorage, show a loading
 *     spinner so the user never sees a flash to the home page.
 *
 *  2. If the user is not authenticated, redirect them to the landing page.
 *
 *  3. If the user IS authenticated but has no username yet (needsUsername),
 *     render the UsernameSetupModal *over* the dashboard content.
 *     The modal is blocking — it cannot be dismissed — so the user must
 *     complete profile setup before interacting with the marketplace.
 *     Once they confirm a username, setUserUsername patches local state and
 *     needsUsername becomes false, removing the modal automatically.
 *
 * Why overlay instead of redirect?
 *   Keeping the dashboard mounted underneath means the user lands exactly
 *   where they intended after setup, with no extra navigation step.
 */
function AuthGuard({ children }) {
  const { isWalletConnected, authLoading, needsUsername, setUserUsername } = useApp()

  // Phase 1: session restoration in progress — show a neutral loading state
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    )
  }

  // Phase 2: not authenticated — send to the landing page
  if (!isWalletConnected) return <Navigate to="/" replace />

  // Phase 3: authenticated — render the dashboard, plus the username modal
  //          when the user hasn't chosen a username yet.
  return (
    <>
      {children}

      {/*
       * UsernameSetupModal sits in a React portal-like position (fixed
       * full-screen via Tailwind's `fixed inset-0 z-50`) so it covers the
       * entire dashboard regardless of scroll position or nested layout.
       *
       * It is only rendered when needsUsername is true, so returning users
       * (whose user.username is already set) never see it again.
       */}
      {needsUsername && (
        <UsernameSetupModal
          /**
           * onComplete is called with the confirmed username string after
           * the backend PATCH /api/users/me succeeds inside the modal.
           * setUserUsername patches the local user object so needsUsername
           * flips to false and the modal unmounts.
           */
          onComplete={setUserUsername}
        />
      )}
    </>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        element={
          <AuthGuard>
            <DashboardLayout />
          </AuthGuard>
        }
      >
        <Route path="/dashboard" element={<Overview />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/explore" element={<ExploreJobs />} />
        <Route path="/jobs/create" element={<CreateJob />} />
        <Route path="/jobs/:id" element={<JobDetails />} />
        <Route path="/jobs/:id/applications" element={<ReviewApplications />} />
        <Route path="/applications" element={<MyApplications />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
      </Route>
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  )
}

export default App
