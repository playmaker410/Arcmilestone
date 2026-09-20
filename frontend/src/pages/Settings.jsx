import { Bell, CheckCircle2, LoaderCircle, Mail, Monitor, Save, ShieldCheck, UserRound, WalletCards } from 'lucide-react'
import { useState } from 'react'
import Alert from '../components/Alert'
import FormField from '../components/FormField'
import PageHeader from '../components/PageHeader'
import WalletBadge from '../components/WalletBadge'
import useApp from '../hooks/useApp'
import { api } from '../services/api'

export default function Settings() {
  const { wallet, user } = useApp()

  const [form, setForm] = useState({
    displayName: user?.display_name || wallet.displayName || '',
    email: user?.email || wallet.email || '',
    appearance: 'system',
    jobUpdates: true,
    transactionUpdates: true,
    productNews: false,
  })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const handleChange = (event) => {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    setSaved(false)
    setSaveError('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      await api.updateMyProfile({
        display_name: form.displayName.trim() || null,
        email: form.email.trim() || null,
      })
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
              <FormField label="Display name" htmlFor="displayName">
                {({ describedBy }) => <input id="displayName" name="displayName" value={form.displayName} onChange={handleChange} className="field-input" aria-describedby={describedBy} />}
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
