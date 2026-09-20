import { Check, Copy, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { copyToClipboard, shortenAddress } from '../utils/format'

export default function WalletBadge({ address, label, showCopy = true, className = '' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 ${className}`}>
      <WalletCards className="size-4 text-slate-500" aria-hidden="true" />
      {label && <span className="font-medium">{label}</span>}
      <span className="font-mono text-xs">{shortenAddress(address)}</span>
      {showCopy && (
        <button type="button" onClick={handleCopy} className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900" aria-label={copied ? 'Address copied' : 'Copy wallet address'}>
          {copied ? <Check className="size-3.5 text-mint-600" /> : <Copy className="size-3.5" />}
        </button>
      )}
    </div>
  )
}
