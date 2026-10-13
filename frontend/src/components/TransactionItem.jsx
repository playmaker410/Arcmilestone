import { ArrowDownLeft, ArrowUpRight, Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { copyToClipboard, formatDate, formatUSDC, shortenAddress } from '../utils/format'

const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_URL || 'https://testnet.arcscan.app/tx/'

export function TransactionStatus({ status = 'Confirmed' }) {
  const confirmed = status.toLowerCase() === 'confirmed'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
        confirmed
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-amber-50 text-amber-700 ring-amber-200'
      }`}
    >
      <span className={`size-1.5 rounded-full ${confirmed ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
      {status}
    </span>
  )
}

export default function TransactionItem({ transaction, mobile = false }) {
  const [copied, setCopied] = useState(false)
  const numericAmount = Number(transaction.amount) || 0
  const isIncoming = transaction.isIncoming ?? (numericAmount > 0)
  const isNeutral = numericAmount === 0 || transaction.amount === null || transaction.amount === undefined

  const explorerUrl = transaction.hash ? `${EXPLORER_BASE}${transaction.hash}` : null

  const handleCopy = async () => {
    if (!transaction.hash) return
    await copyToClipboard(transaction.hash)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (!mobile) {
    return (
      <tr className="border-t border-slate-100 text-sm transition hover:bg-slate-50/70">
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`grid size-9 place-items-center rounded-lg ${
                isNeutral
                  ? 'bg-slate-100 text-slate-600'
                  : isIncoming
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-cyan-50 text-cyan-700'
              }`}
            >
              {isNeutral ? (
                <RefreshCw className="size-4" />
              ) : isIncoming ? (
                <ArrowDownLeft className="size-4" />
              ) : (
                <ArrowUpRight className="size-4" />
              )}
            </span>
            <span className="font-bold text-slate-800">{transaction.type}</span>
          </div>
        </td>
        <td className="px-5 py-4">
          <Link
            to={`/jobs/${transaction.jobId}`}
            className="font-medium text-slate-700 hover:text-mint-600"
          >
            {transaction.jobTitle || `Job #${transaction.jobId}`}
          </Link>
          <p className="mt-0.5 font-mono text-xs text-slate-400">#{transaction.jobId}</p>
        </td>
        <td
          className={`px-5 py-4 font-bold ${
            isNeutral ? 'text-slate-500' : isIncoming ? 'text-emerald-600' : 'text-slate-800'
          }`}
        >
          {isNeutral ? '—' : formatUSDC(Math.abs(numericAmount), { sign: !isIncoming ? '-' : '+' })}
        </td>
        <td className="px-5 py-4 font-mono text-xs text-slate-600">
          {transaction.wallet ? shortenAddress(transaction.wallet) : '—'}
        </td>
        <td className="px-5 py-4">
          <TransactionStatus status={transaction.status || 'Confirmed'} />
        </td>
        <td className="px-5 py-4 text-slate-500">{formatDate(transaction.date)}</td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-1">
            {transaction.hash && (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  aria-label={copied ? 'Transaction hash copied' : 'Copy transaction hash'}
                  title="Copy Hash"
                >
                  {copied ? <Check className="size-4 text-mint-600" /> : <Copy className="size-4" />}
                </button>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  aria-label="View on Arc Explorer"
                  title="View on Arc Explorer"
                >
                  <ExternalLink className="size-4" />
                </a>
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-lg ${
              isNeutral
                ? 'bg-slate-100 text-slate-600'
                : isIncoming
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-cyan-50 text-cyan-700'
            }`}
          >
            {isNeutral ? (
              <RefreshCw className="size-4" />
            ) : isIncoming ? (
              <ArrowDownLeft className="size-4" />
            ) : (
              <ArrowUpRight className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{transaction.type}</p>
            <p className="mt-0.5 text-xs text-slate-500">{formatDate(transaction.date)}</p>
          </div>
        </div>
        <p
          className={`shrink-0 text-sm font-bold ${
            isNeutral ? 'text-slate-500' : isIncoming ? 'text-emerald-600' : 'text-slate-900'
          }`}
        >
          {isNeutral ? '—' : formatUSDC(Math.abs(numericAmount), { sign: !isIncoming ? '-' : '+' })}
        </p>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <Link
          to={`/jobs/${transaction.jobId}`}
          className="text-sm font-semibold text-slate-800 hover:text-mint-600"
        >
          {transaction.jobTitle || `Job #${transaction.jobId}`}
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <TransactionStatus status={transaction.status || 'Confirmed'} />
          <div className="flex items-center gap-1">
            {transaction.hash && (
              <>
                <span className="mr-1 font-mono text-xs text-slate-400">
                  {shortenAddress(transaction.hash)}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Copy transaction hash"
                >
                  {copied ? <Check className="size-4 text-mint-600" /> : <Copy className="size-4" />}
                </button>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="View on Arc Explorer"
                >
                  <ExternalLink className="size-4" />
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
