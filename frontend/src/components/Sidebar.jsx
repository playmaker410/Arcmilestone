import { LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { dashboardLinks } from '../data/navigation'
import useApp from '../hooks/useApp'
import { shortenAddress } from '../utils/format'
import Logo from './Logo'

export default function Sidebar() {
  const {
    user,
    wallet,
    isWalletConnected,
    isWalletBusy,
    connectWallet,
    disconnectWallet,
    unreadCount,
  } = useApp()

  const hasUsername = !!user?.username
  const displayLabel = hasUsername ? `@${user.username}` : wallet.displayName

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/8 bg-ink-950 lg:flex">
      {/* Logo */}
      <div className="px-5 py-6">
        <Logo inverse />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3" aria-label="Dashboard navigation">
        <p className="px-3 pb-2 pt-2 text-[10px] font-bold tracking-[0.16em] text-slate-600 uppercase">
          Workspace
        </p>
        <ul className="space-y-0.5">
          {dashboardLinks.map(({ label, to, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/8'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`size-[18px] transition-colors ${isActive ? 'text-mint-400' : ''}`}
                      aria-hidden="true"
                    />
                    <span className="flex-1">{label}</span>
                    {label === 'Notifications' && unreadCount > 0 && (
                      <span className="relative ml-auto grid size-5 place-items-center rounded-full bg-mint-500 text-[10px] font-bold text-white">
                        <span className="pulse-ring text-mint-500" aria-hidden="true" />
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

      {/* Wallet card */}
      <div className="m-3 rounded-2xl border border-white/8 bg-white/[0.04] p-4">
        {isWalletConnected ? (
          <>
            <div className="flex items-center gap-2">
              <span className="relative size-2 rounded-full bg-mint-400" aria-hidden="true" />
              <span className="text-xs font-bold text-mint-400">Connected</span>
            </div>

            <p className={`mt-3 text-sm font-bold truncate ${hasUsername ? 'text-mint-400' : 'text-white'}`}>
              {displayLabel}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {shortenAddress(wallet.address, 8, 6)}
            </p>
            {wallet.network && (
              <p className="mt-1 text-xs text-slate-600">{wallet.network}</p>
            )}

            <button
              type="button"
              onClick={disconnectWallet}
              disabled={isWalletBusy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 transition-all hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              <LogOut className="size-3.5" />
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-white">Wallet disconnected</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Connect to access your account.
            </p>
            <button
              type="button"
              onClick={connectWallet}
              disabled={isWalletBusy}
              className="mt-3 w-full rounded-xl bg-mint-500 px-3 py-2 text-xs font-bold text-ink-950 transition hover:bg-mint-400 disabled:opacity-50"
            >
              {isWalletBusy ? 'Connecting…' : 'Connect wallet'}
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
