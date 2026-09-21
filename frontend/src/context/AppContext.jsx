import { useCallback, useEffect, useState } from 'react'
import AppContext from './app-context'
import { api } from '../services/api'
import { getAccounts, signMessage } from '../services/blockchain'
import { shortenAddress } from '../utils/format'

export default function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [walletAddress, setWalletAddress] = useState('')
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [isWalletBusy, setIsWalletBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(!!api.getToken())

  const [jobs, setJobs] = useState([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState('')

  const [applications, setApplications] = useState([])
  const [applicationsLoading, setApplicationsLoading] = useState(false)

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Restore session on mount
  useEffect(() => {
    const token = api.getToken()
    if (!token) { setAuthLoading(false); return }
    api.me()
      .then((data) => {
        setUser(data)
        setWalletAddress(data.wallet_address)
        setIsWalletConnected(true)
      })
      .catch(() => {
        api.setToken(null)
      })
      .finally(() => setAuthLoading(false))
  }, [])

  // Listen for session expiry (401 from any API call)
  useEffect(() => {
    const handler = () => {
      setUser(null)
      setWalletAddress('')
      setIsWalletConnected(false)
      setAuthError('Your session expired. Please reconnect your wallet.')
    }
    window.addEventListener('arc-auth-expired', handler)
    return () => window.removeEventListener('arc-auth-expired', handler)
  }, [])

  const connectWallet = useCallback(async (onSuccess) => {
    setIsWalletBusy(true)
    setAuthError('')
    try {
      // 1. Get wallet address from browser extension
      let accounts
      try {
        accounts = await getAccounts()
      } catch (err) {
        throw new Error('Could not access wallet. Make sure MetaMask is unlocked and try again.')
      }
      if (!accounts || accounts.length === 0) throw new Error('No accounts found in wallet.')
      const address = accounts[0].toLowerCase()

      // 2. Get nonce from backend
      let nonce
      try {
        const result = await api.nonce(address)
        nonce = result.nonce
      } catch (err) {
        throw new Error(`Could not get sign-in challenge: ${err.message}`)
      }

      // 3. Sign the nonce with the wallet
      let signature
      try {
        signature = await signMessage(address, nonce)
      } catch (err) {
        // User rejected the prompt or wallet error
        if (err.message?.toLowerCase().includes('reject') || err.message?.toLowerCase().includes('denied') || err.code === 4001) {
          throw new Error('Signature request was rejected. Please approve the sign-in prompt in MetaMask.')
        }
        throw new Error(`Wallet signing failed: ${err.message || 'unknown error'}`)
      }

      // 4. Verify signature with backend, receive token
      let token, backendUser
      try {
        const result = await api.verify(address, nonce, signature)
        token = result.token
        backendUser = result.user
      } catch (err) {
        throw new Error(`Sign-in verification failed: ${err.message}`)
      }

      api.setToken(token)

      // 5. Set auth state
      setUser(backendUser)
      setWalletAddress(address)
      setIsWalletConnected(true)

      // 6. Navigate to dashboard if a callback was provided
      if (typeof onSuccess === 'function') onSuccess()
    } catch (err) {
      setAuthError(err.message || 'Failed to connect wallet.')
    } finally {
      setIsWalletBusy(false)
    }
  }, [])

  const disconnectWallet = useCallback(async () => {
    setIsWalletBusy(true)
    try {
      await api.logout().catch(() => { }) // ignore errors on logout
    } finally {
      api.setToken(null)
      setUser(null)
      setWalletAddress('')
      setIsWalletConnected(false)
      setJobs([])
      setApplications([])
      setNotifications([])
      setUnreadCount(0)
      setIsWalletBusy(false)
    }
  }, [])

  // ---- Jobs ----
  const loadJobs = useCallback(async (mine = false) => {
    setJobsLoading(true)
    setJobsError('')
    try {
      const data = await api.listJobs(mine)
      setJobs(data.jobs || [])
    } catch (err) {
      setJobsError(err.message)
    } finally {
      setJobsLoading(false)
    }
  }, [])

  const loadOpenJobs = useCallback(async () => {
    setJobsLoading(true)
    setJobsError('')
    try {
      const data = await api.listJobs(false)
      setJobs(data.jobs || [])
    } catch (err) {
      setJobsError(err.message)
    } finally {
      setJobsLoading(false)
    }
  }, [])

  const refreshJob = useCallback(async (id) => {
    try {
      const job = await api.getJob(id)
      setJobs((prev) => {
        const idx = prev.findIndex((j) => String(j.id) === String(id))
        if (idx === -1) return [job, ...prev]
        const next = [...prev]
        next[idx] = job
        return next
      })
      return job
    } catch (err) {
      // ignore
    }
  }, [])

  const addJob = useCallback((job) => {
    setJobs((prev) => [job, ...prev])
  }, [])

  const updateJob = useCallback((jobId, updates) => {
    setJobs((prev) => prev.map((j) => (String(j.id) === String(jobId) ? { ...j, ...updates } : j)))
  }, [])

  // ---- Applications ----
  const loadApplications = useCallback(async () => {
    setApplicationsLoading(true)
    try {
      const data = await api.getMyApplications()
      setApplications(data.applications || [])
    } catch (err) {
      // ignore
    } finally {
      setApplicationsLoading(false)
    }
  }, [])

  const addApplication = useCallback((application) => {
    setApplications((prev) => [application, ...prev])
  }, [])

  const updateApplication = useCallback((appId, updates) => {
    setApplications((prev) => prev.map((a) => (String(a.id) === String(appId) ? { ...a, ...updates } : a)))
  }, [])

  // acceptApplication is now done via API in ReviewApplications — just expose a local update helper
  const acceptApplication = useCallback((applicationId) => {
    setApplications((prev) => prev.map((a) => {
      if (String(a.id) === String(applicationId)) return { ...a, status: 'accepted' }
      return a
    }))
  }, [])

  // ---- Notifications ----
  const loadNotifications = useCallback(async () => {
    try {
      const data = await api.getNotifications()
      setNotifications(data.notifications || [])
    } catch (err) {
      // ignore
    }
  }, [])

  const loadUnreadCount = useCallback(async () => {
    try {
      const data = await api.getUnreadNotifications()
      setUnreadCount((data.notifications || []).length)
    } catch (err) {
      // ignore
    }
  }, [])

  const markNotificationRead = useCallback(async (notifId) => {
    try {
      await api.markNotificationRead(notifId)
      setNotifications((prev) => prev.map((n) => String(n.id) === String(notifId) ? { ...n, read_at: new Date().toISOString() } : n))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch (err) {
      // ignore
    }
  }, [])

  // Poll unread count every 30s when authenticated
  useEffect(() => {
    if (!isWalletConnected) return
    loadUnreadCount()
    const interval = setInterval(loadUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [isWalletConnected, loadUnreadCount])

  // Wallet-shaped object for backward compatibility with existing pages
  const wallet = {
    address: walletAddress,
    displayName: user?.display_name || shortenAddress(walletAddress) || 'Not connected',
    email: user?.email || '',
    network: 'Arc Testnet',
    balance: 0, // balance comes from blockchain, not backend
  }

  const value = {
    user,
    wallet,
    walletAddress,
    isWalletConnected,
    isWalletBusy,
    authError,
    authLoading,
    connectWallet,
    disconnectWallet,
    jobs,
    jobsLoading,
    jobsError,
    loadJobs,
    loadOpenJobs,
    addJob,
    updateJob,
    refreshJob,
    applications,
    applicationsLoading,
    loadApplications,
    addApplication,
    updateApplication,
    acceptApplication,
    notifications,
    unreadCount,
    loadNotifications,
    loadUnreadCount,
    markNotificationRead,
    // Kept for pages that still reference it — remove after full migration
    demoWallets: [],
    switchWallet: () => { },
    resetDemo: () => { },
    fundJob: updateJob, // local state update after blockchain confirms
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
