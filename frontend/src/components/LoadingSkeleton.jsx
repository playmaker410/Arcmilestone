export default function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="card animate-pulse p-5" aria-label="Loading content" role="status">
      <div className="h-5 w-2/5 rounded bg-slate-200" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={`h-4 rounded bg-slate-100 ${index % 2 ? 'w-4/5' : 'w-full'}`} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
