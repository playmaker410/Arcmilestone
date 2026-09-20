import { Link } from 'react-router-dom'

export default function Logo({ inverse = false, compact = false }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 rounded-lg" aria-label="ArcMilestone home">
      <span className="relative grid size-9 place-items-center rounded-xl bg-mint-500 shadow-sm" aria-hidden="true">
        <span className="absolute size-4 rotate-45 rounded-[3px] border-2 border-ink-950" />
        <span className="absolute size-1.5 rounded-full bg-ink-950" />
      </span>
      {!compact && (
        <span className={`font-display text-lg font-extrabold tracking-tight ${inverse ? 'text-white' : 'text-ink-950'}`}>
          Arc<span className="text-mint-500">Milestone</span>
        </span>
      )}
    </Link>
  )
}
