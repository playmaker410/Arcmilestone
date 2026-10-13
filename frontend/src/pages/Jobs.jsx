import { BriefcaseBusiness, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import JobCard from '../components/JobCard'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { getEscrowStatus, getMarketplaceStatus } from '../utils/permissions'

const postedStatuses = [
  { id: 'All', label: 'All', group: '' },
  { id: 'Active', label: 'Active', group: 'active' },
  { id: 'Needs Review', label: 'Needs Review', group: 'needs_review' },
  { id: 'In Progress', label: 'In Progress', group: 'in_progress' },
  { id: 'Submitted', label: 'Work Submitted', group: 'submitted' },
  { id: 'History', label: 'History', group: 'history' },
]

const workingStatuses = [
  { id: 'All', label: 'All', group: '' },
  { id: 'In Progress', label: 'In Progress', group: 'in_progress' },
  { id: 'Submitted', label: 'Submitted', group: 'submitted' },
  { id: 'Completed', label: 'Completed', group: 'completed' },
  { id: 'History', label: 'History', group: 'history' },
]

const actionForJob = (job, tab) => {
  const ms = getMarketplaceStatus(job)
  const es = getEscrowStatus(job)
  if (tab === 'posted') {
    if (es === 'funded') return 'View Progress'
    if (es === 'work_submitted') return 'Review Submission'
    if (ms === 'completed') return 'View Payment'
    if (ms === 'cancelled' || ms === 'expired') return 'View Details'
    if (ms === 'reviewing_applications') return 'Review Applications'
    return 'View Details'
  }
  return (
    {
      awaiting_freelancer: 'Awaiting Assignment',
      funded: 'Submit Work',
      work_submitted: 'Awaiting Approval',
      completed: 'View Completed',
      refunded: 'View Details',
    }[es || ms] || 'View Details'
  )
}

export default function Jobs() {
  const { walletAddress, wallet } = useApp()
  const addr = walletAddress || wallet?.address

  const [tab, setTab] = useState('posted')
  const [status, setStatus] = useState('All')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, total_pages: 1 })

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const statuses = tab === 'posted' ? postedStatuses : workingStatuses
  const currentStatusObj = statuses.find((s) => s.id === status) || statuses[0]

  const fetchJobs = useCallback(async () => {
    if (!addr) { setJobs([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const data = await api.listJobs({
        mine: tab === 'posted' ? true : undefined,
        assigned: tab === 'working' ? true : undefined,
        page,
        limit: 12,
        group: currentStatusObj.group || undefined,
        q: debouncedQuery || undefined,
      })
      setJobs(data.jobs || [])
      if (data.pagination) setPagination(data.pagination)
    } catch (err) {
      setError(err.message || 'Failed to fetch jobs')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [tab, currentStatusObj.group, page, debouncedQuery, addr])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchJobs()
  }, [fetchJobs])

  const changeTab = (nextTab) => { setTab(nextTab); setStatus('All'); setPage(1) }
  const handleStatusChange = (s) => { setStatus(s); setPage(1) }

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Workspace"
        title="My Jobs"
        description="Manage jobs you've posted or been hired for."
        actions={
          <Link to="/jobs/create" className="btn-dark">
            <Plus className="size-4" />
            Post a Job
          </Link>
        }
      />

      <div className="card mb-6 overflow-hidden">
        {/* Tab bar */}
        <div className="border-b border-slate-100 px-4 pt-4 sm:px-5">
          <div className="flex gap-1" role="tablist" aria-label="Job perspective">
            {[
              { id: 'posted', label: 'Posted (Client)' },
              { id: 'working', label: 'Working On (Freelancer)' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => changeTab(item.id)}
                className={`relative rounded-t-lg px-4 py-2.5 text-sm font-bold transition-colors duration-150 ${
                  tab === item.id
                    ? 'text-ink-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink-950 after:rounded-t-full'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters + search */}
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-0.5" aria-label="Filter by status">
            {statuses.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleStatusChange(item.id)}
                aria-pressed={status === item.id}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 ring-inset transition-all duration-150 ${
                  status === item.id
                    ? 'bg-ink-950 text-white ring-ink-950'
                    : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300 hover:text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="relative block shrink-0 lg:w-64">
            <span className="sr-only">Search jobs</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field-input min-h-10 py-2 pl-9 text-xs"
              placeholder={`Search ${tab === 'posted' ? 'posted' : 'assigned'} jobs…`}
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
          <p className="mt-4 text-sm text-slate-400">Loading jobs…</p>
        </div>
      ) : error ? (
        <div className="card p-6 text-center text-sm text-red-700">
          <p className="font-bold">Failed to load jobs</p>
          <p className="mt-1 text-slate-500">{error}</p>
          <button type="button" onClick={fetchJobs} className="btn-secondary mt-4">
            Retry
          </button>
        </div>
      ) : jobs.length > 0 ? (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                actionLabel={actionForJob(job, tab)}
                actionTo={`/jobs/${job.id}`}
              />
            ))}
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
          title={tab === 'posted' ? 'No posted jobs found' : 'No working jobs found'}
          description={
            tab === 'posted'
              ? status === 'All'
                ? "You haven't posted any jobs yet."
                : `No jobs match "${status}".`
              : status === 'All'
                ? "You haven't been selected for any jobs yet."
                : `No active jobs match "${status}".`
          }
          action={
            tab === 'posted' ? (
              <Link to="/jobs/create" className="btn-dark">
                <Plus className="size-4" /> Post a Job
              </Link>
            ) : (
              <Link to="/explore" className="btn-dark">Explore Jobs</Link>
            )
          }
        />
      )}
    </div>
  )
}
