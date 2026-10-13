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
import { assignFreelancerOnChain } from '../services/blockchain'
import { formatDate, formatUSDC, shortenAddress } from '../utils/format'
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
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJobLoading(true)
    api.getJob(id)
      .then((data) => { setJob(data); setJobLoading(false) })
      .catch((err) => { if (err.status === 404) setJobNotFound(true); setJobLoading(false) })
  }, [id])

  useEffect(() => {
    if (!job) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppsLoading(true)
    api.getJobApplications(job.id)
      .then((data) => setJobApplications(data.applications || []))
      .catch(() => {})
      .finally(() => setAppsLoading(false))
  }, [job])

  if (jobLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
      </div>
    )
  }
  if (jobNotFound) return <Navigate to="/404" replace />
  if (!job) return <Navigate to="/404" replace />
  if (!canReviewApplications(job, addr)) return <Navigate to={`/jobs/${job.id}`} replace />

  const escrowStatus = (job.escrow_status || job.escrowStatus || '').toLowerCase()

  const confirmAccept = async () => {
    if (!selected) return
    setProcessing(true)
    setNotice(null)
    try {
      let acceptedApp = selected
      if (selected.status === 'pending') {
        acceptedApp = await api.acceptApplication(job.id, selected.id)
        setJobApplications((prev) =>
          prev.map((app) => ({
            ...app,
            status: app.id === selected.id ? 'accepted' : app.status === 'pending' ? 'rejected' : app.status,
          }))
        )
      }

      let freelancerAddress =
        selected.applicant_wallet ||
        selected.applicantWallet ||
        acceptedApp?.applicant_wallet ||
        acceptedApp?.applicantWallet

      if (!freelancerAddress) {
        const freshJob = await api.getJob(job.id)
        freelancerAddress = freshJob.selected_freelancer_wallet || freshJob.selectedFreelancerWallet
      }

      if (!freelancerAddress) {
        throw new Error('Freelancer wallet address could not be resolved. Please reload and try again.')
      }

      const blockchainJobId = job.blockchain_job_id || job.blockchainJobId
      if (blockchainJobId) {
        setNotice({ variant: 'info', title: 'Confirm in wallet', message: 'Confirm the on-chain assignment in MetaMask…' })

        const escrowContractAddress = job.escrow_contract_address || job.escrowContractAddress
        const { transactionHash } = await assignFreelancerOnChain({
          blockchainJobId,
          freelancerAddress,
          clientAddress: addr,
          contractAddress: escrowContractAddress,
        })

        setNotice({ variant: 'info', title: 'Syncing', message: 'Transaction submitted. Waiting for confirmation…' })

        try { await api.syncEscrow(job.id, transactionHash) } catch (e) { console.warn(e) }
        const updatedJob = await api.getJob(job.id)
        setJob(updatedJob)
        refreshJob(job.id)
        setSelected(null)
        setNotice({ variant: 'success', title: 'Freelancer assigned', message: 'Assignment confirmed on-chain. They can now begin work.' })
      } else {
        setSelected(null)
        setNotice({ variant: 'success', title: 'Application accepted', message: 'The applicant has been selected.' })
      }
    } catch (err) {
      setNotice({ variant: 'error', title: 'Assignment failed', message: err.message || 'Failed to complete assignment.' })
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async (application) => {
    try {
      await api.rejectApplication(job.id, application.id)
      setJobApplications((prev) =>
        prev.map((app) => (app.id === application.id ? { ...app, status: 'rejected' } : app))
      )
    } catch (err) {
      setNotice({ variant: 'error', title: 'Failed to reject', message: err.message })
    }
  }

  const pendingCount = jobApplications.filter((a) => a.status === 'pending').length

  return (
    <div className="page-enter">
      <Link to={`/jobs/${job.id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="size-4" /> Back to job
      </Link>

      <PageHeader
        eyebrow="Client review"
        title="Review Applications"
        description={`${jobApplications.length} applicant${jobApplications.length !== 1 ? 's' : ''} for "${job.title}"${pendingCount > 0 ? ` · ${pendingCount} pending review` : ''}`}
      />

      {notice && (
        <div className="mb-5">
          <Alert variant={notice.variant} title={notice.title} onDismiss={() => setNotice(null)}>
            {notice.message}
          </Alert>
        </div>
      )}

      {appsLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
        </div>
      ) : jobApplications.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {jobApplications.map((application) => {
            const applicantName = application.applicant_username
              ? `@${application.applicant_username}`
              : application.applicant_wallet
                ? shortenAddress(application.applicant_wallet)
                : 'Anonymous applicant'

            return (
              <article key={application.id} className="card flex flex-col gap-4 p-5 sm:p-6 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-base font-bold text-ink-950">{applicantName}</p>
                    {application.applicant_wallet && (
                      <p className="mt-0.5 font-mono text-xs text-slate-400">
                        {shortenAddress(application.applicant_wallet, 8, 6)}
                      </p>
                    )}
                  </div>
                  <JobStatusBadge status={application.status} compact />
                </div>

                {/* Cover letter */}
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2">
                    Cover letter
                  </p>
                  <p className="text-sm leading-6 text-slate-700 line-clamp-5">
                    {application.cover_letter}
                  </p>
                </div>

                {/* Meta grid */}
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Est. days</dt>
                    <dd className="mt-0.5 font-bold text-slate-800">{application.estimated_days}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Applied</dt>
                    <dd className="mt-0.5 font-bold text-slate-800">{formatDate(application.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Portfolio</dt>
                    <dd className="mt-0.5">
                      {application.portfolio_url ? (
                        <a href={application.portfolio_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 font-bold text-mint-600 hover:text-mint-700 transition-colors">
                          View <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {/* Actions */}
                {application.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setSelected(application)} className="btn-dark flex-1">
                      <CheckCircle2 className="size-4" /> Accept
                    </button>
                    <button type="button" onClick={() => handleReject(application)} className="btn-secondary flex-1">
                      <XCircle className="size-4" /> Reject
                    </button>
                  </div>
                )}

                {application.status === 'accepted' && (escrowStatus === 'awaiting_freelancer' || !escrowStatus) && (
                  <div className="pt-1">
                    <Alert variant="warning">
                      Accepted off-chain. Confirm on-chain to start work.
                    </Alert>
                    <button type="button" onClick={() => setSelected(application)} className="btn-dark mt-3 w-full">
                      <CheckCircle2 className="size-4" /> Assign on Blockchain
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={UserRoundCheck}
          title="No applications yet"
          description="Applications will appear here as freelancers apply to this job."
        />
      )}

      {/* Confirm modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => !processing && setSelected(null)}
        title={selected?.status === 'accepted' ? 'Assign on blockchain' : 'Select this freelancer?'}
        description="This action will lock the escrow to the selected freelancer."
        actions={
          <>
            <button type="button" onClick={() => setSelected(null)} disabled={processing} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={confirmAccept} disabled={processing} className="btn-dark">
              {processing
                ? <><LoaderCircle className="size-4 animate-spin" />Processing…</>
                : selected?.status === 'accepted' ? 'Assign on Blockchain' : 'Confirm Selection'}
            </button>
          </>
        }
      >
        {selected && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
            <p className="font-bold text-slate-900">
              {selected.applicant_username ? `@${selected.applicant_username}` : shortenAddress(selected.applicant_wallet)}
            </p>
            {selected.applicant_wallet && (
              <p className="mt-1 font-mono text-xs text-slate-500">{selected.applicant_wallet}</p>
            )}
            <div className="mt-3 flex justify-between">
              <span className="text-slate-500">Job payment</span>
              <strong>{formatUSDC(job.budget)}</strong>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
