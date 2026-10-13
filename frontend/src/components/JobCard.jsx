import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDate, formatUSDC } from '../utils/format'
import { getEscrowStatus, getMarketplaceStatus } from '../utils/permissions'
import JobStatusBadge from './JobStatusBadge'

export default function JobCard({ job, actionLabel = 'View details', actionTo }) {
  const marketplaceStatus = getMarketplaceStatus(job)
  const escrowStatus = getEscrowStatus(job)
  const deliveryDeadline = job.delivery_deadline || job.deliveryDeadline

  return (
    <article className="card group flex h-full flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
      {/* Status badge row */}
      <div className="flex items-center justify-between gap-2">
        <JobStatusBadge status={marketplaceStatus} compact />
        {escrowStatus && (
          <span className="rounded-full bg-mint-50 px-2 py-0.5 text-[11px] font-bold text-mint-700 ring-1 ring-mint-100">
            Escrow {escrowStatus.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Title + description */}
      <h2 className="mt-4 font-display text-lg font-bold leading-snug text-ink-950 group-hover:text-mint-700 transition-colors duration-150">
        {job.title}
      </h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{job.description}</p>

      {/* Budget block */}
      <div className="mt-5 rounded-xl bg-slate-50 px-3.5 py-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {escrowStatus ? 'Escrowed' : 'Fixed budget'}
        </p>
        <p className="mt-0.5 font-display text-xl font-extrabold text-ink-950">{formatUSDC(job.budget)}</p>
      </div>

      {/* Deadline */}
      <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <CalendarDays className="size-3.5 text-slate-400" aria-hidden="true" />
        Due {formatDate(deliveryDeadline)}
      </div>

      {/* CTA */}
      <Link
        to={actionTo || `/jobs/${job.id}`}
        className="mt-auto pt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-all duration-150 hover:border-mint-400 hover:bg-mint-50 hover:text-mint-700 group-hover:border-mint-300"
      >
        {actionLabel}
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </article>
  )
}
