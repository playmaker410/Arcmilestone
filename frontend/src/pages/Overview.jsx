import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  FileUser,
  LockKeyhole,
  Plus,
  Send,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../components/Alert'
import JobStatusBadge from '../components/JobStatusBadge'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { formatDate, formatUSDC, shortenAddress } from '../utils/format'
import {
  getEscrowStatus,
  getMarketplaceStatus,
  isJobCreator,
  isSelectedFreelancer,
} from '../utils/permissions'

export default function Overview() {
  const {
    user,
    wallet,
    walletAddress,
    isWalletConnected,
    connectWallet,
    applications,
    loadApplications,
  } = useApp()

  const [postedJobs, setPostedJobs] = useState([])
  const [freelancerJobs, setFreelancerJobs] = useState([])

  useEffect(() => {
    if (!isWalletConnected) return

    api.listJobs(true)
      .then((data) => setPostedJobs(data.jobs || []))
      .catch(() => {})

    loadApplications()
  }, [isWalletConnected, loadApplications])

  useEffect(() => {
    const acceptedApps = applications.filter((app) => app.status === 'accepted')
    if (!acceptedApps.length) { setFreelancerJobs([]); return }

    Promise.all(
      acceptedApps.map((app) => api.getJob(app.job_id || app.jobId).catch(() => null))
    ).then((results) => setFreelancerJobs(results.filter(Boolean)))
  }, [applications])

  const addr = walletAddress || wallet?.address
  const posted = postedJobs
  const working = freelancerJobs.filter(
    (job) => !posted.some((p) => String(p.id) === String(job.id))
  )
  const myApplications = applications
  const received = applications.filter((app) =>
    posted.some((job) => String(job.id) === String(app.job_id || app.jobId))
  )

  const LOCKED_ESCROW_STATUSES = ['awaiting_freelancer', 'funded', 'work_submitted']
  const locked = posted
    .filter((job) => LOCKED_ESCROW_STATUSES.includes(getEscrowStatus(job)))
    .reduce((sum, job) => sum + Number(job.budget || 0), 0)

  const awaitingApproval = posted
    .filter((job) => getEscrowStatus(job) === 'work_submitted')
    .reduce((sum, job) => sum + Number(job.budget || 0), 0)

  const allMyJobs = [...posted, ...working]
  const completed = allMyJobs.filter(
    (job) =>
      getMarketplaceStatus(job) === 'completed' &&
      (isJobCreator(job, addr) || isSelectedFreelancer(job, addr))
  ).length

  const recentJobs = allMyJobs.slice(0, 5)

  const hasUsername = !!user?.username
  const greetingName = hasUsername
    ? user.username
    : wallet.displayName && wallet.displayName !== 'Not connected'
      ? wallet.displayName.split(' ')[0]
      : 'there'

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${greetingName}`}
        description="Your role is determined per job — this dashboard follows your connected wallet."
        actions={
          isWalletConnected && addr ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
              <span className="size-2 rounded-full bg-mint-400" />
              {shortenAddress(addr, 6, 4)}
            </span>
          ) : null
        }
      />

      {!isWalletConnected && (
        <div className="mb-6">
          <Alert variant="warning" title="Wallet disconnected">
            Reconnect to access your account.{' '}
            <button type="button" onClick={connectWallet} className="ml-1 font-bold underline">
              Connect now
            </button>
          </Alert>
        </div>
      )}

      {/* Primary stats */}
      <section aria-label="Activity at a glance" className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Jobs I posted"
          value={posted.filter((job) => !['completed', 'cancelled'].includes(getMarketplaceStatus(job))).length}
          helper={`${received.length} application${received.length !== 1 ? 's' : ''} received`}
          icon={BriefcaseBusiness}
          tone="mint"
        />
        <StatCard
          label="Pending applications"
          value={myApplications.filter((app) => app.status === 'pending').length}
          helper={`${myApplications.length} total submitted`}
          icon={FileUser}
          tone="cyan"
        />
        <StatCard
          label="Jobs I'm working on"
          value={working.filter((job) => getMarketplaceStatus(job) !== 'completed').length}
          icon={Users}
          tone="amber"
        />
        <StatCard
          label="Completed jobs"
          value={completed}
          helper="As client or freelancer"
          icon={CheckCircle2}
          tone="violet"
        />
      </section>

      {/* Escrow stats */}
      <section aria-label="Escrow overview" className="mt-4 stagger grid gap-4 sm:grid-cols-3">
        <StatCard
          label="USDC locked in escrow"
          value={formatUSDC(locked)}
          helper="Active jobs you created"
          icon={LockKeyhole}
          tone="cyan"
        />
        <StatCard
          label="Awaiting your approval"
          value={formatUSDC(awaitingApproval)}
          helper="Submitted work pending review"
          icon={CircleDollarSign}
          tone="amber"
        />
        <StatCard
          label="Applications received"
          value={received.length}
          helper="Across all your posted jobs"
          icon={Send}
          tone="mint"
        />
      </section>

      {/* Recent jobs + Quick actions */}
      <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_.5fr]">
        {/* Recent jobs table */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-display text-base font-bold text-ink-950">Recent jobs</h2>
              <p className="mt-0.5 text-xs text-slate-400">Jobs connected to this wallet</p>
            </div>
            <Link
              to="/jobs"
              className="inline-flex items-center gap-1 text-sm font-bold text-mint-600 hover:text-mint-700 transition-colors"
            >
              View all <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {recentJobs.length ? (
            <div className="divide-y divide-slate-100">
              {recentJobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="group flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 group-hover:text-mint-700 transition-colors">
                      {job.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Due {formatDate(job.delivery_deadline || job.deliveryDeadline)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <JobStatusBadge status={getMarketplaceStatus(job)} compact />
                    <p className="text-sm font-bold text-slate-800">{formatUSDC(job.budget)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-6 py-8 text-sm text-slate-400">
              No jobs linked to this wallet yet.
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="card p-5 sm:p-6">
          <h2 className="font-display text-base font-bold text-ink-950">Quick actions</h2>
          <p className="mt-0.5 text-xs text-slate-400">Move your work forward</p>
          <div className="mt-5 grid gap-3">
            <Link to="/explore" className="btn-dark justify-between">
              Explore Jobs <ArrowRight className="size-4" />
            </Link>
            <Link to="/jobs/create" className="btn-secondary justify-between">
              Post a Job <Plus className="size-4" />
            </Link>
            <Link to="/applications" className="btn-secondary justify-between">
              My Applications <FileUser className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
