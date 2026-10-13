import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
}

const STYLES = {
  success: 'border-emerald-200 bg-white',
  error:   'border-rose-200 bg-white',
  warning: 'border-amber-200 bg-white',
  info:    'border-slate-200 bg-white',
}

const ICON_STYLES = {
  success: 'text-emerald-500',
  error:   'text-rose-500',
  warning: 'text-amber-500',
  info:    'text-slate-400',
}

let idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t))
    // Remove from DOM after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 250)
  }, [])

  const toast = useCallback(({ title, message, variant = 'info', duration = 4500 }) => {
    const id = ++idCounter
    setToasts((prev) => [...prev, { id, title, message, variant, exiting: false }])

    if (duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration)
    }

    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}

      {/* Toast portal — bottom-right */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.variant] ?? Info
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-float ${
                t.exiting ? 'toast-exit' : 'toast-enter'
              } ${STYLES[t.variant]}`}
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${ICON_STYLES[t.variant]}`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                {t.title && <p className="text-sm font-bold text-slate-900">{t.title}</p>}
                {t.message && (
                  <p className={`text-sm text-slate-500 leading-5 ${t.title ? 'mt-0.5' : ''}`}>
                    {t.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * useToast — hook to fire toasts from any component.
 *
 * @example
 *   const { toast } = useToast()
 *   toast({ variant: 'success', title: 'Saved!', message: 'Your changes were saved.' })
 */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
