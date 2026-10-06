import { AtSign, Bell, CheckCircle2, LoaderCircle, Mail, Monitor, Save, ShieldCheck, UserRound, WalletCards } from 'lucide-react'
import { useState } from 'react'
import Alert from '../components/Alert'
import FormField from '../components/FormField'
import PageHeader from '../components/PageHeader'
import WalletBadge from '../components/WalletBadge'
import useApp from '../hooks/useApp'
import { api } from '../services/api'

/**
 * Username validation rules — kept consistent with UsernameSetupModal.
 * The Settings page lets users change their username after initial setup,
 * so the same rules must apply.
 */
const USERNAME_MIN = 3
const USERNAME_MAX = 20
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'support', 'help', 'arcmilestone',
  'arc', 'system', 'moderator', 'mod', 'staff', 'official',
  'root', 'superuser', 'null', 'undefined',
])

/**
 * Validate a username string.
 * @param {string} value
 * @returns {string} Error message, or '' when valid.
 */
function validateUsername(value) {
  if (!value) return 'Username is required.'
  if (value.length < USERNAME_MIN) return `Must be at least ${USERNAME_MIN} characters.`
  if (value.length > USERNAME_MAX) return `Cannot exceed ${USERNAME_MAX} characters.`
  if (!USERNAME_PATTERN.test(value)) return 'Only letters, numbers, and underscores are allowed.'
  if (RESERVED_USERNAMES.has(value.toLowerCase())) return 'That username is reserved.'
  return ''
}

