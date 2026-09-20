import { ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleDollarSign, FileText, Link2, LoaderCircle, LockKeyhole, ShieldAlert, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import FormField from '../components/FormField'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import WalletBadge from '../components/WalletBadge'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { fundEscrow } from '../services/blockchain'
import { formatUSDC, shortenAddress } from '../utils/format'
import { sameAddress } from '../utils/permissions'

const initialForm = {
  hiringMethod: 'open', title: '', description: '', skills: '', freelancerWallet: '',
  budget: '', applicationDeadline: '', deliveryDeadline: '', referenceUrl: '',
}

const isWalletAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(value)
const isValidUrl = (value) => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) } catch { return false }
}
const today = () => new Date().toISOString().slice(0, 10)

export default function CreateJob() {
  const navigate = useNavigate()
  const { wallet, walletAddress, isWalletConnected, connectWallet, addJob } = useApp()
  const addr = walletAddress || wallet.address
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)
  const [formAlert, setFormAlert] = useState('')
  const amount = Number(form.budget || 0)

  const validate = () => {
    const next = {}
    if (form.title.trim().length < 4) next.title = 'Enter a clear title with at least 4 characters.'
    if (form.description.trim().length < 30) next.description = 'Describe the scope in at least 30 characters.'
    if (!form.skills.trim()) next.skills = 'Add at least one required skill.'
    if (!amount || amount <= 0) next.budget = 'Enter a budget greater than 0 USDC.'
    if (!form.deliveryDeadline) next.deliveryDeadline = 'Choose a delivery deadline.'
    else if (new Date(`${form.deliveryDeadline}T23:59:59`) < new Date()) next.deliveryDeadline = 'Delivery deadline must be in the future.'
    if (form.hiringMethod === 'open') {
      if (!form.applicationDeadline) next.applicationDeadline = 'Choose an application deadline.'
      else if (new Date(`${form.applicationDeadline}T23:59:59`) < new Date()) next.applicationDeadline = 'Application deadline must be in the future.'
      if (form.applicationDeadline && form.deliveryDeadline && form.applicationDeadline >= form.deliveryDeadline) next.applicationDeadline = 'Application deadline must be before the delivery deadline.'
    }
    if (form.hiringMethod === 'direct') {
      if (!isWalletAddress(form.freelancerWallet.trim())) next.freelancerWallet = 'Enter a valid 42-character EVM wallet address beginning with 0x.'
      else if (sameAddress(form.freelancerWallet, addr)) next.freelancerWallet = 'You cannot hire the currently connected wallet.'
    }
    if (form.referenceUrl && !isValidUrl(form.referenceUrl)) next.referenceUrl = 'Enter a complete http:// or https:// URL.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setFormAlert('')
  }

  const buildApiBody = () => {
    const body = {
      hiring_method: form.hiringMethod,
      title: form.title.trim(),
      description: form.description.trim(),
      required_skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
      budget: String(form.budget),
      delivery_deadline: new Date(`${form.deliveryDeadline}T23:59:59Z`).toISOString(),
    }
    if (form.hiringMethod === 'open' && form.applicationDeadline) {
      body.application_deadline = new Date(`${form.applicationDeadline}T23:59:59Z`).toISOString()
    }
    if (form.referenceUrl.trim()) body.reference_url = form.referenceUrl.trim()
    if (form.hiringMethod === 'direct' && form.freelancerWallet.trim()) {
      body.freelancer_wallet = form.freelancerWallet.trim()
    }
    return body
  }

  // Open job: create → publish → navigate to job page
  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isWalletConnected) { setFormAlert('Connect your wallet before creating a job.'); return }
    if (!validate()) { setFormAlert('Please correct the highlighted fields before continuing.'); return }
    if (form.hiringMethod === 'direct') { setConfirmOpen(true); return }

    setSubmitting(true)
    setFormAlert('')
    try {
      const job = await api.createJob(buildApiBody())
      const published = await api.publishJob(job.id)
      addJob(published)
      navigate(`/jobs/${published.id}`)
    } catch (err) {
      setFormAlert(err.message || 'Failed to create job. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Direct hire: create → publish → fund blockchain escrow
  const handleDirectConfirm = async () => {
    setSubmitting(true)
    try {
      // 1. Create draft job on backend
      const job = await api.createJob(buildApiBody())
      // 2. Publish it (draft → open/awaiting_funding)
      const published = await api.publishJob(job.id)
      addJob(published)

      // 3. Attempt blockchain funding
      let blockchainResult = null
      try {
        blockchainResult = await fundEscrow({
          freelancerAddress: form.freelancerWallet.trim(),
          deliveryDeadlineISO: new Date(`${form.deliveryDeadline}T23:59:59Z`).toISOString(),
          metadataHashInput: String(published.id),
          budgetString: String(form.budget),
          clientAddress: addr,
        })
      } catch (chainErr) {
        // Blockchain not available (no contract address or wallet error)
        // Still show success — job is created on backend, blockchain pending
        setSuccess({
          job: published,
          blockchainError: chainErr.message,
          transactionHash: null,
          blockchainJobId: null,
        })
        setConfirmOpen(false)
        setSubmitting(false)
        return
      }

      setSuccess({
        job: published,
        transactionHash: blockchainResult.transactionHash,
        blockchainJobId: blockchainResult.blockchainJobId,
        blockchainError: null,
      })
      setConfirmOpen(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setConfirmOpen(false)
      setFormAlert(err.message || 'The transaction could not be completed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) return (
    <div className="mx-auto max-w-2xl pt-8 text-center sm:pt-14">
      <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="size-8" />
      </span>
      <p className="eyebrow mt-6">{success.job.hiring_method === 'open' ? 'Open job posted' : 'Direct hire created'}</p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink-950">
        {success.job.hiring_method === 'open' ? 'Ready for applications' : 'Job created successfully'}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-600">
        {success.job.hiring_method === 'open'
          ? 'Your job is now open for applications. No USDC has been locked yet. You will fund the escrow after selecting a freelancer.'
          : success.blockchainError
            ? `Job created on backend. Blockchain escrow could not be funded: ${success.blockchainError}`
            : 'Job created and blockchain escrow funded successfully.'}
      </p>
      <div className="card mt-8 p-5 text-left">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-slate-400 uppercase">Job ID</p>
            <p className="mt-1 font-display text-lg font-bold text-ink-950">#{success.job.id}</p>
          </div>
          <p className="font-display text-xl font-bold text-ink-950">{formatUSDC(success.job.budget)}</p>
        </div>
        {success.job.selected_freelancer_wallet && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <WalletBadge address={success.job.selected_freelancer_wallet} label="Freelancer" />
          </div>
        )}
        {success.transactionHash && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-400">Transaction hash</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-600">{success.transactionHash}</p>
            {success.blockchainJobId && (
              <p className="mt-2 text-xs text-slate-500">On-chain Job ID: <strong>{success.blockchainJobId}</strong></p>
            )}
          </div>
        )}
      </div>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to={`/jobs/${success.job.id}`} className="btn-dark">View Job <ArrowRight className="size-4" /></Link>
        <button type="button" onClick={() => { setForm(initialForm); setSuccess(null); setErrors({}) }} className="btn-secondary">Create Another</button>
      </div>
    </div>
  )

  return (
    <>
      <Link to="/jobs" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" />Back to jobs
      </Link>
      <PageHeader eyebrow="New job" title="Create a Job" description="Choose how you want to hire, then define the scope and payment." />
      {formAlert && <div className="mt-4"><Alert variant="error" onDismiss={() => setFormAlert('')}>{formAlert}</Alert></div>}
      <form id="create-job-form" onSubmit={handleSubmit} noValidate className="mt-6 grid items-start gap-6 xl:grid-cols-[1.32fr_.68fr]">
        <div className="card p-5 sm:p-7">
          <fieldset>
            <legend className="font-display text-lg font-bold text-ink-950">How would you like to hire?</legend>
            <p className="mt-1 text-sm text-slate-500">Choose a marketplace post or assign a freelancer you already know.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { value: 'open', title: 'Open for Applications', description: 'Post the job publicly and review freelancer applications.', icon: Users },
                { value: 'direct', title: 'Direct Hire', description: 'Assign the job to a freelancer whose wallet address you already know.', icon: UserRound },
              ].map(({ value, title, description, icon: Icon }) => (
                <label key={value} className={`relative cursor-pointer rounded-2xl border p-4 transition ${form.hiringMethod === value ? 'border-mint-500 bg-mint-50 ring-2 ring-mint-500/15' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="hiringMethod" value={value} checked={form.hiringMethod === value} onChange={handleChange} className="sr-only" />
                  <span className="flex items-start gap-3">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${form.hiringMethod === value ? 'bg-mint-500 text-ink-950' : 'bg-slate-100 text-slate-600'}`}>
                      <Icon className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-ink-950">{title}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">{description}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-7 grid gap-6 border-t border-slate-100 pt-7">
            <FormField label="Job title" htmlFor="title" required error={errors.title}>
              <div className="relative">
                <FileText className="absolute top-3.5 left-3.5 size-4 text-slate-400" />
                <input id="title" name="title" value={form.title} onChange={handleChange} className={`field-input pl-10 ${errors.title ? 'field-input-error' : ''}`} placeholder="e.g. Build a responsive pricing page" aria-invalid={Boolean(errors.title)} />
              </div>
            </FormField>
            <FormField label="Job description" htmlFor="description" required error={errors.description} description="Include deliverables, review criteria, and constraints.">
              {({ describedBy }) => <textarea id="description" name="description" value={form.description} onChange={handleChange} rows={6} className={`field-input resize-y ${errors.description ? 'field-input-error' : ''}`} placeholder="Describe the work and expected outcome…" aria-invalid={Boolean(errors.description)} aria-describedby={describedBy} />}
            </FormField>
            <FormField label="Required skills" htmlFor="skills" required error={errors.skills} description="Separate skills with commas.">
              {({ describedBy }) => <input id="skills" name="skills" value={form.skills} onChange={handleChange} className={`field-input ${errors.skills ? 'field-input-error' : ''}`} placeholder="React, Tailwind CSS, Accessibility" aria-invalid={Boolean(errors.skills)} aria-describedby={describedBy} />}
            </FormField>
            {form.hiringMethod === 'direct' && (
              <FormField label="Freelancer wallet address" htmlFor="freelancerWallet" required error={errors.freelancerWallet} description="The connected client wallet cannot be used as the freelancer.">
                {({ describedBy }) => (
                  <div className="relative">
                    <UserRound className="absolute top-3.5 left-3.5 size-4 text-slate-400" />
                    <input id="freelancerWallet" name="freelancerWallet" value={form.freelancerWallet} onChange={handleChange} className={`field-input pl-10 font-mono text-xs ${errors.freelancerWallet ? 'field-input-error' : ''}`} placeholder="0x0000000000000000000000000000000000000000" aria-invalid={Boolean(errors.freelancerWallet)} aria-describedby={describedBy} spellCheck="false" />
                  </div>
                )}
              </FormField>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label={form.hiringMethod === 'direct' ? 'Payment amount in USDC' : 'Budget in USDC'} htmlFor="budget" required error={errors.budget}>
                {({ describedBy }) => (
                  <div className="relative">
                    <CircleDollarSign className="absolute top-3.5 left-3.5 size-4 text-slate-400" />
                    <input id="budget" type="number" name="budget" min="0" step="0.01" value={form.budget} onChange={handleChange} className={`field-input pr-16 pl-10 ${errors.budget ? 'field-input-error' : ''}`} placeholder="0.00" aria-invalid={Boolean(errors.budget)} aria-describedby={describedBy} />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold text-slate-500">USDC</span>
                  </div>
                )}
              </FormField>
              {form.hiringMethod === 'open' && (
                <FormField label="Application deadline" htmlFor="applicationDeadline" required error={errors.applicationDeadline}>
                  {({ describedBy }) => (
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-slate-400" />
                      <input id="applicationDeadline" type="date" name="applicationDeadline" value={form.applicationDeadline} min={today()} onChange={handleChange} className={`field-input pl-10 ${errors.applicationDeadline ? 'field-input-error' : ''}`} aria-invalid={Boolean(errors.applicationDeadline)} aria-describedby={describedBy} />
                    </div>
                  )}
                </FormField>
              )}
            </div>
            <FormField label="Delivery deadline" htmlFor="deliveryDeadline" required error={errors.deliveryDeadline}>
              {({ describedBy }) => (
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-slate-400" />
                  <input id="deliveryDeadline" type="date" name="deliveryDeadline" value={form.deliveryDeadline} min={today()} onChange={handleChange} className={`field-input pl-10 ${errors.deliveryDeadline ? 'field-input-error' : ''}`} aria-invalid={Boolean(errors.deliveryDeadline)} aria-describedby={describedBy} />
                </div>
              )}
            </FormField>
            <FormField label="Optional reference URL" htmlFor="referenceUrl" error={errors.referenceUrl}>
              {({ describedBy }) => (
                <div className="relative">
                  <Link2 className="absolute top-3.5 left-3.5 size-4 text-slate-400" />
                  <input id="referenceUrl" type="url" name="referenceUrl" value={form.referenceUrl} onChange={handleChange} className={`field-input pl-10 ${errors.referenceUrl ? 'field-input-error' : ''}`} placeholder="https://example.com/project-brief" aria-invalid={Boolean(errors.referenceUrl)} aria-describedby={describedBy} />
                </div>
              )}
            </FormField>
          </div>
        </div>

        <aside className="card overflow-hidden xl:sticky xl:top-6" aria-label={form.hiringMethod === 'direct' ? 'Escrow summary' : 'Open job summary'}>
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-mint-50 text-mint-600">
                {form.hiringMethod === 'direct' ? <LockKeyhole className="size-5" /> : <BriefcaseBusiness className="size-5" />}
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink-950">{form.hiringMethod === 'direct' ? 'Escrow summary' : 'Open job summary'}</h2>
                <p className="text-xs text-slate-500">{form.hiringMethod === 'direct' ? 'Review before funding' : 'No USDC locked at posting'}</p>
              </div>
            </div>
          </div>
          <dl className="space-y-4 p-5 text-sm sm:p-6">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">{form.hiringMethod === 'direct' ? 'Escrow amount' : 'Public budget'}</dt><dd className="font-bold">{formatUSDC(amount)}</dd></div>
            {form.hiringMethod === 'direct' && (
              <>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Network</dt><dd className="font-bold">Arc Testnet</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Estimated network fee</dt><dd className="text-right font-bold">≈ 0.001 ARC<span className="block text-[10px] font-normal text-slate-400">Estimate only</span></dd></div>
              </>
            )}
          </dl>
          <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-6">
            <div className="flex items-start gap-3 text-xs leading-5 text-slate-600">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p>{form.hiringMethod === 'direct' ? 'Blockchain transactions cannot be reversed. Verify the wallet, amount, and deadline before confirming.' : 'You will review applications and fund only after selecting a freelancer.'}</p>
            </div>
            <button type="submit" disabled={submitting} className="btn-dark mt-5 w-full">
              {submitting ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : <>{form.hiringMethod === 'open' ? 'Post Open Job' : 'Create and Fund Escrow'} <ArrowRight className="size-4" /></>}
            </button>
            {!isWalletConnected && (
              <button type="button" onClick={connectWallet} className="mt-3 w-full text-center text-xs font-bold text-mint-600 hover:underline">Connect wallet first</button>
            )}
          </div>
        </aside>
      </form>

      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="Confirm direct-hire escrow"
        description="Review before funding. This will send a real transaction on Arc Testnet."
        actions={
          <>
            <button type="button" onClick={() => setConfirmOpen(false)} disabled={submitting} className="btn-secondary">Go Back</button>
            <button type="button" onClick={handleDirectConfirm} disabled={submitting} className="btn-dark">
              {submitting ? <><LoaderCircle className="size-4 animate-spin" />Processing…</> : <><LockKeyhole className="size-4" />Create and Fund Escrow</>}
            </button>
          </>
        }
      >
        <dl className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Client wallet</dt><dd className="font-mono text-xs">{shortenAddress(addr, 8, 6)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Freelancer wallet</dt><dd className="font-mono text-xs">{shortenAddress(form.freelancerWallet, 8, 6)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">USDC amount</dt><dd className="font-bold">{formatUSDC(amount)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Delivery deadline</dt><dd className="font-bold">{form.deliveryDeadline}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Network</dt><dd className="font-bold">Arc Testnet</dd></div>
        </dl>
        <div className="mt-4">
          <Alert variant="warning">Blockchain transactions are irreversible. Verify the wallet, amount, and deadline before confirming.</Alert>
        </div>
      </Modal>
    </>
  )
}
