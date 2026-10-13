import { Download, History, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import TransactionItem from '../components/TransactionItem'
import useApp from '../hooks/useApp'
import { api } from '../services/api'

function normalizeEvent(event) {
  const eventType = event.event_type || ''
  let type
  let isIncoming = false
  const amount = event.amount ? Number(event.amount) : 0

  switch (eventType) {
    case 'JobCreatedAndFundedOpen':
    case 'FUND':
      type = 'Escrow Funded'
      isIncoming = false
      break
    case 'FreelancerAssigned':
    case 'ASSIGN':
      type = 'Freelancer Assigned'
      break
    case 'WorkSubmitted':
    case 'SUBMIT':
      type = 'Work Submitted'
      break
    case 'RevisionRequested':
    case 'REVISION':
      type = 'Revision Requested'
      break
    case 'PaymentApproved':
    case 'PaymentReleased':
    case 'RELEASE':
      type = 'Payment Released'
      isIncoming = event.role === 'freelancer'
      break
    case 'PaymentClaimed':
    case 'CLAIM':
      type = 'Auto-Claim Payment'
      isIncoming = event.role === 'freelancer'
      break
    case 'JobRefunded':
    case 'REFUND':
      type = 'Escrow Refunded'
      isIncoming = true
      break
    case 'JobCancelled':
    case 'CANCEL':
      type = 'Job Cancelled'
      isIncoming = true
      break
    default:
      type = eventType.replace(/([A-Z])/g, ' $1').trim()
  }

  return {
    id: event.id,
    jobId: event.job_id,
    jobTitle: event.job_title || `Job #${event.job_id}`,
    type,
    amount,
    isIncoming,
    wallet: event.role === 'client' ? 'Client Escrow' : 'Freelancer Payout',
    status: 'Confirmed',
    date: event.created_at,
    hash: event.transaction_hash,
    blockNumber: event.block_number,
  }
}

export default function Transactions() {
  const { walletAddress, wallet } = useApp()
  const addr = walletAddress || wallet?.address

  const [rawTransactions, setRawTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, total_pages: 1 })

  const fetchTransactions = useCallback(async () => {
    if (!addr) {
      setRawTransactions([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await api.getTransactions({ page, limit: 15 })
      setRawTransactions(data.transactions || [])
      if (data.pagination) {
        setPagination(data.pagination)
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch transactions')
      setRawTransactions([])
    } finally {
      setLoading(false)
    }
  }, [addr, page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTransactions()
  }, [fetchTransactions])

  const normalizedTransactions = useMemo(
    () => rawTransactions.map(normalizeEvent),
    [rawTransactions]
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return normalizedTransactions
    const q = query.toLowerCase()
    return normalizedTransactions.filter(
      (tx) =>
        tx.type.toLowerCase().includes(q) ||
        tx.jobTitle.toLowerCase().includes(q) ||
        (tx.hash && tx.hash.toLowerCase().includes(q))
    )
  }, [normalizedTransactions, query])

  const handleExport = () => {
    if (!normalizedTransactions.length) {
      setNotice('No transactions to export yet.')
      setTimeout(() => setNotice(''), 3000)
      return
    }
    const headers = ['ID', 'Type', 'Job ID', 'Job Title', 'Amount USDC', 'Transaction Hash', 'Date']
    const csvRows = [headers.join(',')]
    normalizedTransactions.forEach((tx) => {
      csvRows.push(
        [
          tx.id,
          `"${tx.type}"`,
          tx.jobId,
          `"${(tx.jobTitle || '').replace(/"/g, '""')}"`,
          tx.amount,
          `"${tx.hash || ''}"`,
          `"${tx.date}"`,
        ].join(',')
      )
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `arcmilestone_transactions_${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Transactions exported to CSV.')
    setTimeout(() => setNotice(''), 3000)
  }

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="On-chain activity"
        title="Transactions"
        description="Review all recorded Arc Testnet escrow interactions, funding, revisions, releases, and claims."
        actions={
          <button type="button" className="btn-secondary" onClick={handleExport}>
            <Download className="size-4" />
            Export CSV
          </button>
        }
      />

      {notice && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
        >
          {notice}
        </div>
      )}

      {/* Search and summary bar */}
      <div className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900">Escrow history</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Real on-chain transactions indexed from Arc Testnet
          </p>
        </div>
        <label className="relative block sm:w-72">
          <span className="sr-only">Search transactions</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field-input min-h-10 py-2 pl-9"
            placeholder="Search by type, title, hash…"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
          <p className="mt-4 text-sm text-slate-400">Loading blockchain activity…</p>
        </div>
      ) : error ? (
        <div className="card p-6 text-center text-sm">
          <p className="font-bold text-slate-800">Failed to load transactions</p>
          <p className="mt-1 text-slate-500">{error}</p>
          <button type="button" onClick={fetchTransactions} className="btn-secondary mt-4">Retry</button>
        </div>
      ) : filtered.length > 0 ? (
        <>
          {/* Desktop Table View */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1060px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-bold tracking-wide text-slate-400 uppercase">
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Job</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Wallet Role</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Arc Explorer</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((transaction) => (
                  <TransactionItem key={transaction.id} transaction={transaction} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="grid gap-3 lg:hidden">
            {filtered.map((transaction) => (
              <TransactionItem key={transaction.id} transaction={transaction} mobile />
            ))}
          </div>

          <Pagination
            className="mt-6"
            page={pagination.page}
            totalPages={pagination.total_pages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(nextPage) => {
              setPage(nextPage)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </>
      ) : (
        <EmptyState
          icon={History}
          title="No transaction records found"
          description={
            query
              ? 'No transactions matched your search criteria.'
              : 'When you fund escrows, assign freelancers, or release payments on Arc Testnet, the verified events will appear here.'
          }
          action={
            query ? (
              <button type="button" className="btn-secondary" onClick={() => setQuery('')}>
                Clear Search
              </button>
            ) : null
          }
        />
      )}
    </div>
  )
}
