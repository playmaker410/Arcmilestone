import { CheckCircle2, CircleDollarSign, Clock3, FilePlus2, RotateCcw, Send, XCircle } from 'lucide-react'

// Map both backend snake_case and legacy TitleCase status values to display config
const statusStyles = {
  // Backend snake_case (marketplace_status)
  draft: { icon: FilePlus2, label: 'Draft', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  open: { icon: Clock3, label: 'Open', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  reviewing_applications: { icon: Clock3, label: 'Reviewing Applications', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  in_progress: { icon: Clock3, label: 'In Progress', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  completed: { icon: CheckCircle2, label: 'Completed', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  cancelled: { icon: XCircle, label: 'Cancelled', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  // Backend snake_case (escrow_status)
  awaiting_freelancer: { icon: CircleDollarSign, label: 'Funded', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  funded: { icon: CheckCircle2, label: 'Assigned', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  work_submitted: { icon: Send, label: 'Work Submitted', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  refunded: { icon: RotateCcw, label: 'Refunded', className: 'bg-violet-50 text-violet-700 ring-violet-200' },
  // Backend snake_case (application status)
  pending: { icon: Clock3, label: 'Pending', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  accepted: { icon: CheckCircle2, label: 'Accepted', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rejected: { icon: XCircle, label: 'Rejected', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  withdrawn: { icon: RotateCcw, label: 'Withdrawn', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  // Legacy TitleCase fallbacks (mock data compat)
  Created: { icon: FilePlus2, label: 'Created', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  Draft: { icon: FilePlus2, label: 'Draft', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  Open: { icon: Clock3, label: 'Open', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  'Reviewing Applications': { icon: Clock3, label: 'Reviewing Applications', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  'Awaiting Freelancer': { icon: CircleDollarSign, label: 'Funded', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  'In Progress': { icon: Clock3, label: 'In Progress', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  Funded: { icon: CheckCircle2, label: 'Assigned', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  'Work Submitted': { icon: Send, label: 'Work Submitted', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  Completed: { icon: CheckCircle2, label: 'Completed', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  Refunded: { icon: RotateCcw, label: 'Refunded', className: 'bg-violet-50 text-violet-700 ring-violet-200' },
  Cancelled: { icon: XCircle, label: 'Cancelled', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  Pending: { icon: Clock3, label: 'Pending', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  Accepted: { icon: CheckCircle2, label: 'Accepted', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  Rejected: { icon: XCircle, label: 'Rejected', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  Withdrawn: { icon: RotateCcw, label: 'Withdrawn', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
}

export default function JobStatusBadge({ status, compact = false }) {
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status
  const config = statusStyles[normalizedStatus] || statusStyles[status] || { icon: Clock3, label: status || 'Unknown', className: 'bg-slate-100 text-slate-700 ring-slate-200' }
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold ring-1 ring-inset ${compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'} ${config.className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {config.label}
    </span>
  )
}
