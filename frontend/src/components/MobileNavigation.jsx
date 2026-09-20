import { LogOut, Menu, X } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { dashboardLinks } from '../data/navigation'
import useApp from '../hooks/useApp'
import { shortenAddress } from '../utils/format'
import Logo from './Logo'

export default function MobileNavigation({ open, onOpen, onClose }) {
  const { wallet, isWalletConnected, connectWallet, disconnectWallet, isWalletBusy, unreadCount } = useApp()

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
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button type="button" onClick={onOpen} className="rounded-xl border border-slate-200 p-2.5 text-slate-700" aria-label="Open navigation" aria-expanded={open} aria-controls="mobile-dashboard-menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open && <button type="button" className="fixed inset-0 z-40 bg-ink-950/60 lg:hidden" onClick={onClose} aria-label="Close navigation overlay" />}
      <aside
        id="mobile-dashboard-menu"
        aria-label="Mobile dashboard navigation"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(88vw,340px)] flex-col overflow-y-auto bg-ink-950 p-4 shadow-float transition-transform duration-200 lg:hidden ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-1 py-2">
          <Logo inverse />
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close navigation">
            <X className="size-5" />
          </button>
        </div>
        <nav className="mt-6 flex-1">
          <ul className="space-y-1">
            {dashboardLinks.map(({ label, to, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`
                  }
                >
                  <Icon className="size-[18px]" />
                  {label}
                  {label === 'Notifications' && unreadCount > 0 && (
                    <span className="ml-auto rounded-full bg-mint-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          {isWalletConnected ? (
            <>
              <div className="flex items-center gap-2 text-xs font-bold text-mint-400">
                <span className="size-2 rounded-full bg-mint-400" />
                Connected
              </div>
              <p className="mt-2 text-sm font-bold text-white">{wallet.displayName}</p>
              <p className="mt-1 font-mono text-xs text-slate-300">{shortenAddress(wallet.address, 8, 6)}</p>
              <button
                type="button"
                onClick={() => { disconnectWallet(); onClose() }}
                disabled={isWalletBusy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white"
              >
                <LogOut className="size-4" />Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={connectWallet}
              disabled={isWalletBusy}
              className="w-full rounded-lg bg-mint-500 px-3 py-2 text-sm font-bold text-ink-950"
            >
              {isWalletBusy ? 'Connecting…' : 'Connect wallet'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
