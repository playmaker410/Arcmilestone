const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getToken() { return localStorage.getItem('arc-token') }
function setToken(t) { t ? localStorage.setItem('arc-token', t) : localStorage.removeItem('arc-token') }

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
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

  // Jobs
  createJob: (body) => request('/api/jobs', { method: 'POST', body: JSON.stringify(body) }),
  listJobs: (mine = false) => request(mine ? '/api/jobs?mine=true' : '/api/jobs'),
  getJob: (id) => request(`/api/jobs/${id}`),
  updateJob: (id, body) => request(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  publishJob: (id) => request(`/api/jobs/${id}/publish`, { method: 'POST' }),
  cancelJob: (id) => request(`/api/jobs/${id}/cancel`, { method: 'POST' }),

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

  // Notifications
  getNotifications: () => request('/api/notifications'),
  getUnreadNotifications: () => request('/api/notifications/unread'),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),

  setToken,
  getToken,
}
