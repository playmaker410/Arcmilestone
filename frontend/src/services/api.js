const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getToken() { return localStorage.getItem('arc-token') }
function setToken(t) { t ? localStorage.setItem('arc-token', t) : localStorage.removeItem('arc-token') }

// Paths that are part of the auth handshake — a 401 here is an auth failure
// (bad signature, expired nonce) not an expired session, so we must NOT fire
// arc-auth-expired or the UI shows "session expired" instead of the real error.
const AUTH_PATHS = ['/api/auth/nonce', '/api/auth/verify']

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401 && !AUTH_PATHS.includes(path)) {
    // A protected endpoint rejected our session token — treat as expiry.
    setToken(null)
    window.dispatchEvent(new Event('arc-auth-expired'))
    throw new Error('Session expired')
  }

  if (res.status === 204) return null

  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { fields: data.fields, status: res.status })
  return data
}

export const api = {
  // Auth
  nonce: (walletAddress) => request('/api/auth/nonce', { method: 'POST', body: JSON.stringify({ wallet_address: walletAddress }) }),
  verify: (walletAddress, nonce, signature) => request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ wallet_address: walletAddress, nonce, signature }) }),
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  // Users
  getMyProfile: () => request('/api/users/me'),
  updateMyProfile: (body) => request('/api/users/me', { method: 'PATCH', body: JSON.stringify(body) }),

  /**
   * Check whether a username is available before the user commits to it.
   * Sends a GET request with the candidate username as a query parameter.
   *
   * BACKEND REQUIRED:
   *   GET /api/users/check-username?username=<value>
   *   Response 200 → { available: true }
   *   Response 200 → { available: false }
   *   Response 400 → { error: "..." }  (invalid format)
   *
   * Until the backend endpoint exists this will throw — the modal catches
   * the error and shows an inline message so the UI stays functional.
   */
  checkUsername: (username) =>
    request(`/api/users/check-username?username=${encodeURIComponent(username)}`),

  /**
   * Persist the chosen username for the authenticated user.
   * Re-uses the existing PATCH /api/users/me endpoint.
   *
   * BACKEND REQUIRED:
   *   PATCH /api/users/me
   *   Body: { "username": "<value>" }
   *   The backend must enforce UNIQUE on the users.username column so that
   *   two simultaneous requests for the same name produce a clear 409 / error.
   *   The frontend availability check is a UX aid only — the DB is the
   *   final authority.
   */
  setUsername: (username) =>
    request('/api/users/me', { method: 'PATCH', body: JSON.stringify({ username }) }),

  // Jobs
  createJob: (body) => request('/api/jobs', { method: 'POST', body: JSON.stringify(body) }),
  listJobs: (mine = false) => request(mine ? '/api/jobs?mine=true' : '/api/jobs'),
  getJob: (id) => request(`/api/jobs/${id}`),
  updateJob: (id, body) => request(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  publishJob: (id) => request(`/api/jobs/${id}/publish`, { method: 'POST' }),
  cancelJob: (id) => request(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  deleteJob: (id) => request(`/api/jobs/${id}`, { method: 'DELETE' }),

  // Applications
  applyToJob: (jobId, body) => request(`/api/jobs/${jobId}/applications`, { method: 'POST', body: JSON.stringify(body) }),
  getJobApplications: (jobId) => request(`/api/jobs/${jobId}/applications`),
  getMyApplications: () => request('/api/applications/me'),
  acceptApplication: (jobId, appId) => request(`/api/jobs/${jobId}/applications/${appId}/accept`, { method: 'POST' }),
  rejectApplication: (jobId, appId) => request(`/api/jobs/${jobId}/applications/${appId}/reject`, { method: 'POST' }),
  withdrawApplication: (appId) => request(`/api/applications/${appId}/withdraw`, { method: 'POST' }),

  // Submissions
  createSubmission: (jobId, body) => request(`/api/jobs/${jobId}/submission`, { method: 'POST', body: JSON.stringify(body) }),
  getSubmission: (jobId) => request(`/api/jobs/${jobId}/submission`),

  getEscrow: (jobId) => request(`/api/jobs/${jobId}/escrow`),

  // Notifications
  getNotifications: () => request('/api/notifications'),
  getUnreadNotifications: () => request('/api/notifications/unread'),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),

  setToken,
  getToken,
}
