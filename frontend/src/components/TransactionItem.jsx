import { ArrowDownLeft, ArrowUpRight, Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { copyToClipboard, formatDate, formatUSDC, shortenAddress } from '../utils/format'

export function TransactionStatus({ status }) {
  const confirmed = status === 'Confirmed'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${confirmed ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
      <span className={`size-1.5 rounded-full ${confirmed ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
      {status}
    </span>
  )
}

export default function TransactionItem({ transaction, mobile = false }) {
  const [copied, setCopied] = useState(false)
  const isIncoming = transaction.amount > 0
  const handleCopy = async () => {
    await copyToClipboard(transaction.hash)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (!mobile) {
    return (
      <tr className="border-t border-slate-100 text-sm transition hover:bg-slate-50/70">
        <td className="px-5 py-4"><div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-lg ${isIncoming ? 'bg-emerald-50 text-emerald-600' : 'bg-cyan-50 text-cyan-700'}`}>{isIncoming ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><span className="font-bold text-slate-800">{transaction.type}</span></div></td>
        <td className="px-5 py-4"><Link to={`/jobs/${transaction.jobId}`} className="font-medium text-slate-700 hover:text-mint-600">{transaction.jobTitle}</Link><p className="mt-0.5 text-xs text-slate-400">{transaction.jobId}</p></td>
        <td className={`px-5 py-4 font-bold ${isIncoming ? 'text-emerald-600' : 'text-slate-800'}`}>{formatUSDC(transaction.amount, { sign: true })}</td>
        <td className="px-5 py-4 font-mono text-xs text-slate-600">{shortenAddress(transaction.wallet)}</td>
        <td className="px-5 py-4"><TransactionStatus status={transaction.status} /></td>
        <td className="px-5 py-4 text-slate-500">{formatDate(transaction.date)}</td>
        <td className="px-5 py-4"><div className="flex items-center gap-1"><button type="button" onClick={handleCopy} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={copied ? 'Transaction hash copied' : 'Copy transaction hash'}>{copied ? <Check className="size-4 text-mint-600" /> : <Copy className="size-4" />}</button><button type="button" onClick={() => window.alert('Arc Explorer links will be enabled when testnet integration is connected.')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="View on Arc Explorer"><ExternalLink className="size-4" /></button></div></td>
      </tr>
    )
  }

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${isIncoming ? 'bg-emerald-50 text-emerald-600' : 'bg-cyan-50 text-cyan-700'}`}>{isIncoming ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{transaction.type}</p><p className="mt-0.5 text-xs text-slate-500">{formatDate(transaction.date)}</p></div></div>
        <p className={`shrink-0 text-sm font-bold ${isIncoming ? 'text-emerald-600' : 'text-slate-900'}`}>{formatUSDC(transaction.amount, { sign: true })}</p>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4"><Link to={`/jobs/${transaction.jobId}`} className="text-sm font-semibold text-slate-800 hover:text-mint-600">{transaction.jobTitle}</Link><div className="mt-3 flex items-center justify-between"><TransactionStatus status={transaction.status} /><div className="flex items-center gap-1"><span className="mr-1 font-mono text-xs text-slate-400">{shortenAddress(transaction.hash)}</span><button type="button" onClick={handleCopy} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Copy transaction hash">{copied ? <Check className="size-4 text-mint-600" /> : <Copy className="size-4" />}</button><button type="button" onClick={() => window.alert('Arc Explorer links will be enabled when testnet integration is connected.')} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="View on Arc Explorer"><ExternalLink className="size-4" /></button></div></div></div>
    </article>
  )
}
