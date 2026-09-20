import { BriefcaseBusiness, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import JobCard from '../components/JobCard'
import PageHeader from '../components/PageHeader'
import useApp from '../hooks/useApp'
import { isDirectlyAssignedFreelancer, isJobCreator, isSelectedFreelancer } from '../utils/permissions'

const postedStatuses = ['All', 'draft', 'open', 'reviewing_applications', 'awaiting_funding', 'in_progress', 'completed', 'cancelled']
const postedStatusLabels = {
  All: 'All', draft: 'Draft', open: 'Open', reviewing_applications: 'Reviewing Applications',
  awaiting_funding: 'Awaiting Funding', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
}
const workingStatuses = ['All', 'funded', 'work_submitted', 'completed', 'refunded']
const workingStatusLabels = {
  All: 'All', funded: 'Funded', work_submitted: 'Work Submitted', completed: 'Completed', refunded: 'Refunded',
}

const actionForJob = (job, tab) => {
  const ms = (job.marketplace_status || job.marketplaceStatus || '').toLowerCase()
  const es = (job.escrow_status || job.escrowStatus || '').toLowerCase()
  if (tab === 'posted') {
    return ({
      open: 'View Applications',
      reviewing_applications: 'Review Applications',
      awaiting_funding: 'Create and Fund Escrow',
      in_progress: es === 'work_submitted' ? 'Review Submission' : 'View Progress',
      completed: 'View Payment', cancelled: 'View Details', draft: 'View Details',
    })[ms] || 'View Details'
  }
  return ({
    awaiting_funding: 'Wait for Client Funding', funded: 'Submit Work',
    work_submitted: 'Await Client Approval', completed: 'View Payment', refunded: 'View Details',
  })[es || ms] || 'View Details'
}

export default function Jobs() {
  const { jobs, applications, walletAddress, wallet, loadJobs, loadApplications, jobsLoading } = useApp()
  const [tab, setTab] = useState('posted')
  const [status, setStatus] = useState('All')
  const [query, setQuery] = useState('')

  const addr = walletAddress || wallet.address

  // Load posted jobs on mount and when switching to posted tab
  useEffect(() => {
    if (tab === 'posted') {
      loadJobs(true)
    } else {
      // For "working" tab, load applications to find accepted ones
      loadApplications()
    }
  }, [tab, loadJobs, loadApplications])

  const statuses = tab === 'posted' ? postedStatuses : workingStatuses
  const statusLabels = tab === 'posted' ? postedStatusLabels : workingStatusLabels

  const filteredJobs = useMemo(() => {
    if (tab === 'posted') {
      return jobs.filter((job) => {
        const ms = (job.marketplace_status || job.marketplaceStatus || '').toLowerCase()
        return isJobCreator(job, addr) &&
          (status === 'All' || ms === status) &&
          `${job.title} ${job.id}`.toLowerCase().includes(query.toLowerCase())
      })
    }
    // "working" tab — filter jobs where user is selected freelancer
    return jobs.filter((job) => {
      const es = (job.escrow_status || job.escrowStatus || '').toLowerCase()
      const ms = (job.marketplace_status || job.marketplaceStatus || '').toLowerCase()
      const isWorking = isSelectedFreelancer(job, addr) || isDirectlyAssignedFreelancer(job, addr)
      const visibleStatus = es || ms
      return isWorking &&
        (status === 'All' || visibleStatus === status) &&
        `${job.title} ${job.id}`.toLowerCase().includes(query.toLowerCase())
    })
  }, [jobs, applications, query, status, tab, addr])

  // For working tab, also derive working jobs from accepted applications
  const workingFromApplications = useMemo(() => {
    if (tab !== 'working') return []
    return applications
      .filter((app) => app.status === 'accepted')
      .map((app) => {
        const jobId = app.job_id || app.jobId
        return jobs.find((j) => String(j.id) === String(jobId))
      })
      .filter(Boolean)
      .filter((job) => !filteredJobs.some((j) => String(j.id) === String(job.id)))
  }, [tab, applications, jobs, filteredJobs])

  const allWorkingJobs = tab === 'working'
    ? [...filteredJobs, ...workingFromApplications]
    : filteredJobs

  const displayJobs = tab === 'posted' ? filteredJobs : allWorkingJobs

  const changeTab = (next) => { setTab(next); setStatus('All') }

  return (
    <>
      <PageHeader
        eyebrow="Wallet-based workspace"
        title="My Jobs"
        description="The same wallet can post jobs and work on other jobs."
        actions={<Link to="/jobs/create" className="btn-dark"><Plus className="size-4" />Create Job</Link>}
      />
      <div className="card mb-6 p-3 sm:p-4">
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Job relationship">
          {[{ id: 'posted', label: 'Jobs I Posted' }, { id: 'working', label: 'Jobs I Am Working On' }].map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => changeTab(item.id)}
              className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold transition ${tab === item.id ? 'bg-white text-ink-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter jobs by status">
            {statuses.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                aria-pressed={status === item}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${status === item ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-slate-600 ring-slate-200'}`}
              >
                {statusLabels[item] || item}
              </button>
            ))}
          </div>
          <label className="relative block lg:w-64">
            <span className="sr-only">Search jobs</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field-input min-h-10 py-2 pl-9"
              placeholder="Search jobs or ID"
            />
          </label>
        </div>
      </div>
      {jobsLoading ? (
        <p className="mb-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <p className="mb-4 text-sm text-slate-500">
          Showing <strong className="text-slate-800">{displayJobs.length}</strong> {displayJobs.length === 1 ? 'job' : 'jobs'}
        </p>
      )}
      {displayJobs.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {displayJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              actionLabel={actionForJob(job, tab)}
              actionTo={
                tab === 'posted' && ['open', 'reviewing_applications'].includes((job.marketplace_status || job.marketplaceStatus || '').toLowerCase())
                  ? `/jobs/${job.id}/applications`
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No jobs match these filters"
          description="Try another status, search term, or relationship tab."
          action={<button type="button" className="btn-secondary" onClick={() => { setStatus('All'); setQuery('') }}>Clear filters</button>}
        />
      )}
    </>
  )
}
