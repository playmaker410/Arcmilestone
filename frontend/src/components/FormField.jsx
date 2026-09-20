export default function FormField({ label, htmlFor, description, error, required, children }) {
  const descriptionId = description ? `${htmlFor}-description` : undefined
  const errorId = error ? `${htmlFor}-error` : undefined

  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-800">
        {label} {required && <span className="text-rose-500" aria-hidden="true">*</span>}
        {required && <span className="sr-only">(required)</span>}
      </label>
      {typeof children === 'function' ? children({ describedBy: [descriptionId, errorId].filter(Boolean).join(' ') || undefined }) : children}
      {description && <p id={descriptionId} className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>}
      {error && <p id={errorId} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600">{error}</p>}
    </div>
  )
}
