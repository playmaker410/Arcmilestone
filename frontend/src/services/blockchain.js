import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, custom, http, keccak256, parseUnits, formatUnits, toBytes } from 'viem'

const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || '5042002')
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS

// The contract new jobs are funded on. Existing jobs keep using the contract
// recorded in their escrow row (job.escrow_contract_address).
export const CURRENT_CONTRACT_ADDRESS = CONTRACT_ADDRESS

const arcTestnet = {
  id: CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc USD', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_ARC_RPC_URL || 'https://rpc.testnet.arc.io'] } },
}

// ABI — only the functions the frontend needs
const ARC_MILESTONE_ABI = [

  {
    // Open-hire variant: locks funds without a freelancer address.
    // Call assignFreelancer after selecting from applications.
    name: 'createAndFundJobOpen',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'metadataHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
  },
  {
    // Assign the selected freelancer to an AwaitingFreelancer job.
    name: 'assignFreelancer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'freelancer', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'submitWork',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'deliverableHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'approveAndRelease',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'refundExpiredJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
  },
  {
    // Cancel an unassigned job at any time and reclaim the escrow.
    // Only works while the job is still in AwaitingFreelancer status.
    name: 'cancelUnassignedJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
  },
  {
    // Client asks for changes on submitted work. WorkSubmitted → Funded and
    // the deadline is extended to max(deadline, now + REVISION_WINDOW).
    name: 'requestRevision',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
  },
  {
    // Freelancer safety valve: claim payment if the client has not reviewed
    // the submission within REVIEW_PERIOD.
    name: 'claimPaymentAfterReview',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
  },
  { name: 'REVIEW_PERIOD', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'REVISION_WINDOW', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'RevisionRequested',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'newDeadline', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'getJob',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'client', type: 'address' },
          { name: 'freelancer', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'metadataHash', type: 'bytes32' },
          { name: 'deliverableHash', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
          { name: 'submittedAt', type: 'uint256' },
        ],
      },
    ],
  },
  // Custom errors — lets viem decode reverts into readable messages.
  { type: 'error', name: 'ZeroFreelancerAddress', inputs: [] },
  { type: 'error', name: 'ClientCannotBeFreelancer', inputs: [{ name: 'client', type: 'address' }] },
  { type: 'error', name: 'ZeroPayment', inputs: [] },
  { type: 'error', name: 'InvalidDeadline', inputs: [{ name: 'providedDeadline', type: 'uint256' }, { name: 'currentTimestamp', type: 'uint256' }] },
  { type: 'error', name: 'EmptyMetadataHash', inputs: [] },
  { type: 'error', name: 'EmptyDeliverableHash', inputs: [] },
  { type: 'error', name: 'JobNotFound', inputs: [{ name: 'jobId', type: 'uint256' }] },
  { type: 'error', name: 'CallerIsNotClient', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'caller', type: 'address' }] },
  { type: 'error', name: 'CallerIsNotFreelancer', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'caller', type: 'address' }] },
  { type: 'error', name: 'WrongJobStatus', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'currentStatus', type: 'uint8' }, { name: 'requiredStatus', type: 'uint8' }] },
  { type: 'error', name: 'SubmissionDeadlinePassed', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'currentTimestamp', type: 'uint256' }] },
  { type: 'error', name: 'RefundNotYetAvailable', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'currentTimestamp', type: 'uint256' }] },
  { type: 'error', name: 'PaymentTransferFailed', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  { type: 'error', name: 'FreelancerAlreadyAssigned', inputs: [{ name: 'jobId', type: 'uint256' }] },
  { type: 'error', name: 'JobNotAwaitingFreelancer', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'currentStatus', type: 'uint8' }] },
  { type: 'error', name: 'ReviewPeriodNotOver', inputs: [{ name: 'jobId', type: 'uint256' }, { name: 'claimableAt', type: 'uint256' }, { name: 'currentTimestamp', type: 'uint256' }] },
]

const ONCHAIN_STATUS = ['Awaiting freelancer', 'Funded', 'Work submitted', 'Completed', 'Refunded']
const fmtTs = (ts) => new Date(Number(ts) * 1000).toLocaleString()

