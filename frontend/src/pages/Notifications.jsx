import { Bell, CheckCircle2 } from 'lucide-react'
import { useEffect } from 'react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import useApp from '../hooks/useApp'

export default function Notifications() {
    const { notifications, loadNotifications, markNotificationRead } = useApp()

    useEffect(() => { loadNotifications() }, [loadNotifications])

    return (
        <>
            <PageHeader
                eyebrow="Updates"
                title="Notifications"
                description="Stay up to date with your jobs, applications, and submissions."
            />
            {notifications.length ? (
                <div className="space-y-3">
                    {notifications.map((n) => (
                        <div
                            key={n.id}
                            className={`card flex items-start gap-4 p-4 sm:p-5 ${!n.read_at ? 'border-l-4 border-l-mint-500' : ''}`}
                        >
                            <Bell className={`mt-0.5 size-5 shrink-0 ${!n.read_at ? 'text-mint-500' : 'text-slate-400'}`} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-ink-950">{n.title}</p>
                                <p className="mt-1 text-sm text-slate-600">{n.message}</p>
                                <p className="mt-2 text-xs text-slate-400">
                                    {new Date(n.created_at).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </p>
                            </div>
                            {!n.read_at && (
                                <button
                                    type="button"
                                    onClick={() => markNotificationRead(n.id)}
                                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                    aria-label="Mark as read"
                                >
                                    <CheckCircle2 className="size-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={Bell}
                    title="No notifications yet"
                    description="You will receive notifications when applications are received, accepted, or work is submitted."
                />
            )}
        </>
    )
}
