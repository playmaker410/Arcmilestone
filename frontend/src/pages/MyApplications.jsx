import { FileUser, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import JobStatusBadge from '../components/JobStatusBadge'
import PageHeader from '../components/PageHeader'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { formatDate, formatUSDC } from '../utils/format'

// Backend statuses are lowercase
const statuses = ['All', 'pending', 'accepted', 'withdrawn']
const statusLabels = { All: 'All', pending: 'Pending', accepted: 'Accepted', withdrawn: 'Withdrawn' }

export default function MyApplications() {
  const { applications, applicationsLoading, loadApplications } = useApp()
  const [status, setStatus] = useState('All')
  const [jobCache, setJobCache] = useState({})
  const [processingId, setProcessingId] = useState(null)
  
  const handleWithdraw = async (appId) => {
    setProcessingId(appId)
    try {
      await api.withdrawApplication(appId)
      loadApplications() // refresh list
    } catch (err) {
      alert('Failed to withdraw application: ' + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  // Load applications on mount
  useEffect(() => { loadApplications() }, [loadApplications])

  const mine = useMemo(() =>
    applications.filter((app) => status === 'All' || app.status === status),
    [applications, status]
  )

  // Fetch job details for applications we haven't loaded yet
  useEffect(() => {
    const missingJobIds = [...new Set(
      mine
        .map((app) => String(app.job_id || app.jobId))
        .filter((jid) => jid && !jobCache[jid])
    )]
    if (!missingJobIds.length) return

    missingJobIds.forEach((jobId) => {
      api.getJob(jobId)
        .then((job) => setJobCache((prev) => ({ ...prev, [String(job.id)]: job })))
        .catch(() => { })
    })
  }, [mine, jobCache])

  return (
    <>
      <PageHeader eyebrow="Freelancer activity" title="My Applications" description="Track applications submitted from your connected wallet." />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Filter applications by status">
        {statuses.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            aria-pressed={status === item}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ring-1 ring-inset ${status === item ? 'bg-ink-950 text-white ring-ink-950' : 'bg-white text-slate-600 ring-slate-200'}`}
          >
            {statusLabels[item] || item}
          </button>
        ))}
      </div>

      {applicationsLoading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading applications…</div>
      ) : mine.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {mine.map((application) => {
            const jobId = String(application.job_id || application.jobId)
            const job = jobCache[jobId]
            return (
              <article key={application.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-400">Application #{application.id}</p>
                    <h2 className="mt-1 font-display text-lg font-bold text-ink-950">{job ? job.title : `Job #${jobId}`}</h2>
                  </div>
                  <JobStatusBadge status={application.status} compact />
                </div>
                {job && (
                  <p className="mt-2 text-xs text-slate-500">Posted by user #{job.creator_user_id}</p>
                )}
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Job payment</dt>
                    <dd className="mt-1 font-bold">{job ? formatUSDC(job.budget) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Estimated delivery</dt>
                    <dd className="mt-1 font-bold">{application.estimated_days || application.estimatedDays} days</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Submitted</dt>
                    <dd className="mt-1 font-bold">{formatDate(application.created_at || application.createdAt)}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Link to={`/jobs/${jobId}`} className="btn-secondary flex-1">View Job</Link>
                  {(application.status === 'pending' || application.status === 'PENDING') && (
                    <button type="button" onClick={() => handleWithdraw(application.id)} disabled={processingId === application.id} className="btn-secondary flex-1 text-slate-500 hover:text-slate-900">
                      <RotateCcw className={`size-4 ${processingId === application.id ? 'animate-spin' : ''}`} />
                      Withdraw
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={FileUser}
          title="No applications found"
          description={status === 'All' ? 'Applications you submit will appear here.' : `There are no ${statusLabels[status]?.toLowerCase() || status} applications.`}
          action={<Link to="/explore" className="btn-dark">Explore Jobs</Link>}
        />
      )}
    </>
  )
}
