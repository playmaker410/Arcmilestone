export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-bold tracking-[0.12em] text-mint-600 uppercase">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
