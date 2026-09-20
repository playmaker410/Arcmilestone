import { ArrowLeft, CheckCircle2, ExternalLink, LoaderCircle, UserRoundCheck, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Alert from '../components/Alert'
import EmptyState from '../components/EmptyState'
import JobStatusBadge from '../components/JobStatusBadge'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { formatDate, formatUSDC } from '../utils/format'
import { canReviewApplications } from '../utils/permissions'

export default function ReviewApplications() {
  const { id } = useParams()
  const { walletAddress, wallet, refreshJob } = useApp()
  const addr = walletAddress || wallet.address

  const [job, setJob] = useState(null)
  const [jobLoading, setJobLoading] = useState(true)
  const [jobNotFound, setJobNotFound] = useState(false)
  const [jobApplications, setJobApplications] = useState([])
  const [appsLoading, setAppsLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setJobLoading(true)
    api.getJob(id)
      .then((data) => {
        setJob(data)
        setJobLoading(false)
      })
      .catch((err) => {
        if (err.status === 404) setJobNotFound(true)
        setJobLoading(false)
      })
  }, [id])

  useEffect(() => {
    if (!job) return
    setAppsLoading(true)
    api.getJobApplications(job.id)
      .then((data) => setJobApplications(data.applications || []))
      .catch(() => { })
      .finally(() => setAppsLoading(false))
  }, [job])

  if (jobLoading) return <div className="py-12 text-center text-sm text-slate-500">Loading…</div>
  if (jobNotFound) return <Navigate to="/404" replace />
  if (!job) return <Navigate to="/404" replace />
  if (!canReviewApplications(job, addr)) return <Navigate to={`/jobs/${job.id}`} replace />

  const confirmAccept = async () => {
    if (!selected) return
    setProcessing(true)
    try {
      await api.acceptApplication(job.id, selected.id)
      setJobApplications((prev) => prev.map((app) => ({
        ...app,
        status: app.id === selected.id ? 'accepted' : app.status === 'pending' ? 'rejected' : app.status,
      })))
      // Refresh job to pick up awaiting_funding status
      const updatedJob = await api.getJob(job.id)
      setJob(updatedJob)
      refreshJob(job.id)
      setSelected(null)
      setNotice('Freelancer selected. Create and fund the escrow before work begins.')
    } catch (err) {
      setNotice(`Failed to accept application: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async (application) => {
    try {
      await api.rejectApplication(job.id, application.id)
      setJobApplications((prev) => prev.map((app) => app.id === application.id ? { ...app, status: 'rejected' } : app))
    } catch (err) {
      setNotice(`Failed to reject: ${err.message}`)
    }
  }

  const marketplaceStatus = (job.marketplace_status || job.marketplaceStatus || '').toLowerCase()

  return (
    <>
      <Link to={`/jobs/${job.id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" />Back to job
      </Link>
      <PageHeader
        eyebrow="Client review"
        title="Review Applications"
        description={`${jobApplications.length} ${jobApplications.length === 1 ? 'freelancer has' : 'freelancers have'} applied to ${job.title}.`}
      />
      {notice && (
        <div className="mb-5">
          <Alert variant="success" title="Application accepted" onDismiss={() => setNotice('')}>{notice}</Alert>
        </div>
      )}
      {marketplaceStatus === 'awaiting_funding' && (
        <div className="mb-5">
          <Alert variant="warning" title="Escrow is not funded">
            The selected freelancer should not start work yet.{' '}
            <Link to={`/jobs/${job.id}`} className="font-bold underline">Create and Fund Escrow</Link>
          </Alert>
        </div>
      )}

      {appsLoading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading applications…</div>
      ) : jobApplications.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {jobApplications.map((application) => (
            <article key={application.id} className="card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-slate-700">Applicant #{application.applicant_user_id}</p>
                <JobStatusBadge status={application.status} compact />
              </div>
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold tracking-wide text-slate-400 uppercase">Cover letter</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{application.cover_letter}</p>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-slate-500">Estimated delivery</dt><dd className="mt-1 font-bold">{application.estimated_days} days</dd></div>
                <div><dt className="text-xs text-slate-500">Applied</dt><dd className="mt-1 font-bold">{formatDate(application.created_at)}</dd></div>
                <div>
                  <dt className="text-xs text-slate-500">Portfolio</dt>
                  <dd className="mt-1">
                    {application.portfolio_url
                      ? <a href={application.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-mint-600 hover:underline">Open link <ExternalLink className="size-3.5" /></a>
                      : <span className="text-slate-500">Not provided</span>
                    }
                  </dd>
                </div>
              </dl>
              {application.status === 'pending' && (
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={() => setSelected(application)} className="btn-dark flex-1"><CheckCircle2 className="size-4" />Accept</button>
                  <button type="button" onClick={() => handleReject(application)} className="btn-secondary flex-1"><XCircle className="size-4" />Reject</button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={UserRoundCheck} title="No applications yet" description="Applications will appear here as freelancers apply to this open job." />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => !processing && setSelected(null)}
        title="Select this freelancer?"
        description="You are selecting this freelancer for the job. The job will not begin until you create and fund the escrow."
        actions={
          <>
            <button type="button" onClick={() => setSelected(null)} disabled={processing} className="btn-secondary">Go Back</button>
            <button type="button" onClick={confirmAccept} disabled={processing} className="btn-dark">
              {processing ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : 'Confirm Selection'}
            </button>
          </>
        }
      >
        {selected && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold">Applicant #{selected.applicant_user_id}</p>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-slate-500">Job payment</span>
              <strong>{formatUSDC(job.budget)}</strong>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
