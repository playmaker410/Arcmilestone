import { ArrowUpRight, BriefcaseBusiness, CalendarDays, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import useApp from '../hooks/useApp'
import { hasApplicationDeadlinePassed } from '../utils/permissions'
import { formatDate, formatUSDC } from '../utils/format'

const ranges = [
  { value: 'all', label: 'Any budget' },
  { value: 'under-100', label: 'Under 100 USDC' },
  { value: '100-250', label: '100–250 USDC' },
  { value: 'over-250', label: 'Over 250 USDC' },
]

// Safely parse required_skills — backend returns a JSON array or null
function getSkills(job) {
  const raw = job.required_skills || job.requiredSkills
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export default function ExploreJobs() {
  const { jobs, jobsLoading, loadOpenJobs } = useApp()
  const [query, setQuery] = useState('')
  const [range, setRange] = useState('all')
  const [skill, setSkill] = useState('all')

  useEffect(() => { loadOpenJobs() }, [loadOpenJobs])

  // Backend returns only open jobs from GET /api/jobs — filter defensively
  const openJobs = useMemo(() => jobs.filter((job) => {
    const hiringMethod = job.hiring_method || job.hiringMethod
    const marketplaceStatus = (job.marketplace_status || job.marketplaceStatus || '').toLowerCase()
    if (hiringMethod !== 'open' || marketplaceStatus !== 'open' || hasApplicationDeadlinePassed(job)) return false
    const skills = getSkills(job)
    const amount = Number(job.budget)
    const matchesQuery = `${job.title} ${skills.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const matchesSkill = skill === 'all' || skills.includes(skill)
    const matchesRange =
      range === 'all' ||
      (range === 'under-100' && amount < 100) ||
      (range === '100-250' && amount >= 100 && amount <= 250) ||
      (range === 'over-250' && amount > 250)
    return matchesQuery && matchesSkill && matchesRange
  }), [jobs, query, range, skill])

  const allSkills = useMemo(() =>
    [...new Set(jobs.filter((j) => (j.hiring_method || j.hiringMethod) === 'open').flatMap(getSkills))].sort(),
    [jobs]
  )

  return (
    <>
      <PageHeader eyebrow="Job marketplace" title="Explore Jobs" description="Discover open opportunities and apply without moving funds on-chain." />
      <div className="card mb-6 grid gap-3 p-4 md:grid-cols-[1fr_210px_210px]">
        <label className="relative">
          <span className="sr-only">Search by job title or skill</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="field-input pl-9" placeholder="Search title or skill" />
        </label>
        <label>
          <span className="sr-only">Filter by budget</span>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="field-input">
            {ranges.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by required skill</span>
          <select value={skill} onChange={(e) => setSkill(e.target.value)} className="field-input">
            <option value="all">All skills</option>
            {allSkills.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      {jobsLoading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading jobs…</div>
      ) : openJobs.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {openJobs.map((job) => {
            const skills = getSkills(job)
            const appDeadline = job.application_deadline || job.applicationDeadline
            const deliveryDeadline = job.delivery_deadline || job.deliveryDeadline
            return (
              <article key={job.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold tracking-wide text-slate-400 uppercase">#{job.id}</p>
                  <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-800 ring-1 ring-cyan-200">Open for Applications</span>
                </div>
                <h2 className="mt-3 font-display text-lg font-bold text-ink-950">{job.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{job.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {skills.map((item) => <span key={item} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{item}</span>)}
                </div>
                <p className="mt-5 font-display text-2xl font-bold text-ink-950">{formatUSDC(job.budget)}</p>
                <p className="mt-2 text-xs text-slate-500">Posted by user #{job.creator_user_id}</p>
                <dl className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                  {appDeadline && (
                    <div>
                      <dt className="font-semibold text-slate-400">Apply by</dt>
                      <dd className="mt-1 flex items-center gap-1.5 font-bold"><CalendarDays className="size-3.5" />{formatDate(appDeadline)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="font-semibold text-slate-400">Delivery</dt>
                    <dd className="mt-1 font-bold">{formatDate(deliveryDeadline)}</dd>
                  </div>
                </dl>
                <Link to={`/jobs/${job.id}`} className="btn-secondary mt-5 w-full">View Job <ArrowUpRight className="size-4" /></Link>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No open jobs match"
          description="Try clearing the search or changing a filter. Expired and non-open jobs are not shown here."
          action={<button type="button" className="btn-secondary" onClick={() => { setQuery(''); setRange('all'); setSkill('all') }}>Clear filters</button>}
        />
      )}
    </>
  )
}
