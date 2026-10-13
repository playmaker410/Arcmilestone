import { FileUser, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../components/Alert'
import EmptyState from '../components/EmptyState'
import JobStatusBadge from '../components/JobStatusBadge'
import PageHeader from '../components/PageHeader'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { formatDate, formatUSDC } from '../utils/format'

const statuses = ['All', 'pending', 'accepted', 'withdrawn']
const statusLabels = { All: 'All', pending: 'Pending', accepted: 'Accepted', withdrawn: 'Withdrawn' }

export default function MyApplications() {
  const { applications, applicationsLoading, loadApplications } = useApp()
  const [status, setStatus] = useState('All')
  const [jobCache, setJobCache] = useState({})
  const [processingId, setProcessingId] = useState(null)
  const [withdrawError, setWithdrawError] = useState('')

  const handleWithdraw = async (appId) => {
    setProcessingId(appId)
    setWithdrawError('')
    try {
      await api.withdrawApplication(appId)
      loadApplications()
    } catch (err) {
      setWithdrawError(err.message || 'Failed to withdraw application. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  useEffect(() => { loadApplications() }, [loadApplications])

  const mine = useMemo(
    () => applications.filter((app) => status === 'All' || app.status === status),
    [applications, status]
  )

  useEffect(() => {
    const missingJobIds = [
      ...new Set(
        mine
          .map((app) => String(app.job_id || app.jobId))
          .filter((jid) => jid && !jobCache[jid])
      ),
    ]
    if (!missingJobIds.length) return

    missingJobIds.forEach((jobId) => {
      api.getJob(jobId)
        .then((job) => setJobCache((prev) => ({ ...prev, [String(job.id)]: job })))
        .catch(() => {})
    })
  }, [mine, jobCache])

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Freelancer activity"
        title="My Applications"
        description="Applications submitted from your connected wallet."
      />

      {withdrawError && (
        <div className="mb-5">
          <Alert variant="error" onDismiss={() => setWithdrawError('')}>{withdrawError}</Alert>
        </div>
      )}

      {/* Status filter pills */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Filter applications by status">
        {statuses.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            aria-pressed={status === item}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 ring-inset transition-all duration-150 ${
              status === item
                ? 'bg-ink-950 text-white ring-ink-950'
                : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300 hover:text-slate-700'
            }`}
          >
            {statusLabels[item] || item}
          </button>
        ))}
      </div>

      {applicationsLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
          <p className="mt-4 text-sm text-slate-400">Loading applications…</p>
        </div>
      ) : mine.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {mine.map((application) => {
            const jobId = String(application.job_id || application.jobId)
            const job = jobCache[jobId]

            let displayStatus = application.status
            if (job && (application.status === 'pending' || application.status === 'PENDING')) {
              const ms = job.status || ''
              if (ms === 'CANCELLED') displayStatus = 'cancelled'
              else if (ms === 'EXPIRED') displayStatus = 'expired'
              else if (job.application_deadline && new Date() > new Date(job.application_deadline)) {
                displayStatus = 'pending review'
              }
            }

            const isPending = application.status === 'pending' || application.status === 'PENDING'

            return (
              <article
                key={application.id}
                className="card flex flex-col gap-4 p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-bold text-ink-950">
                      {job ? job.title : `Job #${jobId}`}
                    </h2>
                    {displayStatus === 'pending review' && (
                      <p className="mt-1 text-xs font-semibold text-amber-600">
                        Application deadline passed — awaiting client review
                      </p>
                    )}
                  </div>
                  <JobStatusBadge status={displayStatus} compact />
                </div>

                {/* Details grid */}
                <dl className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Payment
                    </dt>
                    <dd className="mt-1 font-bold text-slate-800">
                      {job ? formatUSDC(job.budget) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Est. days
                    </dt>
                    <dd className="mt-1 font-bold text-slate-800">
                      {application.estimated_days || application.estimatedDays}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Submitted
                    </dt>
                    <dd className="mt-1 font-bold text-slate-800">
                      {formatDate(application.created_at || application.createdAt)}
                    </dd>
                  </div>
                </dl>

                {/* Actions */}
                <div className="flex gap-2">
                  <Link to={`/jobs/${jobId}`} className="btn-secondary flex-1 text-sm">
                    View Job
                  </Link>
                  {isPending && displayStatus !== 'rejected' && (
                    <button
                      type="button"
                      onClick={() => handleWithdraw(application.id)}
                      disabled={processingId === application.id}
                      className="btn-secondary flex-1 text-sm text-slate-500 hover:text-slate-800"
                    >
                      <RotateCcw className={`size-3.5 ${processingId === application.id ? 'animate-spin' : ''}`} />
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
          description={
            status === 'All'
              ? 'Applications you submit will appear here.'
              : `No ${statusLabels[status]?.toLowerCase() || status} applications.`
          }
          action={<Link to="/explore" className="btn-dark">Explore Jobs</Link>}
        />
      )}
    </div>
  )
}
