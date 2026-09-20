import useApp from '../hooks/useApp'
import { shortenAddress } from '../utils/format'

export default function WalletSwitcher({ inverse = false, onChange }) {
  const { wallet, demoWallets, switchWallet } = useApp()

  return (
    <div>
      <label htmlFor={inverse ? 'mobile-demo-wallet' : 'desktop-demo-wallet'} className={`mb-1.5 block text-[10px] font-bold tracking-wide uppercase ${inverse ? 'text-slate-500' : 'text-slate-500'}`}>
        Simulate wallet
      </label>
      <select
        id={inverse ? 'mobile-demo-wallet' : 'desktop-demo-wallet'}
        value={wallet.address}
        onChange={(event) => { switchWallet(event.target.value); onChange?.() }}
        className={`w-full rounded-lg border px-2 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-mint-500/40 ${inverse ? 'border-white/10 bg-ink-900 text-white' : 'border-slate-200 bg-white text-slate-800'}`}
      >
        {demoWallets.map((item) => (
          <option key={item.address} value={item.address}>{item.displayName} · {shortenAddress(item.address)}</option>
        ))}
      </select>
      <p className={`mt-1.5 text-[10px] ${inverse ? 'text-slate-500' : 'text-slate-500'}`}>Demo only · no wallet extension</p>
    </div>
  )
}
