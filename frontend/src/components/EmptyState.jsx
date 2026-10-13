import { Inbox } from 'lucide-react'

export default function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
  icon: Icon = Inbox,
}) {
  return (
    <div className="card fade-up flex flex-col items-center px-5 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200/60">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-lg font-bold text-ink-950">{title}</h2>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
