import { LogOut, Menu, X } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { dashboardLinks } from '../data/navigation'
import useApp from '../hooks/useApp'
import { shortenAddress } from '../utils/format'
import Logo from './Logo'

export default function MobileNavigation({ open, onOpen, onClose }) {
  const { user, wallet, isWalletConnected, connectWallet, disconnectWallet, isWalletBusy, unreadCount } = useApp()

  const hasUsername = !!user?.username
  const displayLabel = hasUsername ? `@${user.username}` : wallet.displayName

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <>
      {/* Sticky top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={onOpen}
          className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="mobile-dashboard-menu"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <button
          type="button"
          className="backdrop-enter fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-label="Close navigation overlay"
        />
      )}

      {/* Drawer */}
      <aside
        id="mobile-dashboard-menu"
        aria-label="Mobile dashboard navigation"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(88vw,320px)] flex-col overflow-y-auto bg-ink-950 shadow-float transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-5">
          <Logo inverse />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3">
          <ul className="space-y-0.5">
            {dashboardLinks.map(({ label, to, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-white/10 text-white ring-1 ring-white/8'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`size-[18px] ${isActive ? 'text-mint-400' : ''}`} aria-hidden="true" />
                      <span className="flex-1">{label}</span>
                      {label === 'Notifications' && unreadCount > 0 && (
                        <span className="ml-auto rounded-full bg-mint-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Wallet footer */}
        <div className="m-3 mt-4 rounded-2xl border border-white/8 bg-white/[0.04] p-4">
          {isWalletConnected ? (
            <>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-mint-400" aria-hidden="true" />
                <span className="text-xs font-bold text-mint-400">Connected</span>
              </div>
              <p className={`mt-2 truncate text-sm font-bold ${hasUsername ? 'text-mint-400' : 'text-white'}`}>
                {displayLabel}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {shortenAddress(wallet.address, 8, 6)}
              </p>
              <button
                type="button"
                onClick={() => { disconnectWallet(); onClose() }}
                disabled={isWalletBusy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                <LogOut className="size-3.5" /> Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-white">Wallet disconnected</p>
              <button
                type="button"
                onClick={connectWallet}
                disabled={isWalletBusy}
                className="mt-3 w-full rounded-xl bg-mint-500 px-3 py-2 text-sm font-bold text-ink-950 transition hover:bg-mint-400 disabled:opacity-50"
              >
                {isWalletBusy ? 'Connecting…' : 'Connect wallet'}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
