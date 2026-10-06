import { ArrowRight, BriefcaseBusiness, CheckCircle2, CircleDollarSign, FileUser, LockKeyhole, Plus, Send, Users } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../components/Alert'
import JobStatusBadge from '../components/JobStatusBadge'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import WalletBadge from '../components/WalletBadge'
import useApp from '../hooks/useApp'
import { formatDate, formatUSDC } from '../utils/format'
import { isJobCreator, isSelectedFreelancer } from '../utils/permissions'

export default function Overview() {
  const { user, wallet, walletAddress, isWalletConnected, connectWallet, jobs, applications, loadJobs, loadApplications } = useApp()

  useEffect(() => {
    if (isWalletConnected) {
      loadJobs(true)
      loadApplications()
    }
  }, [isWalletConnected, loadJobs, loadApplications])

  const addr = walletAddress || wallet.address

  const posted = jobs.filter((job) => isJobCreator(job, addr))
  const working = jobs.filter((job) => isSelectedFreelancer(job, addr))
  const myApplications = applications
  const received = applications.filter((app) => posted.some((job) => String(job.id) === String(app.job_id || app.jobId)))

  const getEscrowStatus = (job) => {
    const s = job?.escrow_status || job?.escrowStatus || ''
    return s ? s.toLowerCase() : null
  }
  const getMarketplaceStatus = (job) => {
    const s = job?.marketplace_status || job?.marketplaceStatus || ''
    return s.toLowerCase()
  }

  const locked = posted
    .filter((job) => ['funded', 'work_submitted'].includes(getEscrowStatus(job)))
    .reduce((sum, job) => sum + Number(job.budget || 0), 0)

  const awaitingApproval = posted
    .filter((job) => getEscrowStatus(job) === 'work_submitted')
    .reduce((sum, job) => sum + Number(job.budget || 0), 0)

  const completed = jobs
    .filter((job) =>
      getMarketplaceStatus(job) === 'completed' &&
      (isJobCreator(job, addr) || isSelectedFreelancer(job, addr))
    ).length

  const recentJobs = [...posted, ...working.filter((job) => !posted.some((item) => String(item.id) === String(job.id)))].slice(0, 4)

  /**
   * Greeting resolution:
   *   • If the user has set a username, greet them with "@username" — this
   *     reinforces the handle they chose and matches what others see.
   *   • Otherwise fall back to the first word of wallet.displayName (the
   *     shortened address) with a generic "Welcome back, there" safety net.
   *
   * We read user.username directly rather than parsing wallet.displayName to
   * keep the logic explicit and independent of the display-name fallback chain.
   */
  const hasUsername = !!user?.username
  const greetingName = hasUsername
    ? `@${user.username}`
    : (wallet.displayName && wallet.displayName !== 'Not connected'
        ? wallet.displayName.split(' ')[0]
        : 'there')

  return (
    <>
      <PageHeader
        eyebrow="Wallet overview"
        title={`Welcome back, ${greetingName}`}
        description="Your role changes by job. This overview follows your connected wallet."
        actions={<WalletBadge address={addr} label={wallet.network} />}
      />
      {!isWalletConnected && (
        <div className="mb-6">
          <Alert variant="warning" title="Wallet disconnected">
            Reconnect to access your account.{' '}
            <button type="button" onClick={connectWallet} className="ml-1 font-bold underline">Connect now</button>
          </Alert>
        </div>
      )}
      <section aria-label="Wallet job statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open jobs posted by me" value={posted.filter((job) => getMarketplaceStatus(job) === 'open').length} helper={`${received.length} applications received`} icon={BriefcaseBusiness} tone="mint" />
        <StatCard label="My pending applications" value={myApplications.filter((app) => app.status === 'pending').length} helper={`${myApplications.length} total applications`} icon={FileUser} tone="cyan" />
        <StatCard label="Jobs I am working on" value={working.filter((job) => getMarketplaceStatus(job) !== 'completed').length} helper="Selected or directly assigned" icon={Users} tone="amber" />
        <StatCard label="Completed jobs" value={completed} helper="As client or freelancer" icon={CheckCircle2} tone="violet" />
      </section>
      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="USDC locked in jobs I created" value={formatUSDC(locked)} helper="Funded escrow only" icon={LockKeyhole} tone="cyan" />
        <StatCard label="USDC awaiting my approval" value={formatUSDC(awaitingApproval)} helper="Submitted work awaiting review" icon={CircleDollarSign} tone="amber" />
        <StatCard label="Applications received" value={received.length} helper="Across jobs posted by this wallet" icon={Send} tone="mint" />
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.55fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-display text-lg font-bold text-ink-950">Recent jobs</h2>
              <p className="mt-1 text-xs text-slate-500">Jobs connected to this wallet</p>
            </div>
            <Link to="/jobs" className="inline-flex items-center gap-1 text-sm font-bold text-mint-600">View all <ArrowRight className="size-4" /></Link>
          </div>
          {recentJobs.length ? (
            <div className="divide-y divide-slate-100">
              {recentJobs.map((job) => (
                <Link key={job.id} to={`/jobs/${job.id}`} className="flex flex-col gap-3 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{job.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Open for Applications · Due {formatDate(job.delivery_deadline || job.deliveryDeadline)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <JobStatusBadge status={job.marketplace_status || job.marketplaceStatus} compact />
                    <p className="min-w-24 text-right text-sm font-bold">{formatUSDC(job.budget)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-6 text-sm text-slate-500">No jobs are linked to this wallet yet.</p>
          )}
        </div>
        <div className="card p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-ink-950">Quick actions</h2>
          <p className="mt-1 text-xs text-slate-500">Move work forward</p>
          <div className="mt-5 grid gap-3">
            <Link to="/explore" className="btn-dark justify-between">Explore Jobs <ArrowRight className="size-4" /></Link>
            <Link to="/jobs/create" className="btn-secondary justify-between">Create a Job <Plus className="size-4" /></Link>
            <Link to="/applications" className="btn-secondary justify-between">My Applications <FileUser className="size-4" /></Link>
          </div>
        </div>
      </section>
    </>
  )
}
