import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppProvider from './context/AppContext'
import DashboardLayout from './layouts/DashboardLayout'
import useApp from './hooks/useApp'
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

// AuthGuard must be inside AppProvider to use useApp
function AuthGuard({ children }) {
  const { isWalletConnected, authLoading } = useApp()
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    )
  }
  if (!isWalletConnected) return <Navigate to="/" replace />
  return children
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
