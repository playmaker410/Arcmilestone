import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

const variants = {
  info: { icon: Info, className: 'border-cyan-200 bg-cyan-50 text-cyan-900', iconClass: 'text-cyan-600' },
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-900', iconClass: 'text-emerald-600' },
  warning: { icon: TriangleAlert, className: 'border-amber-200 bg-amber-50 text-amber-950', iconClass: 'text-amber-600' },
  error: { icon: AlertCircle, className: 'border-rose-200 bg-rose-50 text-rose-900', iconClass: 'text-rose-600' },
}

export default function Alert({ variant = 'info', title, children, onDismiss }) {
  const config = variants[variant]
  const Icon = config.icon
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-3.5 text-sm ${config.className}`}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${config.iconClass}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={`${title ? 'mt-1' : ''} leading-5 opacity-90`}>{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="self-start rounded-md p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100" aria-label="Dismiss alert">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
