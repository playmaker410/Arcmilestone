import { Bell, CircleHelp, Compass, FileUser, LayoutDashboard, ListChecks, PlusCircle, Settings, WalletCards } from 'lucide-react'

export const dashboardLinks = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Explore Jobs', to: '/explore', icon: Compass },
  { label: 'Create Job', to: '/jobs/create', icon: PlusCircle },
  { label: 'My Jobs', to: '/jobs', icon: ListChecks, end: true },
  { label: 'My Applications', to: '/applications', icon: FileUser },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Transactions', to: '/transactions', icon: WalletCards },
  { label: 'Settings', to: '/settings', icon: Settings },
  { label: 'Help', to: '/help', icon: CircleHelp },
]