// Turn a simulation/revert error into a message a user can act on.
function describeContractError(err, contractAddress) {
  const reverted = err instanceof BaseError
    ? err.walk((e) => e instanceof ContractFunctionRevertedError)
    : null
  const name = reverted?.data?.errorName
  const a = reverted?.data?.args || []
  switch (name) {
    case 'JobNotFound':
      return `On-chain job #${a[0]} does not exist on escrow contract ${contractAddress}. The job was funded on a different contract deployment.`
    case 'WrongJobStatus':
      return `The on-chain escrow is in "${ONCHAIN_STATUS[a[1]] ?? a[1]}" state, but this action requires "${ONCHAIN_STATUS[a[2]] ?? a[2]}".`
    case 'JobNotAwaitingFreelancer':
      return `A freelancer can only be assigned while the escrow is awaiting one (current: "${ONCHAIN_STATUS[a[1]] ?? a[1]}").`
    case 'CallerIsNotClient':
      return `Only the wallet that funded this job can do this. MetaMask is using ${a[1]}.`
    case 'CallerIsNotFreelancer':
      return `Only the assigned freelancer wallet can do this. MetaMask is using ${a[1]}.`
    case 'RefundNotYetAvailable':
      return `Refund is available only after the delivery deadline (${fmtTs(a[1])}).`
    case 'SubmissionDeadlinePassed':
      return `The delivery deadline (${fmtTs(a[1])}) has passed.`
    case 'ReviewPeriodNotOver':
      return `Payment can be claimed after ${fmtTs(a[1])}.`
    case 'FreelancerAlreadyAssigned':
      return 'A freelancer is already assigned to this escrow.'
    case 'ClientCannotBeFreelancer':
      return 'The client wallet cannot be assigned as the freelancer.'
    case 'PaymentTransferFailed':
      return 'The payment transfer to the recipient failed.'
    default:
      if (name) return `Contract rejected the transaction: ${name}`
      return err?.shortMessage || err?.message || 'Transaction failed.'
  }
}

// Shared write path for every contract call:
// 1. simulate first, so a doomed transaction is caught with a readable reason
//    BEFORE MetaMask opens and no gas is wasted;
// 2. send;
// 3. treat a reverted receipt as a failure (viem does not throw on revert).
async function sendContractTx({ contractAddress, functionName, args, account, value }) {
  const address = contractAddress || CONTRACT_ADDRESS
  if (!address) throw new Error('Contract address not configured. Set VITE_CONTRACT_ADDRESS.')

  const walletClient = getWalletClient()
  const publicClient = getPublicClient()
  await ensureArcChain(walletClient)

  try {
    await publicClient.simulateContract({ address, abi: ARC_MILESTONE_ABI, functionName, args, account, value })
  } catch (err) {
    throw new Error(describeContractError(err, address))
  }

  const hash = await walletClient.writeContract({ address, abi: ARC_MILESTONE_ABI, functionName, args, account, value })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(`Transaction ${hash} reverted on-chain. No funds were moved.`)
  }
  return { transactionHash: hash, receipt, contractAddress: address }
}

function getWalletClient() {
  if (!window.ethereum) throw new Error('No wallet extension found. Please install MetaMask or a compatible wallet.')
  return createWalletClient({ chain: arcTestnet, transport: custom(window.ethereum) })
}

function getPublicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http() })
}

// Make sure the wallet is on Arc Testnet before writing; add the chain if unknown.
async function ensureArcChain(walletClient) {
  try {
    const current = await walletClient.getChainId()
    if (current === arcTestnet.id) return
    await walletClient.switchChain({ id: arcTestnet.id })
  } catch (err) {
    if (err?.code === 4902 || /unrecognized|not been added|unknown chain/i.test(err?.message || '')) {
      await walletClient.addChain({ chain: arcTestnet })
      return
    }
    throw err
  }
}

// Get connected accounts from wallet
export async function getAccounts() {
  const walletClient = getWalletClient()
  const accounts = await walletClient.requestAddresses()
  return accounts
}

// Sign a personal message (EIP-191) for authentication
// Sign a personal message (EIP-191) for authentication
export async function signMessage(address, message) {
  if (!window.ethereum) throw new Error('No wallet extension found. Please install MetaMask or a compatible wallet.')
  
  // Create a chain-agnostic client (no 'chain' parameter) specifically for signing.
  // This prevents viem from throwing a ChainMismatchError if the user is on Mainnet.
  const authClient = createWalletClient({ transport: custom(window.ethereum) })
  
  const signature = await authClient.signMessage({ account: address, message })
  return signature
}

// Get the native Arc balance of an address in wei (bigint)
export async function getWalletBalance(address) {
  const publicClient = getPublicClient()
  return publicClient.getBalance({ address })
}

// Convert a budget string (decimal USDC, e.g. "125.5") to wei bigint
export function budgetToWei(budgetString) {
  const clean = budgetString.trim()
  return parseUnits(clean, 18)
}

// Convert wei bigint to display string
export function weiToDisplay(wei) {
  return formatUnits(wei, 18)
}

