export default function StatCard({ label, value, helper, icon: Icon, tone = 'mint' }) {
  const toneMap = {
    mint:   { icon: 'bg-mint-50 text-mint-600',   ring: 'ring-mint-100' },
    cyan:   { icon: 'bg-cyan-50 text-cyan-700',    ring: 'ring-cyan-100' },
    amber:  { icon: 'bg-amber-50 text-amber-700',  ring: 'ring-amber-100' },
    violet: { icon: 'bg-violet-50 text-violet-700',ring: 'ring-violet-100' },
  }
  const { icon: iconStyle, ring } = toneMap[tone] ?? toneMap.mint

  return (
    <article className="card group flex flex-col justify-between gap-3 p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug text-slate-500">{label}</p>
        <span className={`grid shrink-0 size-10 place-items-center rounded-xl ring-1 ${iconStyle} ${ring}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p className="fade-up font-display text-2xl font-extrabold tracking-tight text-ink-950 sm:text-[1.75rem]">
          {value}
        </p>
        {helper && (
          <p className="mt-1.5 text-xs leading-5 text-slate-400">{helper}</p>
        )}
      </div>
    </article>
  )
}
