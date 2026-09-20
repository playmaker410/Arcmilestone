// Legacy mock blockchain stubs — replaced by src/services/blockchain.js
// Kept as empty stubs so any residual imports don't break the build.

export async function connectMockWallet() { return { success: false } }
export async function disconnectMockWallet() { return { success: false } }
export async function createAndFundMockJob() { return { success: false } }
export async function submitMockWork() { return { success: false } }
export async function approveMockPayment() { return { success: false } }
export async function requestMockRefund() { return { success: false } }
