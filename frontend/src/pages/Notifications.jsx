import { Bell, CheckCheck } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import useApp from '../hooks/useApp'
import { api } from '../services/api'

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: days > 365 ? 'numeric' : undefined,
  })
}

const TONE = {
  job_created: 'bg-mint-50 text-mint-600 ring-mint-100',
  application_received: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  application_accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  application_rejected: 'bg-red-50 text-red-600 ring-red-100',
  work_submitted: 'bg-amber-50 text-amber-700 ring-amber-100',
  payment_released: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  default: 'bg-slate-100 text-slate-500 ring-slate-200',
}

function notifTone(n) {
  const type = (n.type || '').toLowerCase()
  return (
    Object.keys(TONE).find((k) => type.includes(k.replace('_', ''))) &&
    TONE[Object.keys(TONE).find((k) => type.includes(k.replace('_', '')))]
  ) || TONE.default
}

export default function Notifications() {
  const { notifications, loadNotifications, markNotificationRead } = useApp()

  useEffect(() => { loadNotifications() }, [loadNotifications])

  const handleMarkAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read_at)
    await Promise.all(unread.map((n) => api.markNotificationRead(n.id).catch(() => {})))
    loadNotifications()
  }, [notifications, loadNotifications])

  const unreadCount = notifications.filter((n) => !n.read_at).length

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        description="Updates on your jobs, applications, and submissions."
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="btn-secondary text-sm"
            >
              <CheckCheck className="size-4" />
              Mark all read
            </button>
          ) : null
        }
      />

      {notifications.length ? (
        <div className="space-y-2">
          {notifications.map((n) => {
            const unread = !n.read_at
            return (
              <div
                key={n.id}
                className={`card flex items-start gap-4 p-4 sm:p-5 transition duration-150 ${
                  unread
                    ? 'border-l-2 border-l-mint-500 bg-mint-50/30'
                    : 'opacity-80 hover:opacity-100'
                }`}
              >
                {/* Dot / icon */}
                <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ring-1 ${notifTone(n)}`}>
                  <Bell className="size-4" aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-sm font-bold ${unread ? 'text-ink-950' : 'text-slate-700'}`}>
                      {n.title}
                    </p>
                    <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                      {relativeTime(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500 leading-5">{n.message}</p>
                </div>

                {unread && (
                  <button
                    type="button"
                    onClick={() => markNotificationRead(n.id)}
                    className="shrink-0 self-center rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Mark as read"
                  >
                    <CheckCheck className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You'll be notified when applications come in, are accepted, or work is submitted."
        />
      )}
    </div>
  )
}
