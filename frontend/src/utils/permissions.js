export const sameAddress = (first, second) =>
  Boolean(first && second && first.toLowerCase() === second.toLowerCase())

// Support both backend snake_case and legacy camelCase field names
const getCreatorWallet = (job) => job?.creator_wallet || job?.creatorWallet
const getSelectedFreelancerWallet = (job) => job?.selected_freelancer_wallet || job?.selectedFreelancerWallet
export const getMarketplaceStatus = (job) => {
  const s = job?.marketplace_status || job?.marketplaceStatus || job?.status || ''
  return s.toLowerCase()
}
export const getEscrowStatus = (job) => {
  const s = job?.escrow_status || job?.escrowStatus || ''
  return s ? s.toLowerCase() : null
}
const getApplicationDeadline = (job) => job?.application_deadline || job?.applicationDeadline
const getDeliveryDeadline = (job) => job?.delivery_deadline || job?.deliveryDeadline

export const isJobCreator = (job, walletAddress) =>
  sameAddress(getCreatorWallet(job), walletAddress)

// For selected freelancer: backend stores selected_freelancer_wallet
export const isSelectedFreelancer = (job, walletAddress) =>
  sameAddress(getSelectedFreelancerWallet(job), walletAddress)


export const hasApplied = (job, walletAddress, applications = []) =>
  applications.some((app) => {
    const appJobId = app.job_id || app.jobId
    const appWallet = app.applicant_wallet || app.applicantWallet
    return String(appJobId) === String(job?.id) && sameAddress(appWallet, walletAddress)
  })

export const getWalletApplication = (job, walletAddress, applications = []) =>
  applications.find((app) => {
    const appJobId = app.job_id || app.jobId
    const appWallet = app.applicant_wallet || app.applicantWallet
    return String(appJobId) === String(job?.id) && sameAddress(appWallet, walletAddress)
  })

export const hasApplicationDeadlinePassed = (job) => {
  const deadline = getApplicationDeadline(job)
  if (!deadline) return false
  return new Date(deadline) < new Date()
}

// All jobs use open hiring — anyone can apply until the application deadline passes.
export const canApply = (job, walletAddress, applications = []) =>
  getMarketplaceStatus(job) === 'open' &&
  !hasApplicationDeadlinePassed(job) &&
  !isJobCreator(job, walletAddress) &&
  !hasApplied(job, walletAddress, applications)

// The creator can always review applications on their own jobs.
export const canReviewApplications = (job, walletAddress) =>
  isJobCreator(job, walletAddress)

export const canFundJob = (job, walletAddress) =>
  isJobCreator(job, walletAddress) &&
  getEscrowStatus(job) === null

export const canAssignOnChain = (job, walletAddress) =>
  isJobCreator(job, walletAddress) &&
  getEscrowStatus(job) === 'awaiting_freelancer' &&
  Boolean(getSelectedFreelancerWallet(job))

export const canSubmitWork = (job, walletAddress) =>
  isSelectedFreelancer(job, walletAddress) &&
  getEscrowStatus(job) === 'funded'

export const canApproveWork = (job, walletAddress) =>
  isJobCreator(job, walletAddress) && getEscrowStatus(job) === 'work_submitted'

export const canClaimRefund = (job, walletAddress) => {
  const deadline = getDeliveryDeadline(job)
  return isJobCreator(job, walletAddress) &&
    getEscrowStatus(job) === 'funded' &&
    getMarketplaceStatus(job) !== 'cancelled' &&
    Boolean(deadline) && new Date(deadline) < new Date()
}

// Client can cancel and reclaim escrow any time before a freelancer is assigned.
// No deadline check — only requires AwaitingFreelancer escrow status.
export const canCancelUnassignedJob = (job, walletAddress) =>
  isJobCreator(job, walletAddress) &&
  getEscrowStatus(job) === 'awaiting_freelancer' &&
  getMarketplaceStatus(job) !== 'cancelled'

// Frontend checks improve the interface only; the smart contract must enforce all financial permissions.

export const canCancelUnfundedJob = (job, walletAddress) =>
  isJobCreator(job, walletAddress) &&
  getEscrowStatus(job) === null &&
  (getMarketplaceStatus(job) === 'open' || getMarketplaceStatus(job) === 'reviewing_applications')