export default function Settings() {
  const { wallet, user, setUserUsername } = useApp()

  const [form, setForm] = useState({
    /**
     * Seed the username field from user.username (the unique identity) with a
     * fallback to an empty string so the field starts blank for new users who
     * skipped the setup modal (edge case).
     *
     * display_name is intentionally removed — username is now the single
     * human-friendly, unique identifier on the platform.
     */
    username: user?.username || '',
    email: user?.email || wallet.email || '',
    appearance: 'system',
    jobUpdates: true,
    transactionUpdates: true,
    productNews: false,
  })

  /** Per-field validation error for the username input. */
  const [usernameError, setUsernameError] = useState('')

  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const handleChange = (event) => {
    const { name, value, checked, type } = event.target
    const nextValue = type === 'checkbox' ? checked : value

    // Live-validate the username field as the user types
    if (name === 'username') {
      // Strip spaces immediately (same behaviour as UsernameSetupModal)
      const stripped = String(nextValue).replace(/\s/g, '')
      setForm((current) => ({ ...current, username: stripped }))
      setUsernameError(validateUsername(stripped))
    } else {
      setForm((current) => ({ ...current, [name]: nextValue }))
    }

    setSaved(false)
    setSaveError('')
  }

  const handleSave = async (event) => {
    event.preventDefault()

    // Re-validate before submitting
    const err = validateUsername(form.username)
    if (err) { setUsernameError(err); return }

    setSaving(true)
    setSaveError('')
    try {
      /**
       * BACKEND REQUIRED:
       *   PATCH /api/users/me
       *   Body: { "username": "<value>", "email": "<value>" }
       *
       *   The backend must:
       *     1. Enforce UNIQUE on users.username so a race-condition takeover
       *        is impossible — return HTTP 409 with an informative error message.
       *     2. Apply the same 3-20 chars / letters+digits+underscore validation
       *        as a secondary guard (frontend validation is UX, not security).
       *
       *   api.updateMyProfile is used here because it calls PATCH /api/users/me
       *   which is the same endpoint api.setUsername targets.  Both are wired
       *   to the same backend handler — only the request body differs.
       */
      await api.updateMyProfile({
        username: form.username.trim() || null,
        email: form.email.trim() || null,
      })

      // Sync the username change into local context so the Sidebar and
      // Overview immediately reflect the updated handle without a page reload.
      if (setUserUsername && form.username.trim()) {
        setUserUsername(form.username.trim())
      }

      setSaved(true)
      window.setTimeout(() => setSaved(false), 3500)
    } catch (err) {
      setSaveError(err.message || 'Failed to save preferences.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" description="Manage your profile, notifications, wallet display, and appearance." />
      {saved && (
        <div className="mb-5">
          <Alert variant="success" title="Preferences saved">Your settings have been updated.</Alert>
        </div>
      )}
      {saveError && (
        <div className="mb-5">
          <Alert variant="error" onDismiss={() => setSaveError('')}>{saveError}</Alert>
        </div>
      )}
      <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-6">
          <section className="card p-5 sm:p-6" aria-labelledby="profile-heading">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="grid size-10 place-items-center rounded-xl bg-mint-50 text-mint-600"><UserRound className="size-5" /></span>
              <div>
                <h2 id="profile-heading" className="font-display text-lg font-bold text-ink-950">Profile</h2>
                <p className="text-xs text-slate-500">Used to personalize your workspace</p>
              </div>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {/*
               * Username field — replaces the old "Display name" field.
               *
               * The @ icon prefix visually matches the UsernameSetupModal so
               * the design language for usernames is consistent across the app.
               *
               * Inline validation error is passed to FormField so it renders
               * with the red helper text and accessible aria-describedby link.
               */}
              <FormField
                label="Username"
                htmlFor="username"
                description={`${USERNAME_MIN}–${USERNAME_MAX} chars · letters, numbers, underscores`}
                error={usernameError}
              >
                {({ describedBy }) => (
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5"
                      aria-hidden="true"
                    >
                      <AtSign className="size-4 text-slate-400" />
                    </span>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      spellCheck={false}
                      maxLength={USERNAME_MAX}
                      value={form.username}
                      onChange={handleChange}
                      className={`field-input pl-9 ${usernameError ? 'field-input-error' : ''}`}
                      aria-describedby={describedBy}
                    />
                  </div>
                )}
              </FormField>
              <FormField label="Email address" htmlFor="email" description="Used for notification preferences.">
                {({ describedBy }) => (
                  <div className="relative">
                    <Mail className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                    <input id="email" type="email" name="email" value={form.email} onChange={handleChange} className="field-input pl-10" aria-describedby={describedBy} />
                  </div>
                )}
              </FormField>
            </div>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="notifications-heading">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><Bell className="size-5" /></span>
              <div>
                <h2 id="notifications-heading" className="font-display text-lg font-bold text-ink-950">Notifications</h2>
                <p className="text-xs text-slate-500">Choose the updates you want to receive</p>
              </div>
            </div>
            <div className="mt-2 divide-y divide-slate-100">
              {[
                { name: 'jobUpdates', title: 'Job activity', description: 'Funding, submissions, approvals, and refunds.' },
                { name: 'transactionUpdates', title: 'Transaction updates', description: 'Status changes for wallet transactions.' },
                { name: 'productNews', title: 'Product announcements', description: 'Occasional feature and network updates.' },
              ].map((item) => (
                <label key={item.name} className="flex cursor-pointer items-center justify-between gap-4 py-4">
                  <span>
                    <span className="block text-sm font-bold text-slate-800">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                  </span>
                  <span className="relative shrink-0">
                    <input type="checkbox" name={item.name} checked={form[item.name]} onChange={handleChange} className="peer sr-only" />
                    <span className="block h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-mint-500 peer-focus-visible:ring-4 peer-focus-visible:ring-mint-500/20" />
                    <span className="absolute top-1 left-1 size-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5 sm:p-6" aria-labelledby="wallet-heading">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><WalletCards className="size-5" /></span>
              <div>
                <h2 id="wallet-heading" className="font-display text-lg font-bold text-ink-950">Connected wallet</h2>
                <p className="text-xs text-slate-500">{wallet.network}</p>
              </div>
            </div>
            <div className="mt-5"><WalletBadge address={wallet.address} className="w-full justify-between py-2.5" /></div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Your wallet address is public account information. ArcMilestone will never request a private key or seed phrase.</p>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="appearance-heading">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Monitor className="size-5" /></span>
              <div>
                <h2 id="appearance-heading" className="font-display text-lg font-bold text-ink-950">Appearance</h2>
                <p className="text-xs text-slate-500">Choose your interface preference</p>
              </div>
            </div>
            <FormField label="Color theme" htmlFor="appearance" description="Theme selection is saved as a preference.">
              <select id="appearance" name="appearance" value={form.appearance} onChange={handleChange} className="field-input mt-5">
                <option value="system">Use system setting</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </FormField>
          </section>

          <Alert variant="info" title="Security reminder">
            <span className="inline-flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              We will never ask you to enter a private key or recovery phrase.
            </span>
          </Alert>

          <button type="submit" disabled={saving} className="btn-dark w-full">
            {saving ? <><LoaderCircle className="size-4 animate-spin" />Saving…</> : <><Save className="size-4" />Save Preferences</>}
          </button>
          {saved && (
            <p className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="size-4" />Changes saved
            </p>
          )}
        </div>
      </form>
    </>
  )
}
