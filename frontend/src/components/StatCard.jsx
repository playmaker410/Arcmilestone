export default function StatCard({ label, value, helper, icon: Icon, tone = 'mint' }) {
  const iconStyles = {
    mint: 'bg-mint-50 text-mint-600',
    cyan: 'bg-cyan-50 text-cyan-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  }

  return (
    <article className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink-950 sm:text-[1.75rem]">{value}</p>
        </div>
        <span className={`grid size-10 place-items-center rounded-xl ${iconStyles[tone]}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      {helper && <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p>}
    </article>
  )
}
