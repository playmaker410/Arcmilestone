import { LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { dashboardLinks } from '../data/navigation'
import useApp from '../hooks/useApp'
import { shortenAddress } from '../utils/format'
import Logo from './Logo'

export default function Sidebar() {
  const { wallet, isWalletConnected, isWalletBusy, connectWallet, disconnectWallet, unreadCount } = useApp()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/8 bg-ink-950 lg:flex">
      <div className="px-5 py-6"><Logo inverse /></div>
      <nav className="flex-1 px-3" aria-label="Dashboard navigation">
        <p className="px-3 pb-2 pt-4 text-[10px] font-bold tracking-[0.16em] text-slate-500 uppercase">Workspace</p>
        <ul className="space-y-1">
          {dashboardLinks.map(({ label, to, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`
                }
              >
                <Icon className="size-[18px]" aria-hidden="true" />
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
      <div className="m-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
        {isWalletConnected ? (
          <>
            <div className="flex items-center gap-2 text-xs font-bold text-mint-400">
              <span className="size-2 rounded-full bg-mint-400" />
              Connected
            </div>
            <p className="mt-3 text-sm font-bold text-white">{wallet.displayName}</p>
            <p className="mt-1 font-mono text-xs text-slate-400">{shortenAddress(wallet.address, 8, 6)}</p>
            <p className="mt-2 text-xs text-slate-500">{wallet.network}</p>
            <button
              type="button"
              onClick={disconnectWallet}
              disabled={isWalletBusy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              <LogOut className="size-4" />Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-white">Wallet disconnected</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Connect your wallet to access your account.</p>
            <button
              type="button"
              onClick={connectWallet}
              disabled={isWalletBusy}
              className="mt-4 w-full rounded-lg bg-mint-500 px-3 py-2 text-xs font-bold text-ink-950 hover:bg-mint-400 disabled:opacity-50"
            >
              {isWalletBusy ? 'Connecting…' : 'Connect wallet'}
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
