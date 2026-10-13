import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Code,
  ExternalLink,
  FileText,
  Globe,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Send,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Alert from '../components/Alert'
import FormField from '../components/FormField'
import JobDiscussion from '../components/JobDiscussion'
import JobStatusBadge from '../components/JobStatusBadge'
import Modal from '../components/Modal'
import WalletBadge from '../components/WalletBadge'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import {
  approveAndReleasePayment,
  assignFreelancerOnChain,
  budgetToWei,
  cancelUnassignedJobOnChain,
  claimPaymentAfterReviewOnChain,
  formatUnits,
  fundOpenJobOnChain,
  getWalletBalance,
  refundExpiredJobOnChain,
  requestRevisionOnChain,
} from '../services/blockchain'
import { formatDate, formatUSDC, shortenAddress } from '../utils/format'
import {
  canAccessJobDiscussion,
  canApply,
  canApproveWork,
  canAssignOnChain,
  canCancelUnassignedJob,
  canClaimPaymentAfterReview,
  canClaimRefund,
  canFundJob,
  canRequestChanges,
  canReviewApplications,
  canSubmitWork,
  getMarketplaceStatus,
  getWalletApplication,
  hasApplicationDeadlinePassed,
  isJobCreator,
  isSelectedFreelancer,
} from '../utils/permissions'

const emptyApplication = { coverLetter: '', estimatedDays: '', portfolioUrl: '' }
const isValidUrl = (value) => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

