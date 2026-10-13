export default function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="card overflow-hidden p-5" role="status" aria-label="Loading content">
      <div className="skeleton h-5 w-2/5 rounded-lg" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className={`skeleton h-4 rounded-lg ${index % 2 ? 'w-4/5' : 'w-full'}`}
          />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
