import { Inbox } from 'lucide-react'

export default function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = Inbox }) {
  return (
    <div className="card flex flex-col items-center px-5 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-lg font-bold text-ink-950">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
