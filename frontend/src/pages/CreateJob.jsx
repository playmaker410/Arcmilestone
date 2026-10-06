import { ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, CircleDollarSign, FileText, LoaderCircle, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import FormField from '../components/FormField'
import PageHeader from '../components/PageHeader'
import useApp from '../hooks/useApp'
import { api } from '../services/api'
import { checkSufficientBalance, createAndFundJobOpen, formatUnits } from '../services/blockchain'
import { formatUSDC } from '../utils/format'
import { pollJobForEscrowStatus } from '../utils/pollJob'

const initialForm = {
  title: '', description: '', skills: '',
  budget: '', applicationDeadline: '', deliveryDeadline: '',
}


const today = () => new Date().toISOString().slice(0, 10)

export default function CreateJob() {
  const navigate = useNavigate()
  const { wallet, walletAddress, isWalletConnected, connectWallet, addJob } = useApp()
  const addr = walletAddress || wallet.address
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [formAlert, setFormAlert] = useState('')
  const amount = Number(form.budget || 0)

  const validate = () => {
    const next = {}
    if (form.title.trim().length < 4) next.title = 'Enter a clear title with at least 4 characters.'
    if (form.description.trim().length < 30) next.description = 'Describe the scope in at least 30 characters.'
    if (!form.skills.trim()) next.skills = 'Add at least one required skill.'
    if (!amount || amount <= 0) next.budget = 'Enter a budget greater than 0 USDC.'
    if (!form.applicationDeadline) next.applicationDeadline = 'Choose an application deadline.'
    else if (new Date(`${form.applicationDeadline}T23:59:59`) < new Date()) next.applicationDeadline = 'Application deadline must be in the future.'
    if (!form.deliveryDeadline) next.deliveryDeadline = 'Choose a delivery deadline.'
    else if (new Date(`${form.deliveryDeadline}T23:59:59`) < new Date()) next.deliveryDeadline = ' Submission deadline must be in the future.'
    if (form.applicationDeadline && form.deliveryDeadline && form.applicationDeadline >= form.deliveryDeadline) next.applicationDeadline = 'Application deadline must be before the delivery deadline.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setFormAlert('')
  }

  const buildApiBody = () => ({
    title: form.title.trim(),
    description: form.description.trim(),
    required_skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
    budget: String(form.budget),
    application_deadline: new Date(`${form.applicationDeadline}T23:59:59Z`).toISOString(),
    delivery_deadline: new Date(`${form.deliveryDeadline}T23:59:59Z`).toISOString(),
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isWalletConnected) { setFormAlert('Connect your wallet before creating a job.'); return }
    if (!validate()) { setFormAlert('Please correct the highlighted fields before continuing.'); return }

    setSubmitting(true)
    setFormAlert('')
    try {
      // Step 1: pre-flight balance check before anything hits the backend.
      const budgetStr = String(form.budget)
      let balanceCheck
      try {
        balanceCheck = await checkSufficientBalance(addr, budgetStr)
      } catch {
        setFormAlert('Could not verify wallet balance. Make sure your wallet is connected to Arc Testnet and try again.')
        setSubmitting(false)
        return
      }
      if (!balanceCheck.sufficient) {
        const have = Number(formatUnits(balanceCheck.balance, 18)).toFixed(4)
        const need = Number(formatUnits(balanceCheck.required, 18)).toFixed(4)
        setFormAlert(`Insufficient balance. You need ${need} USDC but your wallet only has ${have} USDC on Arc Testnet.`)
        setSubmitting(false)
        return
      }

      // Step 2: create the job record in the backend DB.
      const job = await api.createJob(buildApiBody())
      // publishJob is a no-op (jobs start OPEN) but keeps the two-step flow intact.
      await api.publishJob(job.id)

      // Step 3: lock the funds on-chain. MetaMask will prompt here.
      // metadataHashInput uses the DB job ID so it ties this escrow to this record.
      let onChainResult
      try {
        onChainResult = await createAndFundJobOpen({
          deliveryDeadlineISO: new Date(`${form.deliveryDeadline}T23:59:59Z`).toISOString(),
          metadataHashInput: String(job.id),
          budgetString: budgetStr,
          clientAddress: addr,
        })
      } catch (chainErr) {
        // The user rejected the transaction or it failed.
        // Rollback the database job so we don't leave an unfunded ghost job.
        try {
          await api.deleteJob(job.id)
        } catch (rollbackErr) {
          console.error("Failed to delete job after blockchain error:", rollbackErr)
        }

        setFormAlert(`Transaction failed or cancelled. The job was not created.`)
        setSubmitting(false)
        return
      }

      // Step 4: poll until escrow_status appears.
      setFormAlert('Funding submitted. Waiting for blockchain confirmation...')
      let finalJob = job
      try {
        finalJob = await pollJobForEscrowStatus(job.id, 'any')
      } catch {
        // Non-fatal: tell the user it's just delayed
        alert('Your payment was successful, but the blockchain is taking longer than usual to confirm. The job status will update shortly.')
        finalJob = { ...job, blockchain_job_id: onChainResult.blockchainJobId }
      }

      addJob(finalJob)
      navigate(`/jobs/${job.id}`)
    } catch (err) {
      setFormAlert(err.message || 'Failed to create job. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Link to="/jobs" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" />Back to jobs
      </Link>
      <PageHeader eyebrow="New job" title="Create a Job" description="Post your job publicly and review freelancer applications." />
      {formAlert && <div className="mt-4"><Alert variant="error" onDismiss={() => setFormAlert('')}>{formAlert}</Alert></div>}
      <form id="create-job-form" onSubmit={handleSubmit} noValidate className="mt-6 grid items-start gap-6 xl:grid-cols-[1.32fr_.68fr]">
        <div className="card p-5 sm:p-7">
          <div className="grid gap-6">
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
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label="Budget in USDC" htmlFor="budget" required error={errors.budget}>
                {({ describedBy }) => (
                  <div className="relative">
                    <CircleDollarSign className="absolute top-3.5 left-3.5 size-4 text-slate-400" />
                    <input id="budget" type="number" name="budget" min="0" step="0.01" value={form.budget} onChange={handleChange} className={`field-input pr-16 pl-10 ${errors.budget ? 'field-input-error' : ''}`} placeholder="0.00" aria-invalid={Boolean(errors.budget)} aria-describedby={describedBy} />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold text-slate-500">USDC</span>
                  </div>
                )}
              </FormField>
              <FormField label="Application deadline" htmlFor="applicationDeadline" required error={errors.applicationDeadline}>
                {({ describedBy }) => (
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-slate-400" />
                    <input id="applicationDeadline" type="date" name="applicationDeadline" value={form.applicationDeadline} min={today()} onChange={handleChange} className={`field-input pl-10 ${errors.applicationDeadline ? 'field-input-error' : ''}`} aria-invalid={Boolean(errors.applicationDeadline)} aria-describedby={describedBy} />
                  </div>
                )}
              </FormField>
            </div>
            <FormField label="Submission deadline" htmlFor="deliveryDeadline" required error={errors.deliveryDeadline}>
              {({ describedBy }) => (
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-slate-400" />
                  <input id="deliveryDeadline" type="date" name="deliveryDeadline" value={form.deliveryDeadline} min={today()} onChange={handleChange} className={`field-input pl-10 ${errors.deliveryDeadline ? 'field-input-error' : ''}`} aria-invalid={Boolean(errors.deliveryDeadline)} aria-describedby={describedBy} />
                </div>
              )}
            </FormField>

          </div>
        </div>

        <aside className="card overflow-hidden xl:sticky xl:top-6" aria-label="Open job summary">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-mint-50 text-mint-600">
                <BriefcaseBusiness className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink-950">Job summary</h2>
                <p className="text-xs text-slate-500">USDC locked immediately on creation</p>
              </div>
            </div>
          </div>
          <dl className="space-y-4 p-5 text-sm sm:p-6">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Public budget</dt><dd className="font-bold">{formatUSDC(amount)}</dd></div>
          </dl>
          <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-6">
            <div className="flex items-start gap-3 text-xs leading-5 text-slate-600">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p>The budget will be locked in escrow on-chain when you post. You select a freelancer from applications after posting.</p>
            </div>
            <button type="submit" disabled={submitting} className="btn-dark mt-5 w-full">
              {submitting ? <><LoaderCircle className="size-4 animate-spin" />Locking funds…</> : <>Post Job &amp; Lock Funds <ArrowRight className="size-4" /></>}
            </button>
            {!isWalletConnected && (
              <button type="button" onClick={connectWallet} className="mt-3 w-full text-center text-xs font-bold text-mint-600 hover:underline">Connect wallet first</button>
            )}
          </div>
        </aside>
      </form>
    </>
  )
}