// Safe skill array from backend (json.RawMessage may come as array or null)
function getSkills(job) {
  const raw = job.required_skills || job.requiredSkills
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export default function JobDetails() {
  const { id } = useParams()
  const { walletAddress, wallet, applications, addApplication, updateApplication, refreshJob } = useApp()
  const addr = walletAddress || wallet.address

  const [job, setJob] = useState(null)
  const [jobLoading, setJobLoading] = useState(true)
  const [jobNotFound, setJobNotFound] = useState(false)
  const [submission, setSubmission] = useState(null)

  const [applicationForm, setApplicationForm] = useState(emptyApplication)
  const [applicationErrors, setApplicationErrors] = useState({})
  const [submissionForm, setSubmissionForm] = useState({ repositoryUrl: '', demoUrl: '', notes: '' })
  const [submissionErrors, setSubmissionErrors] = useState({})
  const [revisionFeedback, setRevisionFeedback] = useState('')
  const [revisionFeedbackError, setRevisionFeedbackError] = useState('')
  const [editForm, setEditForm] = useState({ title: '', description: '', skills: '', applicationDeadline: '', deliveryDeadline: '' })
  const [editErrors, setEditErrors] = useState({})
  const [modal, setModal] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [notice, setNotice] = useState(null)
  const [fundingError, setFundingError] = useState(null)
  const [now] = useState(() => Date.now())

  // Load job from API on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // job is in_progress / funded.
  useEffect(() => {
    if (!job) return
    const es = (job.escrow_status || '').toLowerCase()
    const ms = getMarketplaceStatus(job)
    if (es === 'work_submitted' || es === 'completed' || es === 'funded' || ms === 'in_progress') {
      api.getSubmission(job.id)
        .then((sub) => {
          setSubmission(sub)
          if (sub) {
            setSubmissionForm((prev) => ({
              repositoryUrl: prev.repositoryUrl || sub.repository_url || '',
              demoUrl: prev.demoUrl || sub.demo_url || (sub.submission_url && !sub.repository_url ? sub.submission_url : ''),
              notes: prev.notes || sub.notes || '',
            }))
          }
        })
        .catch(() => { })
    }
  }, [job])

  if (jobLoading) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
      <p className="mt-4 text-sm text-slate-400">Loading job…</p>
    </div>
  )
  if (jobNotFound) return <Navigate to="/404" replace />
  if (!job) return <Navigate to="/404" replace />

  const marketplaceStatus = getMarketplaceStatus(job)
  const escrowStatus = (job.escrow_status || job.escrowStatus || '').toLowerCase() || null
  const freelancerWallet = job.selected_freelancer_wallet || job.selectedFreelancerWallet
  const blockchainJobId = job.blockchain_job_id || job.blockchainJobId
  const escrowContractAddress = job.escrow_contract_address || job.escrowContractAddress
  const deliveryDeadline = job.delivery_deadline || job.deliveryDeadline
  const applicationDeadline = job.application_deadline || job.applicationDeadline
  const skills = getSkills(job)

  // Load wallet application — backend applications (from context) or check current job state
  const walletApplication = getWalletApplication(job, addr, applications)

  const creator = isJobCreator(job, addr)
  const selectedFreelancer = isSelectedFreelancer(job, addr)
  const mayApply = canApply(job, addr, applications)
  const mayReview = canReviewApplications(job, addr)
  const mayFund = canFundJob(job, addr)
  const mayAssign = canAssignOnChain(job, addr)
  const maySubmit = canSubmitWork(job, addr)
  const mayApprove = canApproveWork(job, addr)
  const mayRequestChanges = canRequestChanges(job, addr)
  const mayRefund = canClaimRefund(job, addr)
  const mayCancel = canCancelUnassignedJob(job, addr)
  const mayAutoClaim = canClaimPaymentAfterReview(job, addr, submission)
  const mayAccessDiscussion = canAccessJobDiscussion(job, addr)
  const mayEdit = creator && (marketplaceStatus === 'open' || marketplaceStatus === 'reviewing_applications')
  const expired = hasApplicationDeadlinePassed(job)

  const escrowAmount = job.budget

  // Delivery deadline status calculation
  const deadlineInfo = (() => {
    if (!deliveryDeadline) return null
    const target = new Date(deliveryDeadline).getTime()
    const diff = target - now
    if (diff < 0) {
      return { status: 'passed', label: 'Delivery deadline passed', badgeClass: 'bg-red-50 text-red-700 ring-red-200' }
    }
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days === 1) {
      const hours = Math.ceil(diff / (1000 * 60 * 60))
      return { status: 'urgent', label: `${hours}h remaining`, badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200' }
    }
    return { status: 'normal', label: `${days} days remaining`, badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
  })()

  // Auto-claim countdown info for freelancer
  const reviewPeriodInfo = (() => {
    if (escrowStatus !== 'work_submitted' || !submission) return null
    const dateStr = submission.reviewed_at || submission.submitted_at || submission.updated_at || submission.created_at
    if (!dateStr) return null
    const submitTime = new Date(dateStr).getTime()
    const expiryTime = submitTime + 7 * 24 * 60 * 60 * 1000
    const diff = expiryTime - now
    if (diff <= 0) {
      return { ready: true, label: '7-day review period elapsed. Auto-claim is available.' }
    }
    const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return { ready: false, daysLeft, label: `Auto-claim available in ${daysLeft} day${daysLeft === 1 ? '' : 's'} if client does not respond.` }
  })()

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

  const handleEditClick = () => {
    setEditForm({
      title: job.title,
      description: job.description,
      skills: skills.join(', '),
      applicationDeadline: applicationDeadline ? applicationDeadline.slice(0, 10) : '',
      deliveryDeadline: deliveryDeadline ? deliveryDeadline.slice(0, 10) : '',
    })
    setEditErrors({})
    setModal('edit')
  }

  const handleEditSubmit = async (event) => {
    event.preventDefault()
    const next = {}
    if (editForm.title.trim().length < 4) next.title = 'Enter a clear title with at least 4 characters.'
    if (editForm.description.trim().length < 30) next.description = 'Describe the scope in at least 30 characters.'
    if (!editForm.skills.trim()) next.skills = 'Add at least one required skill.'
    if (!editForm.applicationDeadline) next.applicationDeadline = 'Required.'
    if (!editForm.deliveryDeadline) next.deliveryDeadline = 'Required.'
    setEditErrors(next)
    if (Object.keys(next).length) return

    setProcessing(true)
    try {
      const body = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        required_skills: editForm.skills.split(',').map((s) => s.trim()).filter(Boolean),
        application_deadline: new Date(`${editForm.applicationDeadline}T23:59:59Z`).toISOString(),
        delivery_deadline: new Date(`${editForm.deliveryDeadline}T23:59:59Z`).toISOString(),
      }
      const updatedJob = await api.updateJob(job.id, body)
      setJob(updatedJob)
      refreshJob(job.id)
      setModal(null)
      setNotice({ variant: 'success', title: 'Job updated', message: 'Job details have been saved.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Update failed', message: err.message || 'Failed to update job' })
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
    setFundingError(null)
    try {
      const required = budgetToWei(escrowAmount)
      let balance
      try { balance = await getWalletBalance(addr) } catch { balance = null }
      if (balance !== null && balance < required) {
        const have = Number(formatUnits(balance, 18)).toFixed(4)
        const need = Number(formatUnits(required, 18)).toFixed(4)
        setFundingError(`Insufficient balance. You need ${need} USDC but your wallet only has ${have} USDC on Arc Testnet.`)
        setProcessing(false)
        return
      }

      await fundOpenJobOnChain({
        deliveryDeadlineISO: deliveryDeadline,
        metadataHashInput: String(job.id),
        budgetString: escrowAmount,
        clientAddress: addr,
      })

      // Wait for backend to index
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const check = await api.getJob(job.id)
        if (check.escrow_status) break
      }

      setModal(null)
      const updatedJob = await api.getJob(job.id)
      setJob(updatedJob)
      refreshJob(job.id)
      setNotice({ variant: 'success', title: 'Escrow funded', message: 'Job is now funded on-chain.' })
    } catch (err) {
      setFundingError(err.message || 'Transaction failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  const confirmAssignment = async () => {
    setProcessing(true)
    try {
      if (!blockchainJobId) throw new Error('No on-chain job ID found.')
      const { transactionHash } = await assignFreelancerOnChain({
        blockchainJobId,
        freelancerAddress: freelancerWallet,
        clientAddress: addr,
        contractAddress: escrowContractAddress,
      })
      setModal(null)
      setNotice({ variant: 'info', title: 'Transaction sent', message: 'Waiting for blockchain verification...' })
      try {
        await api.syncEscrow(job.id, transactionHash)
      } catch (syncErr) {
        console.warn('Sync escrow warning:', syncErr)
      }
      const updatedJob = await api.getJob(job.id)
      setJob(updatedJob)
      refreshJob(job.id)
      setNotice({ variant: 'success', title: 'Freelancer assigned', message: 'The escrow is now fully funded for this freelancer.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Assignment failed', message: err.message })
    } finally {
      setProcessing(false)
    }
  }

  const reviewSubmission = (event) => {
    event.preventDefault()
    const next = {}
    const repo = submissionForm.repositoryUrl.trim()
    const demo = submissionForm.demoUrl.trim()

    if (!repo && !demo) {
      next.repositoryUrl = 'Provide either a Repository URL or a Live Demo URL.'
    }
    if (repo && !isValidUrl(repo)) {
      next.repositoryUrl = 'Enter a complete URL beginning with http:// or https://'
    }
    if (demo && !isValidUrl(demo)) {
      next.demoUrl = 'Enter a complete URL beginning with http:// or https://'
    }
    if (submissionForm.notes.trim().length < 10) {
      next.notes = 'Add at least 10 characters of deliverable context.'
    }
    setSubmissionErrors(next)
    if (!Object.keys(next).length) setModal('submit')
  }

  const confirmSubmission = async () => {
    setProcessing(true)
    try {
      const primaryUrl = submissionForm.repositoryUrl.trim() || submissionForm.demoUrl.trim()
      const body = {
        repository_url: submissionForm.repositoryUrl.trim(),
        demo_url: submissionForm.demoUrl.trim(),
        submission_url: primaryUrl,
        notes: submissionForm.notes.trim(),
      }

      // Record off-chain submission (100% free, zero gas fee for freelancer)
      const savedSub = await api.createSubmission(job.id, body)
      setSubmission(savedSub)
      setModal(null)
      const updatedJob = await api.getJob(job.id)
      setJob(updatedJob)
      refreshJob(job.id)
      setNotice({
        variant: 'success',
        title: submission?.status === 'CHANGES_REQUESTED' ? 'Revised work resubmitted' : 'Work submitted for review',
        message: 'Your deliverable links and notes were submitted successfully. No gas fees required!',
      })
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
      const { transactionHash } = await approveAndReleasePayment({
        blockchainJobId,
        clientAddress: addr,
        contractAddress: escrowContractAddress,
      })
      setModal(null)
      setNotice({ variant: 'info', title: 'Transaction sent', message: 'Payment released on blockchain. Syncing status...' })

      // Immediately set completed state locally since on-chain release succeeded
      setJob((prev) => ({
        ...prev,
        status: 'COMPLETED',
        marketplace_status: 'completed',
        escrow_status: 'completed',
      }))

      try {
        await api.syncEscrow(job.id, transactionHash)
      } catch (syncErr) {
        console.warn('Sync escrow warning (background listener will update state):', syncErr)
      }

      // Refresh job from backend, but never revert to funded if backend indexing is still pending
      try {
        const updatedJob = await api.getJob(job.id)
        if (updatedJob && (updatedJob.escrow_status === 'completed' || updatedJob.status === 'COMPLETED')) {
          setJob(updatedJob)
        }
        refreshJob(job.id)
      } catch (err) {
        console.warn('Refresh job warning:', err)
      }

      // Refresh submission
      api.getSubmission(job.id).then(setSubmission).catch(() => {})
      setNotice({ variant: 'success', title: 'Payment released', message: 'The payment has been released to the freelancer. The escrow is now closed.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Approval failed', message: err.message })
      setModal(null)
    } finally {
      setProcessing(false)
    }
  }

  const confirmRequestChanges = async () => {
    if (revisionFeedback.trim().length < 10) {
      setRevisionFeedbackError('Please explain what revisions are required in at least 10 characters.')
      return
    }
    setProcessing(true)
    setRevisionFeedbackError('')
    try {
      await api.requestChanges(job.id, revisionFeedback.trim())

      if (blockchainJobId) {
        const { transactionHash } = await requestRevisionOnChain({
          blockchainJobId,
          clientAddress: addr,
          contractAddress: escrowContractAddress,
        })
        setModal(null)
        setNotice({ variant: 'info', title: 'Revision requested', message: 'Smart contract status reverted to funded. Delivery deadline extended.' })
        try {
          await api.syncEscrow(job.id, transactionHash)
        } catch (syncErr) {
          console.warn('Sync escrow warning:', syncErr)
        }
        const updatedJob = await api.getJob(job.id)
        setJob(updatedJob)
        refreshJob(job.id)
      } else {
        setModal(null)
        const updatedJob = await api.getJob(job.id)
        setJob(updatedJob)
        refreshJob(job.id)
      }

      api.getSubmission(job.id).then(setSubmission).catch(() => {})
      setNotice({
        variant: 'success',
        title: 'Changes requested',
        message: 'The freelancer has been instructed with your revision feedback. Funds remain safe in escrow.',
      })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Failed to request changes', message: err.message })
    } finally {
      setProcessing(false)
    }
  }

  const confirmAutoClaim = async () => {
    setProcessing(true)
    try {
      if (!blockchainJobId) throw new Error('No on-chain job ID found.')
      const { transactionHash } = await claimPaymentAfterReviewOnChain({
        blockchainJobId,
        freelancerAddress: addr,
        contractAddress: escrowContractAddress,
      })
      setModal(null)
      setNotice({ variant: 'info', title: 'Transaction sent', message: 'Waiting for blockchain verification...' })
      try {
        await api.syncEscrow(job.id, transactionHash)
      } catch (syncErr) {
        console.warn('Sync escrow warning:', syncErr)
      }
      const updatedJob = await api.getJob(job.id)
      setJob(updatedJob)
      refreshJob(job.id)
      api.getSubmission(job.id).then(setSubmission).catch(() => {})
      setNotice({
        variant: 'success',
        title: 'Payment claimed',
        message: 'Escrow payment released to your wallet via client review period expiration.',
      })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Auto-claim failed', message: err.message })
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
      const { transactionHash } = await refundExpiredJobOnChain({
        blockchainJobId,
        clientAddress: addr,
        contractAddress: escrowContractAddress,
      })
      await api.cancelJob(job.id)
      setModal(null)
      setNotice({ variant: 'info', title: 'Transaction sent', message: 'Waiting for blockchain verification...' })
      try {
        await api.syncEscrow(job.id, transactionHash)
      } catch (syncErr) {
        console.warn('Sync escrow warning:', syncErr)
      }
      const updatedJob = await api.getJob(job.id)
      setJob(updatedJob)
      refreshJob(job.id)
      setNotice({ variant: 'success', title: 'Refund confirmed', message: 'The escrow has been refunded to your wallet.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Refund failed', message: err.message })
      setModal(null)
    } finally {
      setProcessing(false)
    }
  }

  const confirmCancel = async () => {
    setProcessing(true)
    try {
      if (!blockchainJobId) {
        throw new Error('No on-chain job ID. Escrow must be funded on blockchain before cancelling.')
      }
      await cancelUnassignedJobOnChain({
        blockchainJobId,
        clientAddress: addr,
        contractAddress: escrowContractAddress,
      })
      await api.cancelJob(job.id)
      setModal(null)
      const updatedJob = await api.getJob(job.id)
      setJob(updatedJob)
      refreshJob(job.id)
      setNotice({ variant: 'success', title: 'Job cancelled', message: 'The escrow has been returned to your wallet.' })
    } catch (err) {
      setNotice({ variant: 'error', title: 'Cancellation failed', message: err.message })
      setModal(null)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="page-enter">
      <Link to="/explore" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-900">
        <ArrowLeft className="size-4" />Back
      </Link>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {creator && (
              <span className="rounded-full bg-mint-50 px-2.5 py-1 text-[11px] font-bold text-mint-700 ring-1 ring-mint-100">
                Your Job
              </span>
            )}
            {selectedFreelancer && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-100">
                You're hired
              </span>
            )}
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{job.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">{job.description}</p>
        </div>
        <div className="shrink-0">
          <JobStatusBadge status={marketplaceStatus} />
        </div>
      </header>

      {notice && (
        <div className="mb-6">
          <Alert variant={notice.variant} title={notice.title} onDismiss={() => setNotice(null)}>{notice.message}</Alert>
        </div>
      )}
      {!escrowStatus && (
        <div className="mb-6">
          <Alert variant="info" title="Marketplace job — escrow not funded">
            No USDC is locked while applications are being reviewed. Funding happens only after a freelancer is selected or when the creator funds the escrow.
          </Alert>
        </div>
      )}

      {/* Revision requested notice for Freelancer */}
      {selectedFreelancer && submission?.status === 'CHANGES_REQUESTED' && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50/80 p-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <AlertTriangle className="size-5" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-bold text-amber-950">
                  Client requested revisions on your work
                </h2>
                {submission.revision_count > 0 && (
                  <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-bold text-amber-900">
                    Revision #{submission.revision_count}
                  </span>
                )}
              </div>
              <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/90 p-4 text-sm text-amber-950 shadow-2xs">
                <p className="text-xs font-bold tracking-wide text-amber-800 uppercase">Client Feedback &amp; Instructions</p>
                <p className="mt-1 whitespace-pre-wrap leading-6">{submission.review_feedback || 'No written feedback provided.'}</p>
              </div>
              <p className="mt-3 text-xs text-amber-800">
                Your delivery deadline has been extended to give you time to address the feedback. Update your repository, demo link, or notes in the submission form below.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-6">
          {/* Job Overview */}
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
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold">
                  <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-slate-400" />{formatDate(deliveryDeadline)}</span>
                  {deadlineInfo && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${deadlineInfo.badgeClass}`}>
                      {deadlineInfo.label}
                    </span>
                  )}
                </dd>
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
                <dd className="text-sm font-bold text-slate-700">
                  {job.creator_username ? `@${job.creator_username}` : shortenAddress(job.creator_wallet || '')}
                </dd>
              </div>
              {freelancerWallet && (
                <div>
                  <dt className="mb-2 text-xs text-slate-500">Freelancer wallet</dt>
                  <dd><WalletBadge address={freelancerWallet} /></dd>
                </div>
              )}
            </dl>
          </section>

          {/* Client: Review Applications */}
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

          {/* Client: Fund Job */}
          {mayFund && (
            <section className="card border-amber-200 p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink-950">Job saved — funding required</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">The job is not visible to freelancers until the escrow is created and funded on-chain.</p>
              <button type="button" onClick={() => { setFundingError(null); setModal('fund') }} className="btn-dark mt-4">
                <LockKeyhole className="size-4" />Fund this job
              </button>
            </section>
          )}

          {/* Client: Confirm Freelancer Assignment */}
          {mayAssign && (
            <section className="card border-amber-200 p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink-950">Freelancer selected — assignment required</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">The job will not begin until the freelancer is assigned to the on-chain escrow.</p>
              <button type="button" onClick={() => { setModal('assign') }} className="btn-dark mt-4">
                <LockKeyhole className="size-4" />Confirm freelancer on-chain
              </button>
            </section>
          )}

          {/* Client: Cancel Unassigned Job */}
          {mayCancel && (
            <section className="card border-red-200 p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink-950">Cancel this job</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">No freelancer has been assigned yet. You can close this job and reclaim your escrowed funds at any time.</p>
              <button type="button" onClick={() => setModal('cancel')} className="btn-secondary mt-4 border-red-300 text-red-700 hover:bg-red-50">
                <RotateCcw className="size-4" />Cancel Job &amp; Reclaim Funds
              </button>
            </section>
          )}

          {/* Freelancer: Existing Application Info */}
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

          {/* Freelancer: Submit / Resubmit Work */}
          {maySubmit && (!submission || submission?.status === 'CHANGES_REQUESTED') && (
            <section className="card p-5 sm:p-6" aria-labelledby="submission-form-heading">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 id="submission-form-heading" className="font-display text-lg font-bold text-ink-950">
                  {submission?.status === 'CHANGES_REQUESTED' ? 'Resubmit revised deliverables' : 'Submit your work'}
                </h2>
                {submission?.revision_count > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    Revision #{submission.revision_count + 1}
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm text-slate-600">
                Provide the link to your codebase repository (GitHub, GitLab), live deployed demo (Vercel, Netlify), and detailed delivery notes.
              </p>

              <form onSubmit={reviewSubmission} noValidate className="mt-5 space-y-5">
                <FormField
                  label="Repository URL (GitHub / GitLab / Bitbucket)"
                  htmlFor="submissionRepoUrl"
                  error={submissionErrors.repositoryUrl}
                >
                  {({ describedBy }) => (
                    <div className="relative">
                      <Code className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="submissionRepoUrl"
                        type="url"
                        value={submissionForm.repositoryUrl}
                        onChange={(e) => setSubmissionForm((c) => ({ ...c, repositoryUrl: e.target.value }))}
                        className={`field-input pl-9 ${submissionErrors.repositoryUrl ? 'field-input-error' : ''}`}
                        placeholder="https://github.com/username/project"
                        aria-describedby={describedBy}
                        aria-invalid={Boolean(submissionErrors.repositoryUrl)}
                      />
                    </div>
                  )}
                </FormField>

                <FormField
                  label="Live Demo URL (Vercel / Netlify / Hosted site)"
                  htmlFor="submissionDemoUrl"
                  error={submissionErrors.demoUrl}
                >
                  {({ describedBy }) => (
                    <div className="relative">
                      <Globe className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="submissionDemoUrl"
                        type="url"
                        value={submissionForm.demoUrl}
                        onChange={(e) => setSubmissionForm((c) => ({ ...c, demoUrl: e.target.value }))}
                        className={`field-input pl-9 ${submissionErrors.demoUrl ? 'field-input-error' : ''}`}
                        placeholder="https://my-demo-app.vercel.app"
                        aria-describedby={describedBy}
                        aria-invalid={Boolean(submissionErrors.demoUrl)}
                      />
                    </div>
                  )}
                </FormField>

                <FormField
                  label="Deliverable notes &amp; instructions"
                  htmlFor="submissionNotes"
                  required
                  error={submissionErrors.notes}
                >
                  {({ describedBy }) => (
                    <textarea
                      id="submissionNotes"
                      rows={4}
                      value={submissionForm.notes}
                      onChange={(e) => setSubmissionForm((c) => ({ ...c, notes: e.target.value }))}
                      className={`field-input ${submissionErrors.notes ? 'field-input-error' : ''}`}
                      placeholder="Explain what was accomplished, deployment notes, testing credentials, or how to verify the deliverable."
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(submissionErrors.notes)}
                    />
                  )}
                </FormField>

                <button type="submit" className="btn-dark">
                  <Send className="size-4" />
                  {submission?.status === 'CHANGES_REQUESTED' ? 'Resubmit Revised Work' : 'Submit Work for Review'}
                </button>
              </form>
            </section>
          )}

          {/* Freelancer: Auto-claim payment after 7 days without client review */}
          {mayAutoClaim && (
            <section className="card border-emerald-300 bg-emerald-50/60 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 size-5 text-emerald-600" />
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-ink-950">Review period elapsed — Claim payment</h2>
                  <p className="mt-1 text-sm text-slate-700">
                    The client has not approved or requested changes within 7 days of your submission. You can now claim the full escrowed amount directly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModal('claimAuto')}
                    className="btn-dark mt-4 bg-emerald-700 hover:bg-emerald-800"
                  >
                    <CheckCircle2 className="size-4" />
                    Claim Escrow Payment ({formatUSDC(escrowAmount)})
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Client: Review Deliverables */}
          {mayApprove && submission && (
            <section className="card p-5 sm:p-6" aria-labelledby="review-submission-heading">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <h2 id="review-submission-heading" className="font-display text-lg font-bold text-ink-950">Review submitted deliverables</h2>
                  {submission.revision_count > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                      Revision #{submission.revision_count}
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                  Ready for client review
                </span>
              </div>

              {/* Links container */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {submission.repository_url && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <Code className="size-4 shrink-0 text-slate-600" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-500 uppercase">Repository</p>
                        <p className="truncate font-mono text-xs text-slate-800">{submission.repository_url}</p>
                      </div>
                    </div>
                    <a
                      href={submission.repository_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary ml-2 shrink-0 py-1.5 text-xs"
                    >
                      <ExternalLink className="size-3.5" />Open
                    </a>
                  </div>
                )}

                {(submission.demo_url || (!submission.repository_url && submission.submission_url)) && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <Globe className="size-4 shrink-0 text-mint-600" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-500 uppercase">Live Demo</p>
                        <p className="truncate font-mono text-xs text-slate-800">
                          {submission.demo_url || submission.submission_url}
                        </p>
                      </div>
                    </div>
                    <a
                      href={submission.demo_url || submission.submission_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary ml-2 shrink-0 py-1.5 text-xs"
                    >
                      <ExternalLink className="size-3.5" />Open
                    </a>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold tracking-wide text-slate-400 uppercase">Freelancer Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{submission.notes}</p>
              </div>

              {/* Auto-claim countdown banner */}
              {reviewPeriodInfo && (
                <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <Clock3 className="size-3.5" />
                    Review Period:
                  </div>
                  <p className="mt-0.5">{reviewPeriodInfo.label}</p>
                </div>
              )}

              {/* Review Actions */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setModal('approve')}
                  className="btn-dark flex-1 bg-mint-600 hover:bg-mint-700"
                >
                  <CheckCircle2 className="size-4" />
                  Approve and Release Payment
                </button>
                {mayRequestChanges && (
                  <button
                    type="button"
                    onClick={() => {
                      setRevisionFeedback('')
                      setRevisionFeedbackError('')
                      setModal('requestChanges')
                    }}
                    className="btn-secondary flex-1 border-amber-300 text-amber-900 hover:bg-amber-50"
                  >
                    <RotateCcw className="size-4" />
                    Request Changes
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Freelancer: Submitted work status (awaiting client approval) */}
          {selectedFreelancer && (escrowStatus === 'work_submitted' || (escrowStatus === 'funded' && submission?.status === 'SUBMITTED')) && submission && !mayAutoClaim && (
            <section className="card p-5 sm:p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="font-display text-lg font-bold text-ink-950">Work submitted · Awaiting client review</h2>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">Under review</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Your deliverables have been submitted directly to the client. The client will review your submission and release payment to your wallet.
              </p>
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs space-y-2">
                {submission.repository_url && (
                  <p><span className="font-semibold text-slate-700">Repository:</span> <span className="font-mono text-slate-600">{submission.repository_url}</span></p>
                )}
                {submission.demo_url && (
                  <p><span className="font-semibold text-slate-700">Live Demo:</span> <span className="font-mono text-slate-600">{submission.demo_url}</span></p>
                )}
                {submission.notes && (
                  <p><span className="font-semibold text-slate-700">Notes:</span> <span className="text-slate-600">{submission.notes}</span></p>
                )}
              </div>
            </section>
          )}

          {/* Client: Request Refund if delivery deadline passed without submission */}
          {mayRefund && !submission && (
            <section className="card border-amber-200 p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold text-ink-950">Deadline passed</h2>
              <p className="mt-2 text-sm text-slate-600">The delivery deadline has passed and no work was submitted. You may request a refund of your escrow.</p>
              <button type="button" onClick={() => setModal('refund')} className="btn-secondary mt-4">
                <RotateCcw className="size-4" />Request Refund
              </button>
            </section>
          )}

          {/* Job Discussion Workspace */}
          {mayAccessDiscussion && (
            <JobDiscussion
              jobId={job.id}
              currentUserId={wallet?.user_id}
              currentWallet={addr}
              clientWallet={job.creator_wallet}
              freelancerWallet={freelancerWallet}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 xl:sticky xl:top-6">
          <section className="card p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-ink-950">Next action</h2>
            {mayApply ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-600">Send a proposal to the client. Applying does not create a blockchain transaction.</p>
                <button type="button" onClick={() => setModal('apply')} className="btn-dark mt-5 w-full">Apply for Job</button>
              </>
            ) : creator ? (
              <>
                <Link to={`/jobs/${job.id}/applications`} className="btn-dark mt-4 w-full">Review Applications</Link>
                {mayEdit && <button type="button" onClick={handleEditClick} className="btn-secondary mt-3 w-full">Edit Job</button>}
              </>
            ) : expired && !walletApplication ? (
              <Alert variant="warning" title="Applications closed">The application deadline has passed.</Alert>
            ) : (
              <div className="mt-3 flex items-start gap-2 text-sm text-slate-600">
                <Clock3 className="mt-0.5 size-4 shrink-0" />
                <p>
                  {escrowStatus === 'funded'
                    ? selectedFreelancer
                      ? 'You are hired. Work on deliverables and submit them before the deadline.'
                      : 'The funded job is waiting for the next party action.'
                    : escrowStatus === 'work_submitted'
                      ? 'Submitted work is awaiting client approval.'
                      : marketplaceStatus === 'completed'
                        ? 'This job is complete and payments released.'
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
                    <dd className="mt-1 break-all font-mono text-xs">
                      {shortenAddress(job.funding_transaction_hash || job.transactionHash, 14, 10)}
                    </dd>
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

      {/* Edit Job modal */}
      <Modal open={modal === 'edit'} onClose={() => !processing && setModal(null)} title="Edit Job" description="Update the details of your job posting.">
        <form onSubmit={handleEditSubmit} noValidate className="space-y-4">
          <FormField label="Job title" htmlFor="editTitle" required error={editErrors.title}>
            {({ describedBy }) => <input id="editTitle" value={editForm.title} onChange={(e) => setEditForm((c) => ({ ...c, title: e.target.value }))} className={`field-input ${editErrors.title ? 'field-input-error' : ''}`} aria-describedby={describedBy} aria-invalid={Boolean(editErrors.title)} />}
          </FormField>
          <FormField label="Job description" htmlFor="editDescription" required error={editErrors.description}>
            {({ describedBy }) => <textarea id="editDescription" rows={5} value={editForm.description} onChange={(e) => setEditForm((c) => ({ ...c, description: e.target.value }))} className={`field-input ${editErrors.description ? 'field-input-error' : ''}`} aria-describedby={describedBy} aria-invalid={Boolean(editErrors.description)} />}
          </FormField>
          <FormField label="Required skills" htmlFor="editSkills" required error={editErrors.skills}>
            {({ describedBy }) => <input id="editSkills" value={editForm.skills} onChange={(e) => setEditForm((c) => ({ ...c, skills: e.target.value }))} className={`field-input ${editErrors.skills ? 'field-input-error' : ''}`} placeholder="Comma separated" aria-describedby={describedBy} aria-invalid={Boolean(editErrors.skills)} />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Application deadline" htmlFor="editAppDeadline" required error={editErrors.applicationDeadline}>
              {({ describedBy }) => <input id="editAppDeadline" type="date" value={editForm.applicationDeadline} onChange={(e) => setEditForm((c) => ({ ...c, applicationDeadline: e.target.value }))} className={`field-input ${editErrors.applicationDeadline ? 'field-input-error' : ''}`} aria-describedby={describedBy} aria-invalid={Boolean(editErrors.applicationDeadline)} />}
            </FormField>
            <FormField label="Delivery deadline" htmlFor="editDelDeadline" required error={editErrors.deliveryDeadline}>
              {({ describedBy }) => <input id="editDelDeadline" type="date" value={editForm.deliveryDeadline} onChange={(e) => setEditForm((c) => ({ ...c, deliveryDeadline: e.target.value }))} className={`field-input ${editErrors.deliveryDeadline ? 'field-input-error' : ''}`} aria-describedby={describedBy} aria-invalid={Boolean(editErrors.deliveryDeadline)} />}
            </FormField>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={processing} className="btn-dark">
              {processing ? <><LoaderCircle className="size-4 animate-spin" />Saving…</> : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Fund escrow modal */}
      <Modal open={modal === 'fund'} onClose={() => !processing && setModal(null)} title="Fund this job" description="This will send a real transaction on Arc Testnet." actions={
        <>
          <button type="button" onClick={() => setModal(null)} disabled={processing} className="btn-secondary">Go Back</button>
          <button type="button" onClick={confirmFunding} disabled={processing} className="btn-dark">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : 'Confirm Funding'}
          </button>
        </>
      }>
        <dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Escrow amount</dt><dd className="font-bold">{formatUSDC(escrowAmount)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Delivery deadline</dt><dd className="font-bold">{formatDate(deliveryDeadline)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Network</dt><dd className="font-bold">Arc Testnet</dd></div>
        </dl>
        {fundingError && (
          <div className="mt-4">
            <Alert variant="error" title="Cannot fund escrow">{fundingError}</Alert>
          </div>
        )}
        <div className="mt-4">
          <Alert variant="warning"><span className="inline-flex gap-2"><ShieldAlert className="size-4 shrink-0" />Blockchain transactions are irreversible. Verify all details before confirming.</span></Alert>
        </div>
      </Modal>

      {/* Assign freelancer modal */}
      <Modal open={modal === 'assign'} onClose={() => !processing && setModal(null)} title="Confirm freelancer on-chain" description="This will assign the selected freelancer to the existing escrow." actions={
        <>
          <button type="button" onClick={() => setModal(null)} disabled={processing} className="btn-secondary">Go Back</button>
          <button type="button" onClick={confirmAssignment} disabled={processing} className="btn-dark">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : 'Confirm Assignment'}
          </button>
        </>
      }>
        <dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Selected freelancer</dt><dd className="font-mono text-xs">{shortenAddress(freelancerWallet, 8, 6)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Network</dt><dd className="font-bold">Arc Testnet</dd></div>
        </dl>
      </Modal>

      {/* Submit work confirmation modal */}
      <Modal open={modal === 'submit'} onClose={() => !processing && setModal(null)} title="Confirm work submission" description="The client will receive the deliverable links and notes for review. No gas fee required!" actions={
        <>
          <button type="button" onClick={() => setModal(null)} className="btn-secondary">Go Back</button>
          <button type="button" onClick={confirmSubmission} disabled={processing} className="btn-dark">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Submitting…</> : 'Submit Deliverables (Free)'}
          </button>
        </>
      }>
        <div className="space-y-3 text-sm">
          {submissionForm.repositoryUrl && (
            <div className="rounded-lg bg-slate-50 p-3">
              <span className="text-xs font-bold text-slate-500">Repository:</span>
              <p className="truncate font-mono text-xs text-slate-800">{submissionForm.repositoryUrl}</p>
            </div>
          )}
          {submissionForm.demoUrl && (
            <div className="rounded-lg bg-slate-50 p-3">
              <span className="text-xs font-bold text-slate-500">Live Demo:</span>
              <p className="truncate font-mono text-xs text-slate-800">{submissionForm.demoUrl}</p>
            </div>
          )}
          <div className="rounded-lg bg-mint-50/70 border border-mint-200/60 p-2.5 text-xs text-mint-800 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-mint-600 shrink-0" />
            <span>100% Free · Zero gas fee · Deliverables sent directly to client</span>
          </div>
        </div>
      </Modal>

      {/* Approve payment modal */}
      <Modal open={modal === 'approve'} onClose={() => !processing && setModal(null)} title="Approve and release payment?" description={`This will release ${formatUSDC(escrowAmount)} to the freelancer.`} actions={
        <>
          <button type="button" onClick={() => setModal(null)} className="btn-secondary">Review Again</button>
          <button type="button" onClick={confirmApproval} disabled={processing} className="btn-dark bg-mint-600 hover:bg-mint-700">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : 'Approve & Release Payment'}
          </button>
        </>
      }>
        <Alert variant="warning">An on-chain release cannot be reversed. Verify that the deliverables satisfy all requirements.</Alert>
      </Modal>

      {/* Request Changes modal */}
      <Modal
        open={modal === 'requestChanges'}
        onClose={() => !processing && setModal(null)}
        title="Request Revisions"
        description="Explain to the freelancer what changes are needed before you can approve payment."
        actions={
          <>
            <button type="button" onClick={() => setModal(null)} disabled={processing} className="btn-secondary">Cancel</button>
            <button type="button" onClick={confirmRequestChanges} disabled={processing} className="btn-dark bg-amber-600 hover:bg-amber-700">
              {processing ? <><LoaderCircle className="size-4 animate-spin" />Submitting…</> : 'Submit Revision Request'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Revision instructions &amp; feedback" htmlFor="revisionFeedback" required error={revisionFeedbackError}>
            {({ describedBy }) => (
              <textarea
                id="revisionFeedback"
                rows={5}
                value={revisionFeedback}
                onChange={(e) => setRevisionFeedback(e.target.value)}
                className={`field-input ${revisionFeedbackError ? 'field-input-error' : ''}`}
                placeholder="Detail specifically what is missing or needs improvement (e.g., 'The login flow works, but please add error boundaries and test coverage as agreed in the scope')."
                aria-describedby={describedBy}
                aria-invalid={Boolean(revisionFeedbackError)}
              />
            )}
          </FormField>
          <Alert variant="info">
            Requesting revisions resets the deliverable status, automatically extends the deadline on-chain by at least 3 days, and leaves funds safely locked in escrow.
          </Alert>
        </div>
      </Modal>

      {/* Auto-claim payment modal (Freelancer safety valve) */}
      <Modal
        open={modal === 'claimAuto'}
        onClose={() => !processing && setModal(null)}
        title="Claim Payment via Review Period Expiry"
        description="The 7-day client review period has passed without a response. You can now trigger an automatic release."
        actions={
          <>
            <button type="button" onClick={() => setModal(null)} disabled={processing} className="btn-secondary">Cancel</button>
            <button type="button" onClick={confirmAutoClaim} disabled={processing} className="btn-dark bg-emerald-600 hover:bg-emerald-700">
              {processing ? <><LoaderCircle className="size-4 animate-spin" />Claiming…</> : 'Confirm Claim'}
            </button>
          </>
        }
      >
        <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Amount</dt><dd className="font-bold">{formatUSDC(escrowAmount)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Smart contract safety valve</dt><dd className="font-bold text-emerald-700">Active (7+ days elapsed)</dd></div>
        </div>
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

      {/* Cancel unassigned job modal */}
      <Modal open={modal === 'cancel'} onClose={() => !processing && setModal(null)} title="Cancel this job?" description={`This will close the job and return ${formatUSDC(escrowAmount)} to your wallet.`} actions={
        <>
          <button type="button" onClick={() => setModal(null)} disabled={processing} className="btn-secondary">Go Back</button>
          <button type="button" onClick={confirmCancel} disabled={processing} className="btn-dark bg-red-600 hover:bg-red-700">
            {processing ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : 'Confirm Cancellation'}
          </button>
        </>
      }>
        <Alert variant="warning">
          <span className="inline-flex gap-2"><ShieldAlert className="size-4 shrink-0" />This is an on-chain transaction. Once confirmed, the job will be permanently closed and cannot be reopened.</span>
        </Alert>
      </Modal>
    </div>
  )
}
