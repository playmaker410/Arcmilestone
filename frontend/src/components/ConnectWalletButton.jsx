import { LoaderCircle, PlugZap, WalletCards } from 'lucide-react'
import useApp from '../hooks/useApp'
import { shortenAddress } from '../utils/format'

export default function ConnectWalletButton({ dark = false, className = '' }) {
  const { wallet, isWalletConnected, isWalletBusy, connectWallet, authError } = useApp()

  if (isWalletConnected) {
    return (
      <div className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold ${dark ? 'border-white/15 bg-white/8 text-white' : 'border-slate-200 bg-white text-slate-800'} ${className}`}>
        <span className="size-2 rounded-full bg-mint-400" aria-hidden="true" />
        <WalletCards className="size-4" aria-hidden="true" />
        <span>{shortenAddress(wallet.address)}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={connectWallet}
        disabled={isWalletBusy}
        className={`${dark ? 'btn-primary' : 'btn-dark'} ${className}`}
      >
        {isWalletBusy ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
        {isWalletBusy ? 'Connecting…' : 'Connect Wallet'}
      </button>
      {authError && (
        <p className="mt-2 text-xs text-red-500">{authError}</p>
      )}
    </div>
  )
}