// createAndFundJobOpen: locks funds at job creation without a freelancer.
// Used in the new open-hire flow. assignFreelancer is called later.
// Returns: { transactionHash, blockchainJobId }
export async function createAndFundJobOpen({ deliveryDeadlineISO, metadataHashInput, budgetString, clientAddress }) {
  const deadlineUnix = BigInt(Math.floor(new Date(deliveryDeadlineISO).getTime() / 1000))
  const metadataHash = keccak256(toBytes(metadataHashInput))
  const value = budgetToWei(budgetString)

  // New jobs are always funded on the current contract.
  const { transactionHash: hash, receipt } = await sendContractTx({
    contractAddress: CONTRACT_ADDRESS,
    functionName: 'createAndFundJobOpen',
    args: [deadlineUnix, metadataHash],
    value,
    account: clientAddress,
  })

  // Extract jobId from logs — JobCreatedAndFundedOpen event signature hash
  const eventSignature = keccak256(toBytes('JobCreatedAndFundedOpen(uint256,address,uint256,uint256,bytes32)'))
  let blockchainJobId = null
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
      if (log.topics[0] === eventSignature && log.topics[1]) {
        blockchainJobId = BigInt(log.topics[1]).toString()
      }
      break
    }
  }

  return { transactionHash: hash, blockchainJobId, receipt }
}

export const fundOpenJobOnChain = createAndFundJobOpen


// All job-level functions below accept `contractAddress`: the escrow contract
// the job was actually funded on (job.escrow_contract_address). It falls back
// to the current contract for jobs without a recorded address.

// assignFreelancer: called after the client selects an applicant off-chain.
// Moves the on-chain job from AwaitingFreelancer → Funded.
export async function assignFreelancerOnChain({ blockchainJobId, freelancerAddress, clientAddress, contractAddress }) {
  return sendContractTx({
    contractAddress,
    functionName: 'assignFreelancer',
    args: [BigInt(blockchainJobId), freelancerAddress],
    account: clientAddress,
  })
}

// submitWork: records deliverable hash on-chain.
// The hash commits to both delivery links: keccak256(`${repository_url}|${demo_url}`).
// `submissionUrl` is still accepted for backward compatibility.
export async function submitWorkOnChain({ blockchainJobId, repositoryUrl, demoUrl, submissionUrl, freelancerAddress, contractAddress }) {
  const hashInput = repositoryUrl !== undefined || demoUrl !== undefined
    ? `${repositoryUrl || ''}|${demoUrl || ''}`
    : submissionUrl
  const deliverableHash = keccak256(toBytes(hashInput))
  const result = await sendContractTx({
    contractAddress,
    functionName: 'submitWork',
    args: [BigInt(blockchainJobId), deliverableHash],
    account: freelancerAddress,
  })
  return { ...result, deliverableHash }
}

// requestRevision: client sends submitted work back for changes (WorkSubmitted/Funded → Funded).
export async function requestRevisionOnChain({ blockchainJobId, clientAddress, contractAddress }) {
  return sendContractTx({
    contractAddress,
    functionName: 'requestRevision',
    args: [BigInt(blockchainJobId)],
    account: clientAddress,
  })
}

// claimPaymentAfterReview: freelancer claims payment after the review period lapsed.
export async function claimPaymentAfterReviewOnChain({ blockchainJobId, freelancerAddress, contractAddress }) {
  return sendContractTx({
    contractAddress,
    functionName: 'claimPaymentAfterReview',
    args: [BigInt(blockchainJobId)],
    account: freelancerAddress,
  })
}

// approveAndRelease: client approves and releases payment
export async function approveAndReleasePayment({ blockchainJobId, clientAddress, contractAddress }) {
  return sendContractTx({
    contractAddress,
    functionName: 'approveAndRelease',
    args: [BigInt(blockchainJobId)],
    account: clientAddress,
  })
}

// cancelUnassignedJob: client cancels a job that has no freelancer yet, reclaims escrow immediately
export async function cancelUnassignedJobOnChain({ blockchainJobId, clientAddress, contractAddress }) {
  return sendContractTx({
    contractAddress,
    functionName: 'cancelUnassignedJob',
    args: [BigInt(blockchainJobId)],
    account: clientAddress,
  })
}

// refundExpiredJob: client requests refund after deadline
export async function refundExpiredJobOnChain({ blockchainJobId, clientAddress, contractAddress }) {
  return sendContractTx({
    contractAddress,
    functionName: 'refundExpiredJob',
    args: [BigInt(blockchainJobId)],
    account: clientAddress,
  })
}


// Check if an address has enough native balance to cover a given USDC amount.
// Throws if the RPC call fails — callers should treat that as "cannot verify"
// and NOT proceed to create anything, rather than silently skipping the check.
export async function checkSufficientBalance(address, budgetString) {
  const required = budgetToWei(budgetString)
  const balance = await getWalletBalance(address)
  return {
    sufficient: balance >= required,
    balance,
    required,
  }
}

export { keccak256, toBytes, parseUnits, formatUnits }
