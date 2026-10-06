import { api } from '../services/api'

export async function pollJobForEscrowStatus(jobId, expectedStatus, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const job = await api.getJob(jobId)
      const current = (job.escrow_status || job.escrowStatus || '').toLowerCase()
      if (expectedStatus === 'any') {
        if (current) return job
      } else if (current === expectedStatus.toLowerCase()) {
        return job
      }
    } catch {
      // ignore transient errors
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error(`Job ${jobId} did not reach escrow_status ${expectedStatus} in time.`)
}
