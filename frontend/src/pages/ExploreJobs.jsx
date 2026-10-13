import { ArrowUpRight, BriefcaseBusiness, CalendarDays, Clock3, Search, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { formatDate, formatUSDC } from '../utils/format'
import { isJobCreator } from '../utils/permissions'

const ranges = [
  { value: 'all', label: 'Any budget' },
  { value: 'under-100', label: 'Under 100 USDC' },
  { value: '100-250', label: '100–250 USDC' },
  { value: 'over-250', label: 'Over 250 USDC' },
]

const popularSkills = [
  'Solidity',
  'React',
  'TypeScript',
  'Node.js',
  'Smart Contracts',
  'Go',
  'Python',
  'UI/UX Design',
  'Security Audit',
]

function getSkills(job) {
  const raw = job.required_skills || job.requiredSkills
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export default function ExploreJobs() {
  const { wallet, walletAddress } = useApp()
  const addr = walletAddress || wallet?.address

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [range, setRange] = useState('all')
  const [skill, setSkill] = useState('all')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 9, total: 0, total_pages: 1 })

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1) }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listJobs({
        page,
        limit: 9,
        q: debouncedQuery || undefined,
        skill: skill !== 'all' ? skill : undefined,
        budget: range !== 'all' ? range : undefined,
      })
      setJobs(data.jobs || [])
      if (data.pagination) setPagination(data.pagination)
    } catch (err) {
      setError(err.message || 'Failed to load jobs')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [page, debouncedQuery, skill, range])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchJobs()
  }, [fetchJobs])

  const handleClearFilters = () => {
    setQuery('')
    setDebouncedQuery('')
    setRange('all')
    setSkill('all')
    setPage(1)
  }

  const hasFilters = query || range !== 'all' || skill !== 'all'

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Marketplace"
        title="Explore Jobs"
        description="Open opportunities funded with on-chain USDC escrow."
      />

      {/* Filter bar */}
      <div className="card mb-6 flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search by job title or keywords</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field-input pl-9"
            placeholder="Search by title or keywords…"
          />
        </label>

        <label className="md:w-48">
          <span className="sr-only">Filter by budget</span>
          <select value={range} onChange={(e) => { setRange(e.target.value); setPage(1) }} className="field-input">
            {ranges.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="md:w-48">
          <span className="sr-only">Filter by skill</span>
          <select value={skill} onChange={(e) => { setSkill(e.target.value); setPage(1) }} className="field-input">
            <option value="all">All skills</option>
            {popularSkills.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        {hasFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-all"
          >
            <X className="size-3.5" /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
          <p className="mt-4 text-sm text-slate-400">Loading open opportunities…</p>
        </div>
      ) : error ? (
        <div className="card p-6 text-center text-sm">
          <p className="font-bold text-slate-800">Could not load jobs</p>
          <p className="mt-1 text-slate-500">{error}</p>
          <button type="button" onClick={fetchJobs} className="btn-secondary mt-4">Retry</button>
        </div>
      ) : jobs.length > 0 ? (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => {
              const jobSkills = getSkills(job)
              const appDeadline = job.application_deadline || job.applicationDeadline
              const deliveryDeadline = job.delivery_deadline || job.deliveryDeadline
              const mine = isJobCreator(job, addr)

              return (
                <article
                  key={job.id}
                  className="card group flex flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
                >
                  {/* Header badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[11px] font-bold text-cyan-700 ring-1 ring-cyan-100">
                      Open
                    </span>
                    {mine && (
                      <span className="rounded-full bg-mint-50 px-2.5 py-0.5 text-[11px] font-bold text-mint-700 ring-1 ring-mint-100">
                        Your Posting
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h2 className="mt-4 font-display text-lg font-bold text-ink-950 line-clamp-2 group-hover:text-mint-700 transition-colors duration-150">
                    {job.title}
                  </h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
                    {job.description}
                  </p>

                  {/* Skills */}
                  {jobSkills.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {jobSkills.slice(0, 4).map((s) => (
                        <span key={s} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {s}
                        </span>
                      ))}
                      {jobSkills.length > 4 && (
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">
                          +{jobSkills.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Budget + deadlines */}
                  <div className="mt-auto pt-5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Fixed escrow
                      </span>
                      <p className="font-display text-xl font-bold text-ink-950">
                        {formatUSDC(job.budget)}
                      </p>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                      {appDeadline && (
                        <div>
                          <dt className="font-semibold text-slate-400">Apply by</dt>
                          <dd className="mt-0.5 flex items-center gap-1 font-semibold text-slate-600">
                            <Clock3 className="size-3 text-slate-400" />
                            {formatDate(appDeadline)}
                          </dd>
                        </div>
                      )}
                      <div className={!appDeadline ? 'col-span-2' : ''}>
                        <dt className="font-semibold text-slate-400">Delivery</dt>
                        <dd className="mt-0.5 flex items-center gap-1 font-semibold text-slate-600">
                          <CalendarDays className="size-3 text-slate-400" />
                          {formatDate(deliveryDeadline)}
                        </dd>
                      </div>
                    </dl>

                    <Link to={`/jobs/${job.id}`} className="btn-secondary mt-4 w-full justify-center group-hover:border-mint-300 group-hover:text-mint-700 transition-all">
                      View Details <ArrowUpRight className="size-4" />
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>

          <Pagination
            className="mt-8"
            page={pagination.page}
            totalPages={pagination.total_pages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(nextPage) => {
              setPage(nextPage)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </>
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No open jobs match your search"
          description="Try adjusting your search terms or removing filters."
          action={
            <button type="button" className="btn-secondary" onClick={handleClearFilters}>
              Clear all filters
            </button>
          }
        />
      )}
    </div>
  )
}
