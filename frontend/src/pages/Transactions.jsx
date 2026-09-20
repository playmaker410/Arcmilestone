import { Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import TransactionItem from '../components/TransactionItem'
import { transactions } from '../data/mockData'

export default function Transactions() {
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const filtered = useMemo(() => transactions.filter((transaction) => `${transaction.type} ${transaction.jobTitle} ${transaction.hash}`.toLowerCase().includes(query.toLowerCase())), [query])

  return (
    <>
      <PageHeader eyebrow="Account activity" title="Transactions" description="Review your demo escrow funding, releases, receipts, and refunds." actions={<button type="button" className="btn-secondary" onClick={() => { setNotice('Demo transaction data is ready for export once backend integration is connected.'); window.setTimeout(() => setNotice(''), 3000) }}><Download className="size-4" />Export</button>} />
      {notice && <div role="status" className="mb-5 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">{notice}</div>}
      <div className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-900">All transactions</p><p className="mt-1 text-xs text-slate-500">Demo activity · Arc Explorer links are placeholders</p></div><label className="relative block sm:w-72"><span className="sr-only">Search transactions</span><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field-input min-h-10 py-2 pl-9" placeholder="Search transactions" /></label></div>
      <div className="card hidden overflow-x-auto lg:block"><table className="w-full min-w-[1060px]"><thead><tr className="bg-slate-50 text-left text-[11px] font-bold tracking-wide text-slate-400 uppercase"><th className="px-5 py-3.5">Type</th><th className="px-5 py-3.5">Job</th><th className="px-5 py-3.5">Amount</th><th className="px-5 py-3.5">Wallet</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Date</th><th className="px-5 py-3.5">Explorer</th></tr></thead><tbody>{filtered.map((transaction) => <TransactionItem key={transaction.id} transaction={transaction} />)}</tbody></table></div>
      <div className="grid gap-3 lg:hidden">{filtered.map((transaction) => <TransactionItem key={transaction.id} transaction={transaction} mobile />)}</div>
      {filtered.length === 0 && <p className="py-12 text-center text-sm text-slate-500">No transactions match your search.</p>}
    </>
  )
}
