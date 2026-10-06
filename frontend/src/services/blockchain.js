import { createPublicClient, createWalletClient, custom, http, keccak256, parseUnits, formatUnits, toBytes } from 'viem'

const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || '5042002')
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS

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
        ],
      },
    ],
  },
]

function getWalletClient() {
  if (!window.ethereum) throw new Error('No wallet extension found. Please install MetaMask or a compatible wallet.')
  return createWalletClient({ chain: arcTestnet, transport: custom(window.ethereum) })
}

function getPublicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http() })
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
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured. Set VITE_CONTRACT_ADDRESS.')

  const walletClient = getWalletClient()
  const publicClient = getPublicClient()

  const deadlineUnix = BigInt(Math.floor(new Date(deliveryDeadlineISO).getTime() / 1000))
  const metadataHash = keccak256(toBytes(metadataHashInput))
  const value = budgetToWei(budgetString)

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ARC_MILESTONE_ABI,
    functionName: 'createAndFundJobOpen',
    args: [deadlineUnix, metadataHash],
    value,
    account: clientAddress,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })

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


// assignFreelancer: called after the client selects an applicant off-chain.
// Moves the on-chain job from AwaitingFreelancer → Funded.
export async function assignFreelancerOnChain({ blockchainJobId, freelancerAddress, clientAddress }) {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured.')

  const walletClient = getWalletClient()
  const publicClient = getPublicClient()

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ARC_MILESTONE_ABI,
    functionName: 'assignFreelancer',
    args: [BigInt(blockchainJobId), freelancerAddress],
    account: clientAddress,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return { transactionHash: hash, receipt }
}


// submitWork: records deliverable hash on-chain
// submissionUrl is used to derive the deliverableHash bytes32
export async function submitWorkOnChain({ blockchainJobId, submissionUrl, freelancerAddress }) {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured.')

  const walletClient = getWalletClient()
  const publicClient = getPublicClient()

  const deliverableHash = keccak256(toBytes(submissionUrl))
  const jobIdBigInt = BigInt(blockchainJobId)

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ARC_MILESTONE_ABI,
    functionName: 'submitWork',
    args: [jobIdBigInt, deliverableHash],
    account: freelancerAddress,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return { transactionHash: hash, deliverableHash, receipt }
}

// approveAndRelease: client approves and releases payment
export async function approveAndReleasePayment({ blockchainJobId, clientAddress }) {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured.')

  const walletClient = getWalletClient()
  const publicClient = getPublicClient()

  const jobIdBigInt = BigInt(blockchainJobId)

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ARC_MILESTONE_ABI,
    functionName: 'approveAndRelease',
    args: [jobIdBigInt],
    account: clientAddress,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return { transactionHash: hash, receipt }
}

// refundExpiredJob: client requests refund after deadline
export async function refundExpiredJobOnChain({ blockchainJobId, clientAddress }) {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured.')

  const walletClient = getWalletClient()
  const publicClient = getPublicClient()

  const jobIdBigInt = BigInt(blockchainJobId)

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ARC_MILESTONE_ABI,
    functionName: 'refundExpiredJob',
    args: [jobIdBigInt],
    account: clientAddress,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return { transactionHash: hash, receipt }
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
