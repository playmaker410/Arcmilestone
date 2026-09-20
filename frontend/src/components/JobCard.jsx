import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDate, formatUSDC } from '../utils/format'
import JobStatusBadge from './JobStatusBadge'

export default function JobCard({ job, actionLabel = 'View details', actionTo }) {
  const marketplaceStatus = job.marketplace_status || job.marketplaceStatus
  const escrowStatus = job.escrow_status || job.escrowStatus
  const deliveryDeadline = job.delivery_deadline || job.deliveryDeadline

  return (
    <article className="card group flex h-full flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-slate-400 uppercase">#{job.id}</p>
          <h2 className="mt-2 font-display text-lg font-bold leading-snug text-ink-950">{job.title}</h2>
        </div>
        <JobStatusBadge status={marketplaceStatus} compact />
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{job.description}</p>
      <div className="mt-5 rounded-xl bg-slate-50 p-3.5">
        <p className="text-xs text-slate-500">{escrowStatus ? 'Escrow amount' : 'Job budget'}</p>
        <p className="mt-1 font-display text-xl font-extrabold text-ink-950">{formatUSDC(job.budget)}</p>
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <CalendarDays className="size-4 text-slate-400" aria-hidden="true" />
          Due {formatDate(deliveryDeadline)}
        </div>
        <p className="text-xs text-slate-500">Posted by user #{job.creator_user_id || job.creatorWallet || '—'}</p>
      </div>
      <Link to={actionTo || `/jobs/${job.id}`} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-mint-500 hover:bg-mint-50 hover:text-mint-600">
        {actionLabel} <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </article>
  )
}
