import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import MobileNavigation from '../components/MobileNavigation'
import Sidebar from '../components/Sidebar'

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <Sidebar />
      <MobileNavigation
        open={mobileOpen}
        onOpen={() => setMobileOpen(true)}
        onClose={closeMobile}
      />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {/* key forces remount + re-animation on route change */}
          <div key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
