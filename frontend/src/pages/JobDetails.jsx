import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileText, LoaderCircle, LockKeyhole, RotateCcw, Send, ShieldAlert, UserRoundCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Alert from '../components/Alert'
import FormField from '../components/FormField'
import JobStatusBadge from '../components/JobStatusBadge'
import Modal from '../components/Modal'
import WalletBadge from '../components/WalletBadge'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { approveAndReleasePayment, fundEscrow, refundExpiredJobOnChain, submitWorkOnChain } from '../services/blockchain'
import { formatDate, formatUSDC, shortenAddress } from '../utils/format'
import { canApply, canApproveWork, canClaimRefund, canFundEscrow, canReviewApplications, canSubmitWork, getWalletApplication, hasApplicationDeadlinePassed, isJobCreator } from '../utils/permissions'

const emptyApplication = { coverLetter: '', estimatedDays: '', portfolioUrl: '' }
const isValidUrl = (value) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) } catch { return false } }

// Safe skill array from backend (json.RawMessage may come as array or null)
function getSkills(job) {
  const raw = job.required_skills || job.requiredSkills
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export default function JobDetails() {
  const { id } = useParams()
  const { walletAddress, wallet, applications, addApplication, updateApplication, updateJob, refreshJob } = useApp()
  const addr = walletAddress || wallet.address

  const [job, setJob] = useState(null)
  const [jobLoading, setJobLoading] = useState(true)
  const [jobNotFound, setJobNotFound] = useState(false)
  const [submission, setSubmission] = useState(null)

  const [applicationForm, setApplicationForm] = useState(emptyApplication)
  const [applicationErrors, setApplicationErrors] = useState({})
  const [submissionForm, setSubmissionForm] = useState({ url: '', notes: '' })
  const [submissionErrors, setSubmissionErrors] = useState({})
  const [modal, setModal] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [notice, setNotice] = useState(null)

  // Load job from API on mount
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

  // Load submission when job has work_submitted escrow status, or whenever the
  // job is in_progress (the listener may not have updated escrow_status yet).
  useEffect(() => {
    if (!job) return
    const es = (job.escrow_status || '').toLowerCase()
    const ms = (job.marketplace_status || '').toLowerCase()
    if (es === 'work_submitted' || es === 'completed' || ms === 'in_progress') {
      api.getSubmission(job.id).then(setSubmission).catch(() => { })
    }
  }, [job])

  if (jobLoading) return <div className="py-12 text-center text-sm text-slate-500">Loading job…</div>
  if (jobNotFound) return <Navigate to="/404" replace />
  if (!job) return <Navigate to="/404" replace />

  const hiringMethod = job.hiring_method || job.hiringMethod
  const marketplaceStatus = (job.marketplace_status || job.marketplaceStatus || '').toLowerCase()
  const escrowStatus = (job.escrow_status || job.escrowStatus || '').toLowerCase() || null
  const freelancerWallet = job.selected_freelancer_wallet || job.selectedFreelancerWallet
  const blockchainJobId = job.blockchain_job_id || job.blockchainJobId
  const deliveryDeadline = job.delivery_deadline || job.deliveryDeadline
  const applicationDeadline = job.application_deadline || job.applicationDeadline
  const skills = getSkills(job)

  // Load wallet application — backend applications (from context) or check current job state
  const walletApplication = getWalletApplication(job, addr, applications)

  const creator = isJobCreator(job, addr)
  const mayApply = canApply(job, addr, applications)
  const mayReview = canReviewApplications(job, addr)
  const mayFund = canFundEscrow(job, addr)
  const maySubmit = canSubmitWork(job, addr)
  const mayApprove = canApproveWork(job, addr)
  const mayRefund = canClaimRefund(job, addr)
  const expired = hiringMethod === 'open' && hasApplicationDeadlinePassed(job)

  const escrowAmount = job.budget

  const handleApplicationSubmit = async (event) => {
    event.preventDefault()
    const next = {}
    if (!applicationForm.coverLetter.trim()) next.coverLetter = 'Cover letter is required.'
    if (Number(applicationForm.estimatedDays) < 1) next.estimatedDays = 'Estimated delivery must be at least one day.'
    if (applicationForm.portfolioUrl && !isValidUrl(applicationForm.portfolioUrl)) next.portfolioUrl = 'Enter a complete http:// or https:// URL.'
    setApplicationErrors(next)
    if (Object.keys(next).length) return

    setProcessing(true)
    try {
      const body = {
        cover_letter: applicationForm.coverLetter.trim(),
        estimated_days: Number(applicationForm.estimatedDays),
      }
      if (applicationForm.portfolioUrl.trim()) body.portfolio_url = applicationForm.portfolioUrl.trim()
      const application = await api.applyToJob(job.id, body)
      addApplication(application)
      setModal(null)
      setApplicationForm(emptyApplication)
      setNotice({ variant: 'success', title: 'Application submitted', message: 'Your application has been sent to the client.' })
    } catch (err) {
      setApplicationErrors({ form: err.message || 'Failed to submit application.' })
    } finally {
      setProcessing(false)
    }
  }

  const withdrawApplication = async () => {
    if (!walletApplication) return
    setProcessing(true)
    try {
      await api.withdrawApplication(walletApplication.id)
      updateApplication(walletApplication.id, { status: 'withdrawn' })
      setNotice({ variant: 'success', title: 'Application withdrawn', message: 'Your application has been withdrawn.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Could not withdraw', message: err.message })
    } finally {
      setProcessing(false)
    }
  }

  const confirmFunding = async () => {
    setProcessing(true)
    try {
      const result = await fundEscrow({
        freelancerAddress: freelancerWallet,
        deliveryDeadlineISO: deliveryDeadline,
        metadataHashInput: String(job.id),
        budgetString: escrowAmount,
        clientAddress: addr,
      })
      // Blockchain confirmed. The backend arc_listener is not yet implemented, so
      // the backend job row won't auto-update escrow_status or blockchain_job_id.
      // Apply the confirmed on-chain state locally so the UI unlocks correctly.
      const patch = {
        escrow_status: 'funded',
        marketplace_status: 'in_progress',
        blockchain_job_id: result.blockchainJobId,
        funding_transaction_hash: result.transactionHash,
      }
      const patched = { ...job, ...patch }
      setJob(patched)
      updateJob(job.id, patch)
      setModal(null)
      setNotice({
        variant: 'success',
        title: 'Escrow funded — blockchain confirmed',
        message: `Transaction confirmed: ${result.transactionHash}. On-chain Job ID: ${result.blockchainJobId}. The freelancer can now submit work.`,
      })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Funding failed', message: err.message })
      setModal(null)
    } finally {
      setProcessing(false)
    }
  }

  const reviewSubmission = (event) => {
    event.preventDefault()
    const next = {}
    if (!isValidUrl(submissionForm.url)) next.url = 'Enter a complete delivery URL beginning with http:// or https://.'
    if (submissionForm.notes.trim().length < 10) next.notes = 'Add at least 10 characters of delivery context.'
    setSubmissionErrors(next)
    if (!Object.keys(next).length) setModal('submit')
  }

  const confirmSubmission = async () => {
    setProcessing(true)
    try {
      // If the escrow is funded on-chain (has a blockchain_job_id), submit on-chain first.
      // The contract enforces that only the assigned freelancer can call submitWork.
      if (blockchainJobId) {
        await submitWorkOnChain({
          blockchainJobId,
          submissionUrl: submissionForm.url,
          freelancerAddress: addr,
        })
        // Blockchain confirmed submitWork. The backend arc_listener is not yet
        // implemented, so the backend escrow_status won't update to work_submitted.
        // Patch local state so canApproveWork opens on the client's side.
        const patch = { escrow_status: 'work_submitted' }
        setJob((prev) => ({ ...prev, ...patch }))
        updateJob(job.id, patch)
      }
      // Record the offchain submission in the backend regardless.
      await api.createSubmission(job.id, {
        submission_url: submissionForm.url,
        notes: submissionForm.notes,
      })
      setSubmission({ submission_url: submissionForm.url, notes: submissionForm.notes })
      setModal(null)
      setNotice({ variant: 'success', title: 'Work submitted', message: 'The client can now review your delivery.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Submission failed', message: err.message })
    } finally {
      setProcessing(false)
    }
  }

  const confirmApproval = async () => {
    setProcessing(true)
    try {
      if (!blockchainJobId) {
        throw new Error('No on-chain job ID. Escrow must be funded on blockchain before approval.')
      }
      await approveAndReleasePayment({ blockchainJobId, clientAddress: addr })
      // Blockchain confirmed approveAndRelease — payment is released to the freelancer.
      // The backend arc_listener is not yet implemented, so patch local state directly.
      const patch = {
        escrow_status: 'completed',
        marketplace_status: 'completed',
      }
      setJob((prev) => ({ ...prev, ...patch }))
      updateJob(job.id, patch)
      setModal(null)
      setNotice({ variant: 'success', title: 'Payment released — blockchain confirmed', message: 'The payment has been released to the freelancer. The escrow is now closed.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Approval failed', message: err.message })
      setModal(null)
    } finally {
      setProcessing(false)
    }
  }

  const confirmRefund = async () => {
    setProcessing(true)
    try {
      if (!blockchainJobId) {
        throw new Error('No on-chain job ID. Escrow must be funded on blockchain before refund.')
      }
      await refundExpiredJobOnChain({ blockchainJobId, clientAddress: addr })
      // Blockchain confirmed refundExpiredJob — patch local state directly.
      const patch = {
        escrow_status: 'refunded',
        marketplace_status: 'cancelled',
      }
      setJob((prev) => ({ ...prev, ...patch }))
      updateJob(job.id, patch)
      setModal(null)
      setNotice({ variant: 'success', title: 'Refund confirmed — blockchain confirmed', message: 'The escrow has been refunded to your wallet.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Refund failed', message: err.message })
      setModal(null)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <Link to={hiringMethod === 'open' ? '/explore' : '/jobs'} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" />Back to {hiringMethod === 'open' ? 'explore' : 'jobs'}
      </Link>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tracking-[0.12em] text-slate-400 uppercase">#{job.id}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{hiringMethod === 'open' ? 'Open for Applications' : 'Direct Hire'}</span>
            {creator && <span className="rounded-full bg-mint-50 px-2 py-1 text-[11px] font-bold text-mint-600">You posted this job</span>}
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{job.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{job.description}</p>
        </div>
        <JobStatusBadge status={job.marketplace_status || job.marketplaceStatus} />
      </header>

      {notice && (
        <div className="mb-6">
          <Alert variant={notice.variant} title={notice.title} onDismiss={() => setNotice(null)}>{notice.message}</Alert>
        </div>
      )}
      {hiringMethod === 'open' && !escrowStatus && (
        <div className="mb-6">
          <Alert variant="info" title="Marketplace job — escrow not funded">No USDC is locked while applications are being reviewed. Funding happens only after a freelancer is selected.</Alert>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-6">
          <section className="card p-5 sm:p-6" aria-labelledby="job-overview-heading">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 id="job-overview-heading" className="font-display text-lg font-bold text-ink-950">Job details</h2>
              <FileText className="size-5 text-slate-400" />
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">{escrowStatus ? 'Escrow amount' : 'Budget'}</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-ink-950">{formatUSDC(escrowAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Delivery deadline</dt>
                <dd className="mt-1 flex items-center gap-2 text-sm font-bold"><CalendarDays className="size-4 text-slate-400" />{formatDate(deliveryDeadline)}</dd>
              </div>
              {applicationDeadline && (
                <div>
                  <dt className="text-xs text-slate-500">Application deadline</dt>
                  <dd className="mt-1 text-sm font-bold">{formatDate(applicationDeadline)}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-500">Required skills</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {skills.map((skill) => <span key={skill} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{skill}</span>)}
                </dd>
              </div>
              <div>
                <dt className="mb-2 text-xs text-slate-500">Client</dt>
                <dd className="text-sm text-slate-700">Posted by user #{job.creator_user_id}</dd>
              </div>
              {freelancerWallet && (
                <div>
                  <dt className="mb-2 text-xs text-slate-500">Freelancer wallet</dt>
                  <dd><WalletBadge address={freelancerWallet} /></dd>
                </div>
              )}
              {hiringMethod === 'open' && (
                <div>
                  <dt className="text-xs text-slate-500">Reference material</dt>
                  <dd>
                    {job.reference_url || job.referenceUrl
                      ? <a href={job.reference_url || job.referenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-mint-600 hover:underline">Open reference <ArrowUpRight className="size-4" /></a>
                      : <span className="text-sm text-slate-400">None</span>
                    }
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {mayReview && (
            <section className="card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <UserRoundCheck className="mt-0.5 size-5 text-mint-600" />
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-ink-950">Applications received</h2>
                  <p className="mt-1 text-sm text-slate-600">Review proposals and select one freelancer before funding.</p>
                  <Link to={`/jobs/${job.id}/applications`} className="btn-dark mt-4">Review Applications</Link>
                </div>
              </div>
            </section>
          )}

          {mayFund && (
            <section className="card border-amber-200 p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink-950">Freelancer selected — funding required</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">The job will not begin until the escrow is created and funded on-chain.</p>
              <button type="button" onClick={() => setModal('fund')} className="btn-dark mt-4"><LockKeyhole className="size-4" />Create and Fund Escrow</button>
            </section>
          )}

          {walletApplication && !creator && (
            <section className="card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-ink-950">Your application</h2>
                <JobStatusBadge status={walletApplication.status} compact />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">{walletApplication.cover_letter || walletApplication.coverLetter}</p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-slate-500">Job payment</dt><dd className="mt-1 font-bold">{formatUSDC(escrowAmount)}</dd></div>
                <div><dt className="text-xs text-slate-500">Estimated delivery</dt><dd className="mt-1 font-bold">{walletApplication.estimated_days || walletApplication.estimatedDays} days</dd></div>
              </dl>
              {(walletApplication.status === 'pending' || walletApplication.status === 'Pending') && (
                <button type="button" onClick={withdrawApplication} disabled={processing} className="btn-secondary mt-5">
                  <RotateCcw className="size-4" />Withdraw Application
                </button>
              )}
            </section>
          )}

          {maySubmit && (
            <section className="card p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink-950">Submit your work</h2>
              <form onSubmit={reviewSubmission} noValidate className="mt-5 space-y-5">
                <FormField label="Submission URL" htmlFor="submissionUrl" required error={submissionErrors.url}>
                  {({ describedBy }) => (
                    <input id="submissionUrl" type="url" value={submissionForm.url} onChange={(e) => setSubmissionForm((c) => ({ ...c, url: e.target.value }))} className={`field-input ${submissionErrors.url ? 'field-input-error' : ''}`} placeholder="https://example.com/deliverable" aria-describedby={describedBy} aria-invalid={Boolean(submissionErrors.url)} />
                  )}
                </FormField>
                <FormField label="Deliverable notes" htmlFor="submissionNotes" required error={submissionErrors.notes}>
                  {({ describedBy }) => (
                    <textarea id="submissionNotes" rows={4} value={submissionForm.notes} onChange={(e) => setSubmissionForm((c) => ({ ...c, notes: e.target.value }))} className={`field-input ${submissionErrors.notes ? 'field-input-error' : ''}`} aria-describedby={describedBy} aria-invalid={Boolean(submissionErrors.notes)} />
                  )}
                </FormField>
                <button type="submit" className="btn-dark"><Send className="size-4" />Submit Work</button>
              </form>
            </section>
          )}

          {mayApprove && submission && (
            <section className="card p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink-950">Review submission</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">{submission.notes}</p>
              <a href={submission.submission_url} target="_blank" rel="noreferrer" className="btn-secondary mt-4">
                <ExternalLink className="size-4" />View Submission
              </a>
              <div className="mt-4">
                <Alert variant="warning">Approval releases the funded USDC and cannot be reversed.</Alert>
              </div>
              <button type="button" onClick={() => setModal('approve')} className="btn-dark mt-4">
                <CheckCircle2 className="size-4" />Approve and Release Payment
              </button>
            </section>
          )}

          {mayRefund && (
            <section className="card border-amber-200 p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink-950">Deadline passed</h2>
              <p className="mt-2 text-sm text-slate-600">The delivery deadline has passed and no work was submitted. You may request a refund.</p>
              <button type="button" onClick={() => setModal('refund')} className="btn-secondary mt-4">
                <RotateCcw className="size-4" />Request Refund
              </button>
            </section>
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6">
          <section className="card p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-ink-950">Next action</h2>
            {mayApply ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-600">Send a proposal to the client. Applying does not create a blockchain transaction.</p>
                <button type="button" onClick={() => setModal('apply')} className="btn-dark mt-5 w-full">Apply for Job</button>
              </>
            ) : creator && hiringMethod === 'open' ? (
              <Link to={`/jobs/${job.id}/applications`} className="btn-dark mt-4 w-full">Review Applications</Link>
            ) : expired && !walletApplication ? (
              <Alert variant="warning" title="Applications closed">The application deadline has passed.</Alert>
            ) : (
              <div className="mt-3 flex items-start gap-2 text-sm text-slate-600">
                <Clock3 className="mt-0.5 size-4 shrink-0" />
                <p>
                  {escrowStatus === 'funded' ? 'The funded job is waiting for the next party action.'
                    : escrowStatus === 'work_submitted' ? 'Submitted work is awaiting client approval.'
                      : marketplaceStatus === 'completed' ? 'This job is complete.'
                        : 'No action is available for this wallet right now.'}
                </p>
              </div>
            )}
          </section>

          {(blockchainJobId || escrowStatus) && (
            <section className="card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-ink-950">Blockchain record</h2>
                <LockKeyhole className="size-5 text-slate-400" />
              </div>
              <dl className="mt-4 space-y-4 text-sm">
                {blockchainJobId && (
                  <div>
                    <dt className="text-xs text-slate-500">Blockchain job ID</dt>
                    <dd className="mt-1 font-mono font-bold">{blockchainJobId}</dd>
                  </div>
                )}
                {(job.funding_transaction_hash || job.transactionHash) && (
                  <div>
                    <dt className="text-xs text-slate-500">Transaction hash</dt>
                    <dd className="mt-1 break-all font-mono text-xs">{shortenAddress(job.funding_transaction_hash || job.transactionHash, 14, 10)}</dd>
                  </div>
                )}
                {escrowStatus && (
                  <div>
                    <dt className="text-xs text-slate-500">Escrow status</dt>
                    <dd className="mt-1"><JobStatusBadge status={escrowStatus} compact /></dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </aside>
      </div>

      {/* Apply modal */}
      <Modal open={modal === 'apply'} onClose={() => !processing && setModal(null)} title="Apply for Job" description="Send a proposal from your connected wallet.">
        <form onSubmit={handleApplicationSubmit} noValidate className="space-y-4">
          {applicationErrors.form && <Alert variant="error">{applicationErrors.form}</Alert>}
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="text-xs text-slate-500">Fixed payment</p>
            <p className="mt-1 font-display text-xl font-bold text-ink-950">{formatUSDC(escrowAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">Set by the client — not negotiable for this job.</p>
          </div>
          <FormField label="Cover letter" htmlFor="coverLetter" required error={applicationErrors.coverLetter}>
            {({ describedBy }) => <textarea id="coverLetter" rows={5} value={applicationForm.coverLetter} onChange={(e) => setApplicationForm((c) => ({ ...c, coverLetter: e.target.value }))} className={`field-input ${applicationErrors.coverLetter ? 'field-input-error' : ''}`} aria-describedby={describedBy} aria-invalid={Boolean(applicationErrors.coverLetter)} />}
          </FormField>
          <FormField label="Estimated delivery days" htmlFor="estimatedDays" required error={applicationErrors.estimatedDays}>
            {({ describedBy }) => <input id="estimatedDays" type="number" min="1" step="1" value={applicationForm.estimatedDays} onChange={(e) => setApplicationForm((c) => ({ ...c, estimatedDays: e.target.value }))} className={`field-input ${applicationErrors.estimatedDays ? 'field-input-error' : ''}`} aria-describedby={describedBy} aria-invalid={Boolean(applicationErrors.estimatedDays)} />}
          </FormField>
          <FormField label="Portfolio URL" htmlFor="portfolioUrl" error={applicationErrors.portfolioUrl}>
            {({ describedBy }) => <input id="portfolioUrl" type="url" value={applicationForm.portfolioUrl} onChange={(e) => setApplicationForm((c) => ({ ...c, portfolioUrl: e.target.value }))} className={`field-input ${applicationErrors.portfolioUrl ? 'field-input-error' : ''}`} placeholder="https://example.com/portfolio" aria-describedby={describedBy} aria-invalid={Boolean(applicationErrors.portfolioUrl)} />}
          </FormField>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={processing} className="btn-dark">
              {processing ? <><LoaderCircle className="size-4 animate-spin" />Submitting…</> : 'Submit Application'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Fund escrow modal */}
      <Modal open={modal === 'fund'} onClose={() => !processing && setModal(null)} title="Create and Fund Escrow" description="This will send a real transaction on Arc Testnet." actions={
        <>
          <button type="button" onClick={() => setModal(null)} disabled={processing} className="btn-secondary">Go Back</button>
          <button type="button" onClick={confirmFunding} disabled={processing} className="btn-dark">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : 'Confirm Funding'}
          </button>
        </>
      }>
        <dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Selected freelancer</dt><dd className="font-mono text-xs">{shortenAddress(freelancerWallet, 8, 6)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Escrow amount</dt><dd className="font-bold">{formatUSDC(escrowAmount)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Delivery deadline</dt><dd className="font-bold">{formatDate(deliveryDeadline)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Network</dt><dd className="font-bold">Arc Testnet</dd></div>
        </dl>
        <div className="mt-4">
          <Alert variant="warning"><span className="inline-flex gap-2"><ShieldAlert className="size-4 shrink-0" />Blockchain transactions are irreversible. Verify all details before confirming.</span></Alert>
        </div>
      </Modal>

      {/* Submit work confirmation modal */}
      <Modal open={modal === 'submit'} onClose={() => !processing && setModal(null)} title="Confirm work submission" description="The client will receive the delivery link and notes." actions={
        <>
          <button type="button" onClick={() => setModal(null)} className="btn-secondary">Go Back</button>
          <button type="button" onClick={confirmSubmission} disabled={processing} className="btn-dark">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Submitting…</> : 'Confirm Submission'}
          </button>
        </>
      } />

      {/* Approve payment modal */}
      <Modal open={modal === 'approve'} onClose={() => !processing && setModal(null)} title="Approve and release payment?" description={`This will release ${formatUSDC(escrowAmount)} to the freelancer.`} actions={
        <>
          <button type="button" onClick={() => setModal(null)} className="btn-secondary">Review Again</button>
          <button type="button" onClick={confirmApproval} disabled={processing} className="btn-dark">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : 'Approve Payment'}
          </button>
        </>
      }>
        <Alert variant="warning">An on-chain release cannot be reversed.</Alert>
      </Modal>

      {/* Refund modal */}
      <Modal open={modal === 'refund'} onClose={() => !processing && setModal(null)} title="Request escrow refund?" description={`This will return ${formatUSDC(escrowAmount)} to your wallet.`} actions={
        <>
          <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
          <button type="button" onClick={confirmRefund} disabled={processing} className="btn-dark">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : 'Confirm Refund'}
          </button>
        </>
      } />
    </>
  )
}
