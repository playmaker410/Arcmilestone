import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Reusable accessible pagination component.
 *
 * @param {number} page - Current 1-based page
 * @param {number} totalPages - Total number of pages
 * @param {number} total - Total count of items
 * @param {number} limit - Items per page
 * @param {(nextPage: number) => void} onPageChange - Callback when a page is selected
 * @param {string} [className] - Optional custom wrapper classes
 */
export default function Pagination({
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 10,
  onPageChange,
  className = '',
}) {
  if (totalPages <= 1 && total <= limit) {
    return null
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  // Generate page numbers with ellipses
  const getPages = () => {
    const pages = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push('ellipsis-start')

      const start = Math.max(2, page - 1)
      const end = Math.min(totalPages - 1, page + 1)
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i)
      }

      if (page < totalPages - 2) pages.push('ellipsis-end')
      if (!pages.includes(totalPages)) pages.push(totalPages)
    }
    return pages
  }

  const pages = getPages()

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-col items-center justify-between gap-4 border-t border-slate-200/80 px-2 py-4 sm:flex-row ${className}`}
    >
      <p className="text-xs text-slate-500">
        {total > 0 ? (
          <>
            Showing <span className="font-semibold text-slate-900">{from}</span> to{' '}
            <span className="font-semibold text-slate-900">{to}</span> of{' '}
            <span className="font-semibold text-slate-900">{total}</span> results
          </>
        ) : (
          'No results to display'
        )}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>

          <div className="flex items-center gap-1 px-1">
            {pages.map((p, idx) => {
              if (typeof p === 'string') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-2 text-xs font-bold text-slate-400 select-none"
                    aria-hidden="true"
                  >
                    …
                  </span>
                )
              }

              const isCurrent = p === page
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-xs font-bold transition ${
                    isCurrent
                      ? 'bg-ink-950 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </nav>
  )
}
